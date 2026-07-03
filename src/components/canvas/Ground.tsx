import React from 'react';
import { Plane, MeshReflectorMaterial } from '@react-three/drei';
import { usePlane } from '@react-three/cannon';
import * as THREE from 'three';
import { GROUND } from '../../config/world';

// Reflective ground plane + its static physics collider.
export const Ground = React.memo(() => {
  const [ref] = usePlane<THREE.Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: GROUND.position,
    type: 'Static',
  }));

  const r = GROUND.reflector;
  return (
    <Plane ref={ref} args={GROUND.planeArgs}>
      <MeshReflectorMaterial
        mirror={r.mirror}
        blur={r.blur}
        resolution={r.resolution}
        mixBlur={r.mixBlur}
        mixStrength={r.mixStrength}
        color={r.color}
        metalness={r.metalness}
        roughness={r.roughness}
      />
    </Plane>
  );
});
Ground.displayName = 'Ground';
