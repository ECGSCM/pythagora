import React, { useMemo, useRef } from 'react';
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

// If the pointer hasn't moved over the placement plane in this long, the ghost
// hides — covers "pointer left the canvas" too, since no more move events
// arrive once that happens (Scene also clears the ref immediately on
// pointerleave, but this is the backstop).
const HIDE_AFTER_MS = 150;
// Confirm pulse duration on a successful placement (scale 1->1.3, fade out).
const PULSE_MS = 200;
const BASE_OPACITY = 0.25;

function ghostGeometry(type: PatchNode['type']): React.ReactElement {
  // Mirrors each module's real collider footprint (config/world.ts MODULES) —
  // box for the flat/plank shapes, cylinder for the round ones, small sphere
  // for the marble itself.
  switch (type) {
    case 'ramp':
      return <boxGeometry args={MODULES.ramp.args} />;
    case 'seesaw':
      return <boxGeometry args={MODULES.seesaw.plankArgs} />;
    case 'bumper':
      return <cylinderGeometry args={MODULES.bumper.args} />;
    case 'chime':
      return <cylinderGeometry args={MODULES.chime.args} />;
    case 'funnel':
      return <cylinderGeometry args={MODULES.funnel.args} />;
    case 'bell':
      return <cylinderGeometry args={MODULES.bell.args} />;
    case 'spinner':
      return <cylinderGeometry args={MODULES.spinner.hubVisualArgs} />;
    case 'marble':
    default:
      return <sphereGeometry args={[MARBLE.radius, 16, 16]} />;
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
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useMemo(() => ghostGeometry(selectedModuleType), [selectedModuleType]);

  useFrame(() => {
    const group = groupRef.current;
    const mat = matRef.current;
    if (!group || !mat) return;
    const now = Date.now();

    // A recent placement takes priority: pulse in place instead of tracking
    // the (possibly already-moved-on) pointer.
    const pulse = pulseRef.current;
    if (pulse && now - pulse.t < PULSE_MS) {
      const t = (now - pulse.t) / PULSE_MS;
      group.visible = true;
      group.position.set(pulse.x, pulse.y, 0.05);
      group.scale.setScalar(1 + 0.3 * t);
      mat.opacity = BASE_OPACITY * (1 - t);
      return;
    }

    const pointer = pointerRef.current;
    const fresh = pointer !== null && now - pointer.t <= HIDE_AFTER_MS;
    if (!fresh || !pointer) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.scale.setScalar(1);
    mat.opacity = BASE_OPACITY;
    group.position.set(pointer.x, pointer.y, 0.05);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        {geometry}
        <meshBasicMaterial
          ref={matRef}
          color={PALETTE.moonlight}
          transparent
          opacity={BASE_OPACITY}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});
GhostPreview.displayName = 'GhostPreview';
