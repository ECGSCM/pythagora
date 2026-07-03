import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../../config/experience';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Perfect-run mark, Divine dialect (§3.5): a slowly turning gold octahedron with
// a thin gold label. Same restrained language as the combo numeral — a jewel of
// light, not a banner.
export const PerfectRunIndicator = React.memo(() => {
  const meshRef = useRef<THREE.Group>(null);
  const active = useGameStore((s) => s.perfectRun.active);

  useFrame((_state, delta) => {
    if (!active || !meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.5;
  });

  if (!active) return null;

  return (
    <group ref={meshRef} position={[0, 10, 0]}>
      <mesh>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color={PALETTE.gold}
          emissive={PALETTE.gold}
          emissiveIntensity={1.4}
          metalness={1}
          roughness={0}
        />
      </mesh>

      <SceneLabel fontSize={0.5} color={PALETTE.gold} anchorX="center" anchorY="middle" position={[0, 1, 0]}>
        PERFECT
        <meshStandardMaterial color={PALETTE.gold} emissive={PALETTE.gold} emissiveIntensity={1} />
      </SceneLabel>
    </group>
  );
});
PerfectRunIndicator.displayName = 'PerfectRunIndicator';
