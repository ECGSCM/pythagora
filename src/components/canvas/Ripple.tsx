import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GAMEPLAY } from '../../config/world';
import type { Vec3 } from './types';

interface RippleProps {
  position: Vec3;
  color?: string;
  onComplete?: () => void;
}

// Collision ripple. Ref-driven: scale + opacity are mutated imperatively in
// the frame loop (the old version called setState every frame — §0.5) and
// completion fires exactly once from an elapsed-time check.
export const Ripple = React.memo(({ position, color = '#FF4757', onComplete }: RippleProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  const completed = useRef(false);

  useFrame((_state, delta) => {
    elapsed.current += delta;
    const life = Math.max(0, 1 - elapsed.current / GAMEPLAY.rippleDurationSec);

    if (meshRef.current) {
      const scale = 1 + (1 - life) * 3;
      meshRef.current.scale.set(scale, scale, scale);
    }
    if (matRef.current) {
      matRef.current.opacity = life * 0.6;
    }

    if (life <= 0 && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.1, 0.3, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
});
Ripple.displayName = 'Ripple';
