import React, { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Plane } from '@react-three/drei';
import * as THREE from 'three';
import type { PatchNode } from '../../types/patch';
import type { CollisionEvent } from '../../types/events';
import { MARBLE, GAMEPLAY, PLACEMENT, CAMERA, clampPlacement, effectiveSpawnCap } from '../../config/world';
import { isPlacementClick } from '../../config/experience';
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
  /** Monotonic counter bumped by App's handleClearAll. Every increment clears
   * the scene-owned board state (marbles, evictions, ripples) — the modules
   * themselves are cleared by App emptying `nodes`. */
  clearToken: number;
  followCamera: boolean;
}

// Scene — composition only. All gameplay state lives in the zustand store, so a
// collision re-renders only the hit module's flash (self-subscribed) and the
// display components, never the whole scene (REFACTORING_PLAN.md §0.5 P1/P2).
export const Scene = React.memo(
  ({
    nodes,
    onCollision,
    onNodeAdd,
    divineLightActive,
    marbleDropTrigger,
    clearToken,
    followCamera,
  }: SceneProps) => {
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
      // Adaptive quality (§7D): a struggling GPU (qualityTier 'low') gets a
      // reduced active-marble cap so it isn't also asked to render a full
      // spawnCap of overlapping bloom orbs. Read imperatively — addMarble is
      // called from event handlers and the frame loop, not render.
      const cap = effectiveSpawnCap(useGameStore.getState().qualityTier);
      const newMarble: MarbleState = {
        id: `marble-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        position,
      };
      const current = marblesRef.current;
      const evicting = evictingRef.current;

      // Hard safety clamp: eviction keeps the active count at the cap, but if it
      // ever stalls (a marble that refuses to settle) fall back to the old
      // instant slice so the array can't grow without bound.
      if (current.length >= cap + 4) {
        setMarbles([...current, newMarble].slice(-cap));
        return;
      }

      // Append the new marble unconditionally.
      setMarbles([...current, newMarble]);

      // At/over the cap, evict the oldest marble that isn't already evicting —
      // it begins its ascension fade (see <Marble evict>).
      const activeCount = current.reduce((n, m) => (evicting.includes(m.id) ? n : n + 1), 0);
      if (activeCount >= cap) {
        const oldest = current.find((m) => !evicting.includes(m.id));
        if (oldest) setEvictingIds([...evicting, oldest.id]);
      }
    };

    // Space-key marble drops and "Clear all" are processed in the frame loop
    // (not an effect) so state updates happen outside render.
    const processedDropTrigger = useRef(0);
    // Seeded with the mount-time value: re-entering from the Landing page
    // remounts this component with whatever token App is already holding, and
    // that must not read as a fresh clear.
    const processedClearToken = useRef(clearToken);
    useFrame(() => {
      if (marbleDropTrigger > processedDropTrigger.current) {
        processedDropTrigger.current = marbleDropTrigger;
        const x = (Math.random() - 0.5) * MARBLE.spawnSpreadX;
        addMarble([x, MARBLE.spawnHeight, 0]);
      }
      if (clearToken > processedClearToken.current) {
        processedClearToken.current = clearToken;
        // Everything the board owns goes at once. Unmounting the <Marble>s is
        // what keeps the shared marblePositions registry consistent — each
        // Marble deletes its own entry in its unmount cleanup, so no stale
        // Vector3 is left for CameraFlow to follow.
        setMarbles([]);
        setEvictingIds([]);
        setRipples([]);
        // Per-module collision cooldowns refer to nodes that no longer exist.
        collisionGateRef.current.clear();
        // Don't let a placement pulse from just before the clear replay over
        // the now-empty board.
        pulseRef.current = null;
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

    // In-flight pointer gesture on the placement plane (see PLACEMENT_GESTURE
    // in config/experience.ts). Written imperatively — a gesture must never
    // re-render the scene.
    const gestureRef = useRef<{
      pointerId: number;
      pointerType: string;
      startClientX: number;
      startClientY: number;
      /** Furthest the pointer has strayed from the press point, in CSS px. */
      movedPx: number;
      startTime: number;
    } | null>(null);

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      // Track the drag distance for the click-vs-drag decision below. Max
      // displacement (not final displacement) so an orbit that swings out and
      // comes back to the press point still counts as a drag.
      const gesture = gestureRef.current;
      if (gesture && e.pointerId === gesture.pointerId) {
        const moved = Math.hypot(e.clientX - gesture.startClientX, e.clientY - gesture.startClientY);
        if (moved > gesture.movedPx) gesture.movedPx = moved;
      }

      const { x, y } = clampPlacement(e.point.x, e.point.y);
      // Marble clicks get an extra floor beyond the shared clamp (below); the
      // hover preview mirrors it so it never shows the marble sinking under
      // where it will actually spawn.
      const selected = useGameStore.getState().selectedModuleType;
      const previewY = selected === 'marble' ? Math.max(y, MARBLE.spawnClickMinY) : y;
      pointerRef.current = { x, y: previewY, t: Date.now() };
    };

    // Pointer left the placement plane (or the canvas): hide the ghost, and
    // abandon any in-flight gesture — a press that wandered off the plane is a
    // drag, never a click.
    const handlePointerLeave = () => {
      pointerRef.current = null;
      gestureRef.current = null;
    };

    const handlePointerCancel = () => {
      gestureRef.current = null;
    };

    // Placement is a CLICK, not a press. r3f's stopPropagation only prunes
    // r3f's own intersection list — the DOM event still reaches
    // OrbitControls, which is listening for pointerdown on the same canvas
    // element — so placing on pointerdown littered the board with a module (or
    // a marble) at the start of every orbit/pan drag. pointerdown now only
    // opens a gesture; the decision happens on pointerup.
    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // Primary button only. Secondary/middle drags are OrbitControls' pan and
      // dolly gestures and must never place. (Touch and pen contacts also
      // report button 0.)
      if (e.button !== 0) {
        gestureRef.current = null;
        return;
      }
      gestureRef.current = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startClientX: e.clientX,
        startClientY: e.clientY,
        movedPx: 0,
        startTime: Date.now(),
      };
    };

    // Clicks on the vertical z=0 placement plane map directly to world x/y
    // (REFACTORING_PLAN.md P7); clamp into the play area via the same
    // clampPlacement helper the ghost preview uses, so what you saw is what
    // you get (diagnosis #2 "edge-clamp placements appear far from the
    // click").
    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || e.pointerId !== gesture.pointerId) return;

      // Include the release point itself: a drag whose only move events landed
      // off the plane would otherwise report zero movement.
      const movedPx = Math.max(
        gesture.movedPx,
        Math.hypot(e.clientX - gesture.startClientX, e.clientY - gesture.startClientY),
      );
      if (
        !isPlacementClick({
          pointerType: gesture.pointerType,
          movedPx,
          durationMs: Date.now() - gesture.startTime,
        })
      ) {
        return;
      }

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
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerCancel}
          visible={false}
        >
          {/* Explicit DoubleSide material. Without a material child three
              falls back to MeshBasicMaterial (side = FrontSide), and mesh
              raycasting back-face-culls FrontSide materials. PlaneGeometry
              faces +Z and this plane is unrotated, while CAMERA.orbit sets no
              azimuth limits — so once the camera was orbited behind the board
              (z < 0) the ray missed the plane entirely and placement plus the
              ghost preview silently stopped working. `visible={false}` keeps
              it invisible; raycasting ignores visibility. */}
          <meshBasicMaterial side={THREE.DoubleSide} />
        </Plane>

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
