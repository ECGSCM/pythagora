import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Comet trail for a marble (§3.2). Allocation-light: a fixed-size ring buffer of
// points is seeded at the marble's CURRENT position each frame (this component
// runs its own useFrame and reads the shared live Vector3), then each point ages
// out over FADE seconds. A tiny ShaderMaterial fades opacity AND shrinks point
// size by age, and blends additively so the trail glows into the bloom pass.

const COUNT = 40;
const FADE = 0.8; // seconds for a point to fully fade
const SPAWN_INTERVAL = 0.016; // ~1 point/frame at 60fps

const vertexShader = /* glsl */ `
  attribute float aAge; // 0 = fresh, 1 = dead
  uniform float uSize;
  varying float vAlpha;
  void main() {
    vAlpha = clamp(1.0 - aAge, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * vAlpha * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    // Round, soft-edged point.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float soft = smoothstep(0.25, 0.0, r);
    gl_FragColor = vec4(uColor, vAlpha * soft * 0.35);
  }
`;

export const ParticleTrail = React.memo(
  ({ marblePosition, color, size = 0.5 }: { marblePosition: THREE.Vector3; color: string; size?: number }) => {
    const geomRef = useRef<THREE.BufferGeometry>(null);
    const writeIndex = useRef(0);
    const lastSpawn = useRef(0);

    // Fixed buffers reused for the whole life of the trail (no per-frame alloc).
    const positions = useMemo(() => new Float32Array(COUNT * 3), []);
    const ages = useMemo(() => new Float32Array(COUNT).fill(2), []); // start dead

    // gl_PointSize = uSize * (300 / distance): at a typical camera distance of
    // ~20 world units this yields uSize*15 screen pixels. size=0.35 → ~10px
    // points, matching the marble's own on-screen radius. (A previous *100
    // factor made every point ~500px — forty stacked additive 500px sprites
    // read as a fog ball swallowing half the screen.)
    const uniforms = useMemo(
      () => ({
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size * 2 },
      }),
      [color, size],
    );

    useFrame((state, delta) => {
      const geom = geomRef.current;
      if (!geom || !marblePosition) return;

      // Age every point.
      const step = delta / FADE;
      for (let i = 0; i < COUNT; i++) ages[i] += step;

      // Seed a fresh point at the marble's current position.
      const t = state.clock.elapsedTime;
      if (t - lastSpawn.current >= SPAWN_INTERVAL) {
        lastSpawn.current = t;
        const idx = writeIndex.current;
        positions[idx * 3] = marblePosition.x;
        positions[idx * 3 + 1] = marblePosition.y;
        positions[idx * 3 + 2] = marblePosition.z;
        ages[idx] = 0;
        writeIndex.current = (idx + 1) % COUNT;
      }

      geom.attributes.position.needsUpdate = true;
      geom.attributes.aAge.needsUpdate = true;
    });

    return (
      <points frustumCulled={false}>
        <bufferGeometry ref={geomRef}>
          <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} args={[positions, 3]} />
          <bufferAttribute attach="attributes-aAge" count={COUNT} array={ages} itemSize={1} args={[ages, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    );
  },
);
ParticleTrail.displayName = 'ParticleTrail';
