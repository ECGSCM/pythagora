import React from 'react';
import { Sphere } from '@react-three/drei';
import { ATMOSPHERE_PARTICLE_POSITIONS, ATMOSPHERE_PARTICLE } from '../../config/world';

// Fixed ambient dust motes around the play area. Positions are constant (the
// old JSX used inline Math.random(), teleporting them every re-render — §0.5).
export const Atmosphere = React.memo(() => (
  <group>
    {ATMOSPHERE_PARTICLE_POSITIONS.map((pos, i) => (
      <Sphere key={i} args={[ATMOSPHERE_PARTICLE.radius]} position={pos}>
        <meshStandardMaterial
          color={ATMOSPHERE_PARTICLE.color}
          emissive={ATMOSPHERE_PARTICLE.color}
          emissiveIntensity={ATMOSPHERE_PARTICLE.emissiveIntensity}
          transparent
          opacity={ATMOSPHERE_PARTICLE.opacity}
        />
      </Sphere>
    ))}
  </group>
));
Atmosphere.displayName = 'Atmosphere';
