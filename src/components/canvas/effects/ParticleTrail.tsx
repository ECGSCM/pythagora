import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../types';

interface Particle {
  position: Vec3;
  life: number; // 0 to 1
  velocity: Vec3;
}

// Trailing particle stream that follows a marble. Takes the marble's live
// position as a prop (Phase 5 wires it up); not yet mounted.
export const ParticleTrail = React.memo(
  ({ marblePosition, color }: { marblePosition: THREE.Vector3; color: string }) => {
    const [particles, setParticles] = useState<Particle[]>([]);
    const maxParticles = 30;
    const particleLifetime = 1.5; // seconds

    useFrame((_state, delta) => {
      if (!marblePosition) return;

      const newParticle: Particle = {
        position: [
          marblePosition.x + (Math.random() - 0.5) * 0.1,
          marblePosition.y + (Math.random() - 0.5) * 0.1,
          marblePosition.z + (Math.random() - 0.5) * 0.1,
        ],
        life: 1,
        velocity: [
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
        ],
      };

      setParticles((prev) =>
        [...prev, newParticle]
          .map((p) => ({
            ...p,
            life: p.life - delta / particleLifetime,
            position: [
              p.position[0] + p.velocity[0],
              p.position[1] + p.velocity[1],
              p.position[2] + p.velocity[2],
            ] as Vec3,
          }))
          .filter((p) => p.life > 0)
          .slice(-maxParticles),
      );
    });

    const particlesRef = useRef<THREE.Points>(null);
    const geometryRef = useRef<THREE.BufferGeometry>(null);

    useFrame(() => {
      if (particlesRef.current && geometryRef.current && particles.length > 0) {
        const positions = geometryRef.current.attributes.position.array as Float32Array;
        particles.forEach((p, i) => {
          positions[i * 3] = p.position[0];
          positions[i * 3 + 1] = p.position[1];
          positions[i * 3 + 2] = p.position[2];
        });
        geometryRef.current.attributes.position.needsUpdate = true;
        geometryRef.current.setDrawRange(0, particles.length);
      }
    });

    const positions = new Float32Array(maxParticles * 3);

    return (
      <points ref={particlesRef}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute
            attach="attributes-position"
            count={maxParticles}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color={color}
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    );
  },
);
ParticleTrail.displayName = 'ParticleTrail';
