import React from 'react';
import { Cylinder } from '@react-three/drei';
import { useCylinder } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES, breathPhaseFromPosition } from '../../../config/world';
import { useEmissiveBreath } from '../hooks';
import { SceneLabel } from '../SceneLabel';
import type { StaticModuleProps } from '../types';

// Funnel — spiral sound effect pad.
export const Funnel = React.memo(({ position, nodeId }: StaticModuleProps) => {
  const cfg = MODULES.funnel;
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: cfg.args,
    type: 'Static',
    userData: { nodeId, moduleType: 'funnel' as const },
  }));

  const matRef = useEmissiveBreath(breathPhaseFromPosition(position));

  return (
    <group ref={ref}>
      <Cylinder args={cfg.args}>
        <meshStandardMaterial
          ref={matRef}
          color={cfg.color}
          metalness={cfg.metalness}
          roughness={cfg.roughness}
          emissive={cfg.color}
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel position={[0, 0, 1.1]} fontSize={0.25} color="white" anchorX="center" anchorY="middle">
        ◈
      </SceneLabel>
    </group>
  );
});
Funnel.displayName = 'Funnel';
