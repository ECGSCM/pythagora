import React from 'react';
import { Cylinder } from '@react-three/drei';
import { useCylinder } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES, LABEL_OFFSET, breathPhaseFromPosition } from '../../../config/world';
import { useHitFlash } from '../hooks';
import { SceneLabel } from '../SceneLabel';
import type { StaticModuleProps } from '../types';

// Bumper — bouncy pad that pings a pitch and flashes on impact.
export const Bumper = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const cfg = MODULES.bumper;
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: cfg.args,
    type: 'Static',
    material: cfg.material,
    userData: { nodeId, moduleType: 'bumper' as const },
  }));

  const matRef = useHitFlash(
    nodeId,
    cfg.baseColor,
    cfg.flashColor,
    cfg.flashDurationMs,
    breathPhaseFromPosition(position),
  );

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
        position={[0, 0, LABEL_OFFSET.bumper]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ◉ {params.pitch || 'C4'}
      </SceneLabel>
    </group>
  );
});
Bumper.displayName = 'Bumper';
