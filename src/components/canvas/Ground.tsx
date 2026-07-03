import React from 'react';
import { Plane } from '@react-three/drei';
import { usePlane } from '@react-three/cannon';
import * as THREE from 'three';
import { GROUND } from '../../config/world';

// Ground plane + its static physics collider.
//
// Perf note: this used to be a MeshReflectorMaterial, which re-renders the
// ENTIRE scene into a reflection buffer every frame (plus blur passes). On a
// near-black floor under the Divine Monochrome palette the real reflection was
// barely distinguishable from a dark standard material, so it cost a full
// extra scene pass for almost nothing — a top contributor to frame jank on
// integrated GPUs. A plain standard material with a touch of metalness keeps
// the faint sheen for a fraction of the cost.
export const Ground = React.memo(() => {
  const [ref] = usePlane<THREE.Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: GROUND.position,
    type: 'Static',
  }));

  return (
    <Plane ref={ref} args={GROUND.planeArgs}>
      <meshStandardMaterial
        color={GROUND.reflector.color}
        metalness={0.5}
        roughness={0.4}
      />
    </Plane>
  );
});
Ground.displayName = 'Ground';
