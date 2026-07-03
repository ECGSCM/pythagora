import React from 'react';
import { Box, Cylinder } from '@react-three/drei';
import { useBox, useCylinder, useHingeConstraint } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES, breathPhaseFromPosition } from '../../../config/world';
import { useEmissiveBreath } from '../hooks';
import type { StaticModuleProps } from '../types';

// Seesaw — a real see-saw: a dynamic plank hinged onto a static pivot post,
// tilting under marble weight (the old version was a static box with no
// mechanism at all — REFACTORING_PLAN.md P3). The hinge axis is the world Z
// axis, matching the z=0 gameplay plane.
export const Seesaw = React.memo(({ position, nodeId }: StaticModuleProps) => {
  const cfg = MODULES.seesaw;

  const [plankRef] = useBox<THREE.Group>(() => ({
    mass: cfg.plankMass,
    position,
    args: cfg.plankArgs,
    angularDamping: cfg.plankAngularDamping,
    linearDamping: cfg.plankLinearDamping,
    material: cfg.plankMaterial,
    userData: { nodeId, moduleType: 'seesaw' as const },
  }));

  const [baseRef] = useCylinder<THREE.Mesh>(() => ({
    type: 'Static',
    position: [position[0], position[1] + cfg.postOffsetY, position[2]],
    args: cfg.postArgs,
  }));

  // Pin the plank's center to the top of the post; free rotation about Z.
  // Connected bodies don't collide with each other (cannon default), so the
  // plank swings cleanly on the post.
  useHingeConstraint(plankRef, baseRef, {
    pivotA: [0, 0, 0],
    axisA: [0, 0, 1],
    pivotB: cfg.hingePivotB,
    axisB: [0, 0, 1],
  });

  const matRef = useEmissiveBreath(breathPhaseFromPosition(position));

  return (
    <>
      <group ref={plankRef}>
        <Box args={cfg.plankArgs}>
          <meshStandardMaterial
            ref={matRef}
            color={cfg.plankColor}
            metalness={0.5}
            roughness={0.5}
            emissive={cfg.plankColor}
            emissiveIntensity={0.1}
          />
        </Box>
      </group>
      <Cylinder ref={baseRef} args={cfg.postArgs}>
        <meshStandardMaterial color={cfg.postColor} metalness={0.5} roughness={0.6} />
      </Cylinder>
    </>
  );
});
Seesaw.displayName = 'Seesaw';
