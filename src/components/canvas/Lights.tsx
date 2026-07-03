import React from 'react';
import { LIGHTS, DIVINE_LIGHT } from '../../config/world';

// Base scene lighting plus the optional data-driven "divine light" rig.
export const Lights = React.memo(({ divineLightActive }: { divineLightActive: boolean }) => (
  <>
    <ambientLight intensity={LIGHTS.ambientIntensity} />
    <directionalLight position={LIGHTS.directional.position} intensity={LIGHTS.directional.intensity} />

    {divineLightActive && (
      <>
        <spotLight
          position={DIVINE_LIGHT.spotlight.position}
          angle={DIVINE_LIGHT.spotlight.angle}
          penumbra={DIVINE_LIGHT.spotlight.penumbra}
          intensity={DIVINE_LIGHT.spotlight.intensity}
          color={DIVINE_LIGHT.spotlight.color}
        />
        {DIVINE_LIGHT.pointLights.map((light, i) => (
          <pointLight
            key={i}
            position={light.position}
            intensity={light.intensity}
            color={light.color}
            distance={light.distance}
          />
        ))}
        <ambientLight intensity={DIVINE_LIGHT.ambient.intensity} color={DIVINE_LIGHT.ambient.color} />
      </>
    )}
  </>
));
Lights.displayName = 'Lights';
