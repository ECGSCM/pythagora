import React from 'react';
import { Cylinder } from '@react-three/drei';
import { useCylinder } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES } from '../../../config/world';
import { useHitFlash } from '../hooks';
import { SceneLabel } from '../SceneLabel';
import type { StaticModuleProps } from '../types';

// Chime — vertical tube that rings a melodic note and flashes on impact.
export const Chime = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const cfg = MODULES.chime;
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: cfg.args,
    type: 'Static',
    userData: { nodeId },
  }));

  const matRef = useHitFlash(nodeId, cfg.baseColor, cfg.flashColor, cfg.flashDurationMs);

  return (
    <group ref={ref}>
      <Cylinder args={cfg.args}>
        <meshStandardMaterial
          ref={matRef}
          color={cfg.baseColor}
          metalness={cfg.metalness}
          roughness={cfg.roughness}
          emissive={cfg.baseColor}
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel
        position={[0, 0, 1.7]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
      >
        ✧ {params.note || 'A4'}
      </SceneLabel>
    </group>
  );
});
Chime.displayName = 'Chime';
