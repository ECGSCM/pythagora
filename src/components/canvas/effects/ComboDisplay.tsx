import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MULTIPLIER_COLORS } from '../../../config/world';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Floating combo banner. Reads combo + display state from the store via
// selectors, so Phase 5 can mount it with zero wiring. Not yet mounted.
export const ComboDisplay = React.memo(() => {
  const meshRef = useRef<THREE.Group>(null);
  const display = useGameStore((s) => s.comboDisplay);
  const count = useGameStore((s) => s.combo.count);
  const multiplier = useGameStore((s) => s.combo.multiplier);

  useFrame((_state, delta) => {
    if (meshRef.current && display.show) {
      meshRef.current.scale.setScalar(display.scale);
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  if (!display.show && count === 0) return null;

  const color = MULTIPLIER_COLORS[Math.min(multiplier - 1, 4)];

  return (
    <group ref={meshRef} position={[0, 8, 0]}>
      {display.show && (
        <SceneLabel fontSize={1.5} color={color} anchorX="center" anchorY="middle" position={[0, 0, 0]}>
          {display.text}
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.9}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </SceneLabel>
      )}
    </group>
  );
});
ComboDisplay.displayName = 'ComboDisplay';
