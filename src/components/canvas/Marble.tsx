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
import type { PatchNode } from '../../types/patch';

interface MarbleProps {
  id: string;
  position: Vec3;
  /** Spawn-cap eviction: when true, begin the ascension fade immediately so the
   * oldest orb dissolves gracefully instead of being unmounted mid-flight. */
  evict?: boolean;
  onCollide: CollisionHandler;
  /** Called once the marble finishes its run AND its ascension fade completes. */
  onSettle: (id: string) => void;
}

// Marble = light orb / comet (§3.2). Constant emissive so it blooms into a glow
// (the old per-marble pointLight is gone — bloom is cheaper and prettier). A
// ParticleTrail streams behind it, and instead of vanishing on rest it ascends:
// a 1s fade (scale down, emissive up then out) with motes drifting upward.
export const Marble = React.memo(({ id, position, evict = false, onCollide, onSettle }: MarbleProps) => {
  const liveOnCollide = useLiveCallback(onCollide);
  const liveOnSettle = useLiveCallback(onSettle);
  const golden = useGameStore((s) => s.unlocks.goldenMarble);
  const enhancedTrail = useGameStore((s) => s.unlocks.enhancedParticles);

  const [ref, api] = useSphere<THREE.Mesh>(() => ({
    mass: MARBLE.mass,
    position,
    args: [MARBLE.radius],
    material: MARBLE.material,
    onCollide: (e) => {
      const userData = e.body?.userData as
        | { nodeId?: string; moduleType?: PatchNode['type'] }
        | undefined;
      const nodeId = userData?.nodeId;
      if (nodeId) {
        const cp = e.contact?.contactPoint as number[] | undefined;
        const collisionEvent: CollisionEvent = {
          nodeId,
          moduleType: userData?.moduleType,
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
  // Scratch matrix for the ascension shrink (see settling branch below) — a
  // single reused instance, not allocated per frame.
  const settleMatrix = useMemo(() => new THREE.Matrix4(), []);

  // Register the live position vector so CameraFlow can track this marble
  // without a React re-render; unregister on unmount.
  useEffect(() => {
    marblePositions.set(id, marblePosition.current);
    return () => {
      marblePositions.delete(id);
    };
  }, [id]);

  // Subscriptions are stored in a ref and torn down EARLY (at ascension start,
  // not unmount): the physics worker resolves subscription targets by body id
  // each step, and unmount removes the body via a layout effect that can run
  // before this effect's cleanup — a race that intermittently threw
  // "Cannot read properties of undefined (reading 'velocity')" inside the
  // cannon worker. Ending the subscriptions a full second before the body is
  // removed closes that window regardless of React's cleanup ordering.
  const unsubscribeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const unsubPos = api.position.subscribe((pos) => {
      marblePosition.current.set(pos[0], pos[1], pos[2]);
    });
    const unsubVel = api.velocity.subscribe((vel) => {
      marbleSpeed.current = Math.hypot(vel[0], vel[1], vel[2]);
    });
    unsubscribeRef.current = () => {
      unsubPos();
      unsubVel();
    };
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [api.position, api.velocity]);

  const beginAscension = () => {
    settling.current = true;
    settleElapsed.current = 0;
    settlePos.copy(marblePosition.current);
    // The run is over: stop observing the body now (see unsubscribeRef note).
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    // Stop interacting with the world during the fade: the body no longer
    // pushes anything (collisionResponse off) and is frozen in place. Zeroing
    // velocity alone isn't enough on the fall-out path — cannon-es still
    // integrates gravity each step, so the body would keep accelerating during
    // the 1s fade. Mass 0 → invMass 0, which makes integrate() skip the force/
    // gravity step entirely, truly freezing the body.
    api.collisionResponse.set(false);
    api.mass.set(0);
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
      if (mesh) {
        mesh.scale.setScalar(Math.max(0.001, 1 - p));
        // @react-three/cannon's PhysicsProvider drives mesh.matrix directly
        // (matrixAutoUpdate is permanently false once physics takes over) and
        // only recomposes it from mesh.scale when the physics worker reports
        // an active body (frameHandler: `if (!active) return;` before the
        // per-body apply() that reads ref.scale). cannon-es sleeps every body
        // — including static geometry — after ~1s below its own
        // sleepSpeedLimit (default 0.1), which is tighter/faster than this
        // marble's own rest detection (MARBLE.restSpeed 0.15 / restSeconds
        // 2.5s). So by the time ascension starts, the world has very likely
        // already gone fully asleep (hasActiveBodies=false), apply() stops
        // running for every body, and the scale set above would otherwise
        // never reach the GPU — the marble just pops out of existence at
        // ascension's end instead of shrinking. None of the physics setters
        // used to freeze the body (mass/velocity/collisionResponse below)
        // call wakeUp() either, so the world doesn't wake itself back up.
        // Recomposing the matrix ourselves here — every settling frame, using
        // the frozen settlePos rather than the physics position buffer —
        // bypasses that gate entirely and is safe to do even on frames where
        // cannon's own apply() ALSO runs (harmless, idempotent overwrite with
        // the same values, since apply() reads this same mesh.scale).
        settleMatrix.compose(settlePos, mesh.quaternion, mesh.scale);
        mesh.matrix.copy(settleMatrix);
      }
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

    // Spawn-cap eviction: begin the ascension fade immediately (once), so the
    // oldest orb dissolves gracefully instead of vanishing.
    if (evict && !settled.current) {
      beginAscension();
      return;
    }

    if (mesh) {
      // Delta-scaled idle spin (~1.2 rad/s) so the rate is refresh-rate
      // independent (matches the old 0.02/frame @ 60fps feel).
      mesh.rotation.x += delta * 1.2;
      mesh.rotation.y += delta * 1.2;
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

      {/* Comet trail follows the live position ref. Size steps up once the
          5-combo `enhancedParticles` unlock fires — the trail is always
          present, but this is its visible payoff. */}
      <ParticleTrail
        marblePosition={marblePosition.current}
        color={golden ? MARBLE.trailColorGolden : MARBLE.trailColor}
        size={enhancedTrail ? MARBLE.trailSizeEnhanced : MARBLE.trailSize}
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
