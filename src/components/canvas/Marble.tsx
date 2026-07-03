import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { useSphere } from '@react-three/cannon';
import * as THREE from 'three';
import { MARBLE } from '../../config/world';
import { useGameStore } from '../../stores/gameStore';
import { useLiveCallback } from './hooks';
import type { CollisionHandler, Vec3 } from './types';
import type { CollisionEvent } from '../../types/events';

interface MarbleProps {
  id: string;
  position: Vec3;
  onCollide: CollisionHandler;
  /** Called once when the marble finishes its run (comes to rest or falls out of the world). */
  onSettle: (id: string) => void;
}

// Enhanced marble with a local glow and rest/fall-out completion detection.
export const Marble = React.memo(({ id, position, onCollide, onSettle }: MarbleProps) => {
  const liveOnCollide = useLiveCallback(onCollide);
  const liveOnSettle = useLiveCallback(onSettle);
  // Self-subscribe so an unlock re-renders marbles without Scene needing to.
  const golden = useGameStore((s) => s.unlocks.goldenMarble);

  const [ref, api] = useSphere<THREE.Mesh>(() => ({
    mass: MARBLE.mass,
    position,
    args: [MARBLE.radius],
    material: MARBLE.material,
    onCollide: (e) => {
      const nodeId = (e.body?.userData as { nodeId?: string } | undefined)?.nodeId;
      if (nodeId) {
        // cannon-es reports contactPoint as an [x, y, z] tuple.
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

  // Live physics state, lifted out of React render (position + velocity drive
  // the settle detection).
  const marblePosition = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const marbleSpeed = useRef(0);
  const restTime = useRef(0);
  const settled = useRef(false);

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

  useFrame((_state, delta) => {
    const mesh = ref.current;
    if (mesh) {
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.02;
    }

    if (settled.current) return;

    // A marble's run ends when it falls out of the world or rests anywhere
    // (ground or module) long enough. Scene removes it and celebrates.
    if (marblePosition.current.y < MARBLE.fallLimitY) {
      settled.current = true;
      liveOnSettle(id);
      return;
    }
    if (marbleSpeed.current < MARBLE.restSpeed) {
      restTime.current += delta;
      if (restTime.current >= MARBLE.restSeconds) {
        settled.current = true;
        liveOnSettle(id);
      }
    } else {
      restTime.current = 0;
    }
  });

  return (
    <group>
      {/* Local glow light for the marble */}
      <pointLight
        position={[0, 0, 0]}
        intensity={golden ? MARBLE.glowIntensityGolden : MARBLE.glowIntensityBase}
        color="#FFFFFF"
        distance={MARBLE.glowDistance}
        decay={MARBLE.glowDecay}
      />
      <Sphere ref={ref} args={[MARBLE.radius, 32, 32]}>
        <meshStandardMaterial
          color={golden ? MARBLE.colorGolden : MARBLE.colorBase}
          metalness={MARBLE.metalness}
          roughness={golden ? MARBLE.roughnessGolden : MARBLE.roughnessBase}
          emissive={golden ? MARBLE.colorGolden : MARBLE.colorBase}
          emissiveIntensity={golden ? MARBLE.emissiveIntensityGolden : MARBLE.emissiveIntensityBase}
        />
      </Sphere>
    </group>
  );
});
Marble.displayName = 'Marble';
