import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STARFIELD, QUALITY_TIERS } from '../../config/experience';
import { useGameStore } from '../../stores/gameStore';

// Starfield (§3.6): one <points> draw call of ~200 moonlight stars in an upper
// hemispherical shell (r = 25..45, y ≥ 0), additive so they bloom faintly. The
// whole field rotates ~0.05°/s for a slow parallax drift. Replaces the four
// billboard spheres that used to stand in for atmosphere.
//
// Adaptive quality (§7D): the star count follows the store's qualityTier
// (200 on high/medium, 100 on low — see QUALITY_TIERS in config/experience.ts).
// Tier changes are rare, so regenerating the position buffer on tier change
// (memoized on the tier) is cheap enough; there's no per-frame cost either way.

// Not a true PRNG-seeded deterministic layout — regenerating on a tier change
// reshuffles the stars, which is imperceptible for an ambient field this
// sparse. (Not in render — that would teleport them every frame and trip the
// hooks lint; this only re-runs when `count` — i.e. the tier — changes.)
function makeStarPositions(count: number): Float32Array {
  const { radiusMin, radiusMax } = STARFIELD;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);
    // Upper hemisphere: azimuth full circle, polar biased to y ≥ 0.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // 0..π/2 → y ≥ 0
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.cos(phi);
    arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return arr;
}

const ROTATION_RAD_PER_SEC = (STARFIELD.rotationDegPerSec * Math.PI) / 180;

export const Atmosphere = React.memo(() => {
  const tier = useGameStore((state) => state.qualityTier);
  const count = QUALITY_TIERS[tier].starfieldCount;
  const groupRef = useRef<THREE.Group>(null);
  const positions = useMemo(() => makeStarPositions(count), [count]);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += ROTATION_RAD_PER_SEC * delta;
  });

  return (
    <group ref={groupRef}>
      {/* Keyed on tier: a resized Float32Array needs a fresh bufferAttribute
          (and its parent geometry) rather than an in-place update. */}
      <points key={tier}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={STARFIELD.size}
          color={STARFIELD.color}
          transparent
          opacity={STARFIELD.opacity}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
});
Atmosphere.displayName = 'Atmosphere';
