import React from 'react';
import { Box } from '@react-three/drei';
import { useBox } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES } from '../../../config/world';
import type { StaticModuleProps } from '../types';

// Ramp — guides marbles down a slope. The tilt must live on the physics body,
// not just the mesh, or the collider stays flat and marbles never roll
// (REFACTORING_PLAN.md P1). The body's transform drives the group, so the mesh
// inherits the tilt.
export const Ramp = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const cfg = MODULES.ramp;
  const angleRad = (Number(params.angle ?? cfg.defaultAngle)) * Math.PI / 180;

  const [ref] = useBox<THREE.Group>(() => ({
    position,
    rotation: [0, 0, angleRad],
    args: cfg.args,
    type: 'Static',
    material: cfg.material,
    userData: { nodeId },
  }));

  return (
    <group ref={ref}>
      <Box args={cfg.args}>
        <meshStandardMaterial color={cfg.color} roughness={cfg.roughness} metalness={cfg.metalness} />
      </Box>
    </group>
  );
});
Ramp.displayName = 'Ramp';
