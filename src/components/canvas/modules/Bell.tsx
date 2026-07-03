import React from 'react';
import { Cylinder } from '@react-three/drei';
import { useCylinder } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES } from '../../../config/world';
import { useHitFlash } from '../hooks';
import { SceneLabel } from '../SceneLabel';
import type { StaticModuleProps } from '../types';

// Bell — harmonic bell that rings and flashes on impact.
export const Bell = React.memo(({ position, nodeId }: StaticModuleProps) => {
  const cfg = MODULES.bell;
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
      <SceneLabel position={[0, 0, 1.2]} fontSize={0.3} color="white" anchorX="center" anchorY="middle">
        ❖
      </SceneLabel>
    </group>
  );
});
Bell.displayName = 'Bell';
