import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PatchNode } from '../../types/patch';
import { MODULES, MARBLE } from '../../config/world';
import { PALETTE } from '../../config/experience';
import { useGameStore } from '../../stores/gameStore';

/** A clamped placement-plane point, timestamped so consumers can tell how
 * stale it is without a React re-render. */
export interface PlacementPoint {
  x: number;
  y: number;
  t: number; // Date.now() when this point was recorded
}

// Confirm pulse duration on a successful placement (scale 1->1.3, fade out).
const PULSE_MS = 200;
const BASE_OPACITY = 0.25;

const DEG_TO_RAD = Math.PI / 180;

// Shared look for every mesh a ghost is made of (the spinner is three). The
// frame loop drives their opacity together by traversing the ghost group, so
// no per-material ref plumbing is needed.
const GhostMaterial = () => (
  <meshBasicMaterial color={PALETTE.moonlight} transparent opacity={BASE_OPACITY} depthWrite={false} />
);

/** Apply one opacity to every material under the ghost group. */
function setGhostOpacity(group: THREE.Group, value: number): void {
  group.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | undefined;
    if (material && !Array.isArray(material)) material.opacity = value;
  });
}

// Ghost shapes mirror each module's REAL body — the same geometry args AND the
// same orientation the placed body is built with (COMMERCIAL_GRADE_PLAN.md
// §7C "what you saw is what you get"). Every value is read from config/world.ts
// MODULES, so the preview and the placed body can't drift apart.
function GhostShapes({ type }: { type: PatchNode['type'] }): React.ReactElement {
  switch (type) {
    case 'ramp':
      // Ramp.tsx tilts the BODY by params.angle about Z, and a freshly placed
      // ramp gets getDefaultParams' angle — the same MODULES.ramp.defaultAngle
      // used here. The old ghost was an axis-aligned box, so the placed ramp
      // always appeared at an angle the preview never showed.
      return (
        <group rotation={[0, 0, MODULES.ramp.defaultAngle * DEG_TO_RAD]}>
          <mesh>
            <boxGeometry args={MODULES.ramp.args} />
            <GhostMaterial />
          </mesh>
        </group>
      );
    case 'seesaw':
      // The pivot post is a separate collider with no node identity; the plank
      // is what a marble actually meets, so the plank is what the ghost shows.
      return (
        <mesh>
          <boxGeometry args={MODULES.seesaw.plankArgs} />
          <GhostMaterial />
        </mesh>
      );
    case 'bumper':
      return (
        <mesh>
          <cylinderGeometry args={MODULES.bumper.args} />
          <GhostMaterial />
        </mesh>
      );
    case 'chime':
      return (
        <mesh>
          <cylinderGeometry args={MODULES.chime.args} />
          <GhostMaterial />
        </mesh>
      );
    case 'funnel':
      return (
        <mesh>
          <cylinderGeometry args={MODULES.funnel.args} />
          <GhostMaterial />
        </mesh>
      );
    case 'bell':
      return (
        <mesh>
          <cylinderGeometry args={MODULES.bell.args} />
          <GhostMaterial />
        </mesh>
      );
    case 'spinner':
      // Spinner.tsx builds a compound body pre-rotated 90° about X (hub axis ->
      // world Z, wheel facing the camera) with two crossing paddle bars
      // reaching ~3.8 units across. The old ghost was the bare hub disc — ~1.2
      // units, unrotated, under a third of the real footprint — so the placed
      // spinner routinely swallowed its neighbours. Mirror the whole body:
      // same rotation, hub plus both paddles.
      return (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={MODULES.spinner.hubVisualArgs} />
            <GhostMaterial />
          </mesh>
          <mesh>
            <boxGeometry args={MODULES.spinner.paddleArgsA} />
            <GhostMaterial />
          </mesh>
          <mesh>
            <boxGeometry args={MODULES.spinner.paddleArgsB} />
            <GhostMaterial />
          </mesh>
        </group>
      );
    case 'marble':
    default:
      return (
        <mesh>
          <sphereGeometry args={[MARBLE.radius, 16, 16]} />
          <GhostMaterial />
        </mesh>
      );
  }
}

interface GhostPreviewProps {
  /** Latest clamped pointer position over the placement plane, written
   * imperatively by Scene's onPointerMove handler (no setState in the
   * pointer-move hot path) — read here once per frame instead of subscribed
   * to. Cleared to null on pointerleave. */
  pointerRef: React.RefObject<PlacementPoint | null>;
  /** Set by Scene right after a successful placement (same clamped x/y that
   * was actually placed at) — drives the brief confirm pulse instead of the
   * ghost just sitting there unchanged. */
  pulseRef: React.RefObject<PlacementPoint | null>;
}

// Ghost preview (COMMERCIAL_GRADE_PLAN.md §7C): a translucent stand-in for the
// currently-selected module, following the pointer at the SAME clamped
// coordinates the click handler will place at (config/world.ts
// clampPlacement) — so "where will this appear" is always visible, including
// right at the clamped viewport edges. Entirely ref/useFrame driven: no React
// state changes on pointer move, only the (rare) selection change re-renders.
export const GhostPreview = React.memo(({ pointerRef, pulseRef }: GhostPreviewProps) => {
  const selectedModuleType = useGameStore((s) => s.selectedModuleType);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const now = Date.now();

    // A recent placement takes priority: pulse in place instead of tracking
    // the (possibly already-moved-on) pointer.
    const pulse = pulseRef.current;
    if (pulse && now - pulse.t < PULSE_MS) {
      const t = (now - pulse.t) / PULSE_MS;
      group.visible = true;
      group.position.set(pulse.x, pulse.y, 0.05);
      group.scale.setScalar(1 + 0.3 * t);
      setGhostOpacity(group, BASE_OPACITY * (1 - t));
      return;
    }

    // Visibility is driven purely by the explicit pointer-leave signal
    // (Scene.handlePointerLeave nulls this ref, and r3f does deliver
    // onPointerLeave for the interaction plane). There is deliberately NO
    // staleness timeout any more: DOM pointermove only fires on actual motion,
    // so a time-based check hid the preview the instant the user held still to
    // line a placement up — precisely when the preview exists to be looked at.
    const pointer = pointerRef.current;
    if (!pointer) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.scale.setScalar(1);
    setGhostOpacity(group, BASE_OPACITY);
    group.position.set(pointer.x, pointer.y, 0.05);
  });

  return (
    <group ref={groupRef} visible={false}>
      <GhostShapes type={selectedModuleType} />
    </group>
  );
});
GhostPreview.displayName = 'GhostPreview';
