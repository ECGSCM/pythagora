import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Golden crown shown during a perfect run. Reads perfect-run state from the
// store via selectors. Not yet mounted (Phase 5 asset).
export const PerfectRunIndicator = React.memo(() => {
  const meshRef = useRef<THREE.Group>(null);
  const active = useGameStore((s) => s.perfectRun.active);
  const flawlessHits = useGameStore((s) => s.perfectRun.flawlessHits);

  useFrame((_state, delta) => {
    if (!active || !meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.5;
  });

  if (!active) return null;

  return (
    <group ref={meshRef} position={[0, 10, 0]}>
      {/* Perfect run crown/star */}
      <mesh>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={1}
          metalness={1}
          roughness={0}
        />
      </mesh>

      <SceneLabel fontSize={1.2} color="#FFD700" anchorX="center" anchorY="middle" position={[0, 1, 0]}>
        "PERFECT RUN!"
        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.8} />
      </SceneLabel>

      <SceneLabel fontSize={0.6} color="#FFFFFF" anchorX="center" anchorY="middle" position={[0, -0.5, 0]}>
        {`${flawlessHits} flawless hits`}
        <meshStandardMaterial color="#FFFFFF" transparent opacity={0.8} />
      </SceneLabel>
    </group>
  );
});
PerfectRunIndicator.displayName = 'PerfectRunIndicator';
