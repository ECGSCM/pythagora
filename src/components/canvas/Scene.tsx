import React, { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Plane } from '@react-three/drei';
import type { PatchNode } from '../../types/patch';
import type { CollisionEvent } from '../../types/events';
import { MARBLE, GAMEPLAY, PLACEMENT, CAMERA, clampPlacement } from '../../config/world';
import { useGameStore } from '../../stores/gameStore';
import { useLiveCallback } from './hooks';
import { Ground } from './Ground';
import { Lights } from './Lights';
import { Modules } from './Modules';
import { Atmosphere } from './Atmosphere';
import { Marble } from './Marble';
import { Ripple } from './Ripple';
import { GhostPreview, type PlacementPoint } from './GhostPreview';
import {
  CompletionCelebration,
  ComboDisplay,
  PerfectRunIndicator,
  CameraFlow,
  AuroraPulse,
  PostFX,
} from './effects';
import type { CollisionHandler, MarbleState, Vec3 } from './types';

interface SceneProps {
  nodes: PatchNode[];
  /** Live audio channel: Physics3DCanvas passes an inline that calls
   * engine.triggerCollision. (The old App-level no-op forward is gone.) */
  onCollision?: CollisionHandler;
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  divineLightActive: boolean;
  marbleDropTrigger: number;
  followCamera: boolean;
}

// Scene — composition only. All gameplay state lives in the zustand store, so a
// collision re-renders only the hit module's flash (self-subscribed) and the
// display components, never the whole scene (REFACTORING_PLAN.md §0.5 P1/P2).
export const Scene = React.memo(
  ({ nodes, onCollision, onNodeAdd, divineLightActive, marbleDropTrigger, followCamera }: SceneProps) => {
    // Marbles + ripples stay in React state — they map to mounted components.
    const [marbles, setMarbles] = useState<MarbleState[]>([]);
    // Ids of marbles being evicted by the spawn cap: they're routed through the
    // normal ascension fade instead of being unmounted instantly, so a capped
    // spawn shrinks/fades the oldest orb (and still fires marbleCompleted via
    // onSettle) rather than snapping it out of existence.
    const [evictingIds, setEvictingIds] = useState<string[]>([]);
    const [ripples, setRipples] = useState<Array<{ id: string; position: Vec3; color: string }>>([]);

    // Mirror marble/eviction state in refs so addMarble — called from the frame
    // loop — can read the latest committed values synchronously.
    const marblesRef = useRef(marbles);
    marblesRef.current = marbles;
    const evictingRef = useRef(evictingIds);
    evictingRef.current = evictingIds;

    const addMarble = (position: Vec3) => {
      const newMarble: MarbleState = {
        id: `marble-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        position,
      };
      const current = marblesRef.current;
      const evicting = evictingRef.current;

      // Hard safety clamp: eviction keeps the active count at the cap, but if it
      // ever stalls (a marble that refuses to settle) fall back to the old
      // instant slice so the array can't grow without bound.
      if (current.length >= MARBLE.spawnCap + 4) {
        setMarbles([...current, newMarble].slice(-MARBLE.spawnCap));
        return;
      }

      // Append the new marble unconditionally.
      setMarbles([...current, newMarble]);

      // At/over the cap, evict the oldest marble that isn't already evicting —
      // it begins its ascension fade (see <Marble evict>).
      const activeCount = current.reduce((n, m) => (evicting.includes(m.id) ? n : n + 1), 0);
      if (activeCount >= MARBLE.spawnCap) {
        const oldest = current.find((m) => !evicting.includes(m.id));
        if (oldest) setEvictingIds([...evicting, oldest.id]);
      }
    };

    // Space-key marble drops are processed in the frame loop (not an effect) so
    // state updates happen outside render.
    const processedDropTrigger = useRef(0);
    useFrame(() => {
      if (marbleDropTrigger > processedDropTrigger.current) {
        processedDropTrigger.current = marbleDropTrigger;
        const x = (Math.random() - 0.5) * MARBLE.spawnSpreadX;
        addMarble([x, MARBLE.spawnHeight, 0]);
      }
    });

    // Ghost preview state (COMMERCIAL_GRADE_PLAN.md §7C): both refs are
    // written imperatively (never via setState) so hovering/placing never
    // re-renders Scene. pointerRef tracks the live (clamped) hover position;
    // pulseRef records the point of the last successful placement so the
    // ghost can pulse there instead of jumping to wherever the pointer has
    // since moved.
    const pointerRef = useRef<PlacementPoint | null>(null);
    const pulseRef = useRef<PlacementPoint | null>(null);

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      const { x, y } = clampPlacement(e.point.x, e.point.y);
      // Marble clicks get an extra floor beyond the shared clamp (below); the
      // hover preview mirrors it so it never shows the marble sinking under
      // where it will actually spawn.
      const selected = useGameStore.getState().selectedModuleType;
      const previewY = selected === 'marble' ? Math.max(y, MARBLE.spawnClickMinY) : y;
      pointerRef.current = { x, y: previewY, t: Date.now() };
    };

    const handlePointerLeave = () => {
      pointerRef.current = null;
    };

    // Clicks on the vertical z=0 placement plane map directly to world x/y
    // (REFACTORING_PLAN.md P7); clamp into the play area via the same
    // clampPlacement helper the ghost preview uses, so what you saw is what
    // you get (diagnosis #2 "edge-clamp placements appear far from the
    // click").
    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const { x, y } = clampPlacement(e.point.x, e.point.y);
      // Read the selection at event time — NOT from a prop. A prop can still
      // hold the previous render's value when a keyboard selection and an
      // immediate click land in the same tick; the store is the single
      // source of truth and this is always its latest value
      // (COMMERCIAL_GRADE_PLAN.md §7C "selection race", verified root cause).
      const selected = useGameStore.getState().selectedModuleType;
      if (selected === 'marble') {
        const spawnY = Math.max(y, MARBLE.spawnClickMinY);
        addMarble([x, spawnY, 0]);
        pulseRef.current = { x, y: spawnY, t: Date.now() };
      } else {
        onNodeAdd?.({ x, y, z: 0 });
        pulseRef.current = { x, y, t: Date.now() };
      }
    };

    // Per-module collision gate: sustained contact fires cannon collide events
    // every physics step; without a cooldown a resting marble machine-guns
    // sound/combo/ripples (REFACTORING_PLAN.md P5).
    const collisionGateRef = useRef<Map<string, number>>(new Map());

    // Stable so <Marble> memoization holds across ripple/marble state changes.
    const handleCollision = useLiveCallback((event: CollisionEvent) => {
      if (event.velocity < GAMEPLAY.minImpactVelocity) return;
      const lastHit = collisionGateRef.current.get(event.nodeId) ?? 0;
      if (event.timestamp - lastHit < GAMEPLAY.collisionCooldownMs) return;
      collisionGateRef.current.set(event.nodeId, event.timestamp);

      // Snapshot combo/unlock state BEFORE the store update, so ripple color
      // uses the pre-hit values (matches the old async-setState semantics).
      const { combo, unlocks, registerCollision } = useGameStore.getState();
      const preMultiplier = combo.multiplier;
      const preCount = combo.count;

      // Combo/unlock/stats/perfect-run/module-flash all live in the store now.
      registerCollision(event);

      // Trigger audio (engine.triggerCollision, via the inline from the shell).
      onCollision?.(event);

      // Ripple color based on the pre-hit multiplier/unlocks.
      let rippleColor: string;
      if (unlocks.goldenMode && preMultiplier >= 5) {
        rippleColor = GAMEPLAY.rippleGoldenColor;
      } else if (unlocks.rainbowRipples && preMultiplier >= 4) {
        const rainbow = GAMEPLAY.rippleRainbowColors;
        rippleColor = rainbow[preCount % rainbow.length];
      } else {
        rippleColor = GAMEPLAY.rippleStandardColors[Math.min(preMultiplier - 1, 4)];
      }

      const rippleId = `ripple-${Date.now()}-${Math.random()}`;
      setRipples((prev) =>
        [
          ...prev,
          {
            id: rippleId,
            position: [event.position.x, event.position.y + 0.1, event.position.z] as Vec3,
            color: rippleColor,
          },
        ].slice(-GAMEPLAY.rippleCap),
      );
    });

    const handleRippleComplete = (rippleId: string) => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    };

    // A marble reports itself done (rest / fell out / evicted) — remove it from
    // both the marble list and the eviction set, then celebrate.
    const handleMarbleSettle = useLiveCallback((id: string) => {
      setMarbles((prev) => (prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev));
      setEvictingIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : prev));
      useGameStore.getState().marbleCompleted();
    });

    return (
      <>
        <PerspectiveCamera makeDefault position={CAMERA.position} fov={CAMERA.fov} />
        {/* OrbitControls and CameraFlow fight over the camera, so only one is
            live at a time: Follow disables the orbit controls. */}
        <OrbitControls
          enabled={!followCamera}
          enablePan
          enableZoom
          enableRotate
          minDistance={CAMERA.orbit.minDistance}
          maxDistance={CAMERA.orbit.maxDistance}
          maxPolarAngle={CAMERA.orbit.maxPolarAngle}
          target={CAMERA.orbit.target}
        />
        <CameraFlow enabled={followCamera} />

        <Lights divineLightActive={divineLightActive} />

        <Ground />


        {/* Invisible interaction plane on the z=0 gameplay plane. */}
        <Plane
          args={PLACEMENT.planeArgs}
          position={PLACEMENT.planePosition}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          visible={false}
        />

        {/* Translucent preview of the selected module at the clamped
            placement position — see GhostPreview for the pulse/hide logic. */}
        <GhostPreview pointerRef={pointerRef} pulseRef={pulseRef} />

        <Modules nodes={nodes} />

        {marbles.map((marble) => (
          <Marble
            key={marble.id}
            id={marble.id}
            position={marble.position}
            evict={evictingIds.includes(marble.id)}
            onCollide={handleCollision}
            onSettle={handleMarbleSettle}
          />
        ))}

        {ripples.map((ripple) => (
          <Ripple
            key={ripple.id}
            position={ripple.position}
            color={ripple.color}
            onComplete={() => handleRippleComplete(ripple.id)}
          />
        ))}

        <CompletionCelebration />
        <ComboDisplay />
        <PerfectRunIndicator />
        <AuroraPulse />

        <Atmosphere />

        {/* Post-processing wraps the whole render; keep it last. */}
        <PostFX />
      </>
    );
  },
);
Scene.displayName = 'Scene';
