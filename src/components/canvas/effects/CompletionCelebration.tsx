import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../../config/experience';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Ascension mark (§3.5): a marble finishing its run gets a thin moonlight ring
// that expands and fades, with a small "✓". Light is the event; the old golden
// torus + "COMPLETE!" shout is gone (§1: text is noise).
export const CompletionCelebration = React.memo(() => {
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const enabled = useGameStore((s) => s.completionCelebration.enabled);
  // marblesCompleted is a monotonically increasing per-completion identity
  // (C4): a plain enabled false->true edge misses a SECOND completion that
  // lands while the first one's ring is still animating (enabled stays true
  // the whole time, so there's no edge to catch), silently swallowing it.
  // Keying the restart off this counter instead means every new completion
  // — even one that arrives mid-animation — restarts the ring.
  const marblesCompleted = useGameStore((s) => s.completionCelebration.marblesCompleted);
  const clearCelebration = useGameStore((s) => s.clearCelebration);

  // Ref-driven exactly like Ripple: scale/opacity come from the CURRENT
  // progress (no one-frame lag) and clearCelebration fires directly from the
  // frame loop, guarded by a one-shot ref — never inside a setState updater.
  const progressRef = useRef(0);
  const clearedRef = useRef(false);
  const prevMarblesCompletedRef = useRef(0);

  useFrame((_state, delta) => {
    // Reset whenever a new completion arrives (identified by marblesCompleted
    // ticking up) while enabled — not just on the false -> true edge, so an
    // overlapping completion restarts the ring instead of being swallowed.
    if (enabled && marblesCompleted !== prevMarblesCompletedRef.current) {
      progressRef.current = 0;
      clearedRef.current = false;
      prevMarblesCompletedRef.current = marblesCompleted;
    }

    if (!enabled || !groupRef.current) return;

    progressRef.current = Math.min(1, progressRef.current + delta * 0.5); // ~2s
    const progress = progressRef.current;

    const scale = 1 + progress * 3;
    groupRef.current.scale.setScalar(scale);
    if (ringMatRef.current) ringMatRef.current.opacity = (1 - progress) * 0.6;

    if (progress >= 1 && !clearedRef.current) {
      clearedRef.current = true;
      clearCelebration();
    }
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef} position={[0, 6, 0]}>
      {/* Thin moonlight ring, expanding + fading. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={PALETTE.moonlight}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <SceneLabel fontSize={0.8} color={PALETTE.moonlight} anchorX="center" anchorY="middle" position={[0, 0, 0]}>
        ✓
        <meshBasicMaterial color={PALETTE.moonlight} transparent opacity={0.9} />
      </SceneLabel>
    </group>
  );
});
CompletionCelebration.displayName = 'CompletionCelebration';
