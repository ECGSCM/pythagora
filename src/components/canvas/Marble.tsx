import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { useSphere } from '@react-three/cannon';
import * as THREE from 'three';
import { MARBLE, ASCENSION_OFFSETS } from '../../config/world';
import { useGameStore } from '../../stores/gameStore';
import { useLiveCallback } from './hooks';
import { marblePositions } from './marblePositions';
import { ParticleTrail } from './effects';
import type { CollisionHandler, Vec3 } from './types';
import type { CollisionEvent } from '../../types/events';

interface MarbleProps {
  id: string;
  position: Vec3;
  onCollide: CollisionHandler;
  /** Called once the marble finishes its run AND its ascension fade completes. */
  onSettle: (id: string) => void;
}

// Marble = light orb / comet (§3.2). Constant emissive so it blooms into a glow
// (the old per-marble pointLight is gone — bloom is cheaper and prettier). A
// ParticleTrail streams behind it, and instead of vanishing on rest it ascends:
// a 1s fade (scale down, emissive up then out) with motes drifting upward.
export const Marble = React.memo(({ id, position, onCollide, onSettle }: MarbleProps) => {
  const liveOnCollide = useLiveCallback(onCollide);
  const liveOnSettle = useLiveCallback(onSettle);
  const golden = useGameStore((s) => s.unlocks.goldenMarble);

  const [ref, api] = useSphere<THREE.Mesh>(() => ({
    mass: MARBLE.mass,
    position,
    args: [MARBLE.radius],
    material: MARBLE.material,
    onCollide: (e) => {
      const nodeId = (e.body?.userData as { nodeId?: string } | undefined)?.nodeId;
      if (nodeId) {
        const cp = e.contact?.contactPoint as number[] | undefined;
        const collisionEvent: CollisionEvent = {
          nodeId,
          velocity: Math.abs(e.contact?.impactVelocity ?? 5),
          position: cp ? { x: cp[0], y: cp[1], z: cp[2] } : { x: 0, y: 0, z: 0 },
          timestamp: Date.now(),
        };
        liveOnCollide(collisionEvent);
      }
    },
  }));

  // Live physics state, lifted out of React render.
  const marblePosition = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const marbleSpeed = useRef(0);
  const restTime = useRef(0);
  const settled = useRef(false); // final onSettle fired
  const settling = useRef(false); // ascension in progress
  const settleElapsed = useRef(0);
  const settlePos = useMemo(() => new THREE.Vector3(), []);

  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const ascGeomRef = useRef<THREE.BufferGeometry>(null);
  const ascMatRef = useRef<THREE.PointsMaterial>(null);
  const ascPositions = useMemo(() => new Float32Array(MARBLE.ascensionCount * 3), []);

  // Register the live position vector so CameraFlow can track this marble
  // without a React re-render; unregister on unmount.
  useEffect(() => {
    marblePositions.set(id, marblePosition.current);
    return () => {
      marblePositions.delete(id);
    };
  }, [id]);

  useEffect(() => {
    const unsubPos = api.position.subscribe((pos) => {
      marblePosition.current.set(pos[0], pos[1], pos[2]);
    });
    const unsubVel = api.velocity.subscribe((vel) => {
      marbleSpeed.current = Math.hypot(vel[0], vel[1], vel[2]);
    });
    return () => {
      unsubPos();
      unsubVel();
    };
  }, [api.position, api.velocity]);

  const beginAscension = () => {
    settling.current = true;
    settleElapsed.current = 0;
    settlePos.copy(marblePosition.current);
    // Stop interacting with the world during the fade: the body no longer
    // pushes anything (collisionResponse off) and is frozen in place.
    api.collisionResponse.set(false);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
    // Seed the ascension motes at the settle position.
    for (let i = 0; i < MARBLE.ascensionCount; i++) {
      const off = ASCENSION_OFFSETS[i];
      ascPositions[i * 3] = settlePos.x + off[0];
      ascPositions[i * 3 + 1] = settlePos.y;
      ascPositions[i * 3 + 2] = settlePos.z + off[1];
    }
    if (ascGeomRef.current) ascGeomRef.current.attributes.position.needsUpdate = true;
  };

  useFrame((_state, delta) => {
    const mesh = ref.current;

    if (settling.current) {
      settleElapsed.current += delta;
      const p = Math.min(1, settleElapsed.current / MARBLE.settleFadeSec);
      // Scale down and swell emissive (up then out) as it dissolves.
      if (mesh) mesh.scale.setScalar(Math.max(0.001, 1 - p));
      if (matRef.current) {
        matRef.current.emissiveIntensity =
          MARBLE.emissiveIntensityBase + Math.sin(p * Math.PI) * MARBLE.settleEmissivePeak;
      }
      // Motes drift upward and fade.
      const rise = p * MARBLE.ascensionRisePerSec * MARBLE.settleFadeSec;
      for (let i = 0; i < MARBLE.ascensionCount; i++) {
        ascPositions[i * 3 + 1] = settlePos.y + rise + i * 0.02;
      }
      if (ascGeomRef.current) ascGeomRef.current.attributes.position.needsUpdate = true;
      if (ascMatRef.current) ascMatRef.current.opacity = (1 - p) * 0.9;

      if (p >= 1 && !settled.current) {
        settled.current = true;
        liveOnSettle(id);
      }
      return;
    }

    if (mesh) {
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.02;
    }

    if (settled.current) return;

    // Run ends on fall-out or on resting long enough → begin the ascension fade.
    if (marblePosition.current.y < MARBLE.fallLimitY) {
      beginAscension();
      return;
    }
    if (marbleSpeed.current < MARBLE.restSpeed) {
      restTime.current += delta;
      if (restTime.current >= MARBLE.restSeconds) beginAscension();
    } else {
      restTime.current = 0;
    }
  });

  return (
    <group>
      <Sphere ref={ref} args={[MARBLE.radius, 32, 32]}>
        <meshStandardMaterial
          ref={matRef}
          color={golden ? MARBLE.colorGolden : MARBLE.colorBase}
          metalness={MARBLE.metalness}
          roughness={golden ? MARBLE.roughnessGolden : MARBLE.roughnessBase}
          emissive={golden ? MARBLE.emissiveGolden : MARBLE.emissiveBase}
          emissiveIntensity={golden ? MARBLE.emissiveIntensityGolden : MARBLE.emissiveIntensityBase}
        />
      </Sphere>

      {/* Comet trail follows the live position ref. */}
      <ParticleTrail
        marblePosition={marblePosition.current}
        color={golden ? MARBLE.trailColorGolden : MARBLE.trailColor}
        size={0.35}
      />

      {/* Ascension motes — dormant until the marble settles. */}
      <points>
        <bufferGeometry ref={ascGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            count={MARBLE.ascensionCount}
            array={ascPositions}
            itemSize={3}
            args={[ascPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={ascMatRef}
          size={0.12}
          color={golden ? MARBLE.trailColorGolden : MARBLE.trailColor}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
});
Marble.displayName = 'Marble';
