import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Golden burst shown when a marble completes its run. Reads `enabled` from the
// store and clears it via the store action when the animation finishes.
export const CompletionCelebration = React.memo(() => {
  const groupRef = useRef<THREE.Group>(null);
  const enabled = useGameStore((s) => s.completionCelebration.enabled);
  const clearCelebration = useGameStore((s) => s.clearCelebration);
  const [progress, setProgress] = useState(0);

  useFrame((_state, delta) => {
    if (!enabled || !groupRef.current) return;

    setProgress((prev) => {
      const newProgress = prev + delta * 0.5; // 2 second animation
      if (newProgress >= 1) {
        clearCelebration();
        return 1;
      }
      return newProgress;
    });

    const scale = 1 + Math.sin(progress * Math.PI) * 0.5;
    groupRef.current.scale.setScalar(scale);
    groupRef.current.rotation.y += delta * 2;
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef} position={[0, 6, 0]}>
      {/* Golden ring expanding */}
      <mesh>
        <torusGeometry args={[3, 0.2, 16, 100]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={1}
          transparent
          opacity={1 - progress * 0.5}
        />
      </mesh>

      {/* "COMPLETE!" text */}
      <SceneLabel fontSize={2} color="#FFD700" anchorX="center" anchorY="middle" position={[0, 1, 0]}>
        COMPLETE!
        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.8} />
      </SceneLabel>
    </group>
  );
});
CompletionCelebration.displayName = 'CompletionCelebration';
