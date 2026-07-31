import React, { useEffect } from 'react';
import { Box, Cylinder } from '@react-three/drei';
import { useCompoundBody } from '@react-three/cannon';
import * as THREE from 'three';
import { MODULES, breathPhaseFromPosition } from '../../../config/world';
import { useHitFlash } from '../hooks';
import type { StaticModuleProps, Vec3 } from '../types';

// Shared paddle-bar mesh for the Spinner.
const PaddleMesh = ({ args }: { args: Vec3 }) => (
  <Box args={args}>
    <meshStandardMaterial
      color={MODULES.spinner.paddleColor}
      metalness={0.7}
      roughness={0.3}
      emissive={MODULES.spinner.paddleEmissive}
      emissiveIntensity={0.1}
    />
  </Box>
);

// Spinner — a kinematic paddle wheel facing the camera. The old version only
// spun the mesh while its collider stood still and its bespoke collision
// listener referenced a non-existent `ref.api` — marbles were never deflected
// (REFACTORING_PLAN.md P2). Now the physics body itself rotates (hub disc +
// two paddle bars crossing it), so marbles get struck and sound triggers
// through the normal marble-side collision path.
export const Spinner = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const cfg = MODULES.spinner;
  const speed = Number(params.speed ?? cfg.defaultSpeed);

  // Body-local frame: the body is pre-rotated 90° about X, so local +Y points
  // at the camera (world +Z) and the wheel's face lies in the world X/Y plane.
  const [ref, api] = useCompoundBody<THREE.Group>(() => ({
    type: 'Kinematic',
    position,
    rotation: [Math.PI / 2, 0, 0],
    shapes: [
      // Hub disc (cylinder axis = local Y = world Z)
      { type: 'Cylinder', args: cfg.hubColliderArgs, position: [0, 0, 0] },
      // Paddle bars crossing the hub, extending past it to radius 1.9
      { type: 'Box', args: cfg.paddleArgsA, position: [0, 0, 0] },
      { type: 'Box', args: cfg.paddleArgsB, position: [0, 0, 0] },
    ],
    userData: { nodeId, moduleType: 'spinner' as const },
  }));

  // Constant spin about the world Z axis; the physics transform drives the
  // group, so the visuals rotate with the collider.
  useEffect(() => {
    api.angularVelocity.set(0, 0, speed * cfg.speedFactor);
  }, [api.angularVelocity, speed, cfg.speedFactor]);

  const hubMatRef = useHitFlash(
    nodeId,
    cfg.hubColor,
    cfg.flashColor,
    cfg.flashDurationMs,
    breathPhaseFromPosition(position),
  );

  return (
    <group ref={ref}>
      <Cylinder args={cfg.hubVisualArgs}>
        <meshStandardMaterial
          ref={hubMatRef}
          color={cfg.hubColor}
          metalness={0.6}
          roughness={0.4}
          emissive={cfg.hubColor}
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <PaddleMesh args={cfg.paddleArgsA} />
      <PaddleMesh args={cfg.paddleArgsB} />
    </group>
  );
});
Spinner.displayName = 'Spinner';
