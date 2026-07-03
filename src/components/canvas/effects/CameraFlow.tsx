import React, { useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MarbleState } from '../types';

// Smooth camera follow with gentle floating motion. Takes the live marble
// list as a prop (Phase 5 wires it up); not yet mounted.
export const CameraFlow = React.memo(({ marbles }: { marbles: MarbleState[] }) => {
  const { camera } = useThree();
  const [offset] = useState(new THREE.Vector3(0, 8, 12)); // camera offset from target

  useFrame((state, delta) => {
    if (!camera || marbles.length === 0) return;

    // Follow the most recently added marble.
    const activeMarble = marbles[marbles.length - 1];
    if (!activeMarble) return;

    const marblePos = new THREE.Vector3(
      activeMarble.position[0],
      activeMarble.position[1],
      activeMarble.position[2],
    );

    // Gentle floating motion (sine wave).
    const time = state.clock.elapsedTime;
    const floatOffset = new THREE.Vector3(
      Math.sin(time * 0.3) * 2,
      Math.cos(time * 0.2) * 1,
      Math.sin(time * 0.25) * 2,
    );

    const target = marblePos.clone().add(offset).add(floatOffset);
    camera.position.lerp(target, 2 * delta);

    const lookAtTarget = marblePos.clone().add(new THREE.Vector3(0, 2, 0));
    camera.lookAt(lookAtTarget);
  });

  return null; // manipulates the camera directly
});
CameraFlow.displayName = 'CameraFlow';
