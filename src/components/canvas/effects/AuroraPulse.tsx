import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GROUND } from '../../../config/world';
import { AURORA } from '../../../config/experience';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Aurora pulse (§3.4): when the harmony key steps (every 8 collisions), one
// turquoise ring expands across the ground and the new key letter fades in near
// its origin — "8 hits and the world answers". Ref-driven: the ring/label are
// always mounted and animated imperatively from modulation.at (a Date.now()
// stamp), so there is no per-frame setState; the only React re-render is the
// once-per-modulation selector update that swaps the key letter.
export const AuroraPulse = React.memo(() => {
  const modulation = useGameStore((s) => s.modulation);
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const labelMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!modulation) {
      g.visible = false;
      return;
    }
    const p = (Date.now() - modulation.at) / 1000 / AURORA.durationSec;
    if (p >= 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const scale = Math.max(0.001, p * AURORA.maxRadius);
    if (ringRef.current) ringRef.current.scale.set(scale, scale, 1);
    // Ring fades as it expands (ease-out on opacity).
    if (ringMatRef.current) ringMatRef.current.opacity = (1 - p) * (1 - p) * AURORA.peakOpacity;
    if (labelMatRef.current) labelMatRef.current.opacity = 1 - p;
  });

  const ringY = GROUND.position[1] + 0.05;

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={ringRef} position={[0, ringY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1 - AURORA.ringThickness, 1, 64]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={AURORA.color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <SceneLabel
        position={AURORA.labelPosition}
        fontSize={AURORA.labelFontSize}
        color={AURORA.labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {modulation?.name ?? ''}
        <meshBasicMaterial ref={labelMatRef} color={AURORA.labelColor} transparent opacity={0} />
      </SceneLabel>
    </group>
  );
});
AuroraPulse.displayName = 'AuroraPulse';
