import React, { useRef, useState } from 'react';
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
  const clearCelebration = useGameStore((s) => s.clearCelebration);
  const [progress, setProgress] = useState(0);

  useFrame((_state, delta) => {
    if (!enabled || !groupRef.current) return;

    setProgress((prev) => {
      const next = prev + delta * 0.5; // ~2s
      if (next >= 1) {
        clearCelebration();
        return 1;
      }
      return next;
    });

    const scale = 1 + progress * 3;
    groupRef.current.scale.setScalar(scale);
    if (ringMatRef.current) ringMatRef.current.opacity = (1 - progress) * 0.6;
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
