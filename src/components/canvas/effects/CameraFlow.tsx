import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { newestMarblePosition } from '../marblePositions';

// Smooth camera follow with gentle breathing float (§3.5). Tracks the newest
// marble's LIVE position from the shared registry (no React state / no per-frame
// allocation — the scratch vectors are reused). Default OFF; the shell toggles
// `enabled` (Follow / F) and disables OrbitControls while it's on so they don't
// fight over the camera.
export const CameraFlow = React.memo(({ enabled }: { enabled: boolean }) => {
  const { camera } = useThree();
  const offset = useMemo(() => new THREE.Vector3(0, 8, 12), []);
  const floatOffset = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!enabled) return;
    const pos = newestMarblePosition();
    if (!pos) return;

    const t = state.clock.elapsedTime;
    floatOffset.set(Math.sin(t * 0.3) * 2, Math.cos(t * 0.2) * 1, Math.sin(t * 0.25) * 2);

    target.copy(pos).add(offset).add(floatOffset);
    camera.position.lerp(target, Math.min(1, 2 * delta));

    lookAt.copy(pos);
    lookAt.y += 2;
    camera.lookAt(lookAt);
  });

  return null; // manipulates the camera directly
});
CameraFlow.displayName = 'CameraFlow';
