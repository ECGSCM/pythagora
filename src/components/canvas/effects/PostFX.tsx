import { useState } from 'react';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { POSTFX } from '../../../config/experience';

// Post-processing pipeline (§3.1): Bloom makes emissive read as light, Vignette
// pulls the eye to center, Noise rescues the near-black gradients. No chromatic
// aberration, no DoF — both fight the meditative read / mobile budget.
//
// Mobile tier is detected ONCE at mount (not per frame): a narrow viewport
// halves the bloom render target and drops the noise pass. (devicePixelRatio is
// deliberately NOT used as the gate — an ordinary 1x desktop reports dpr 1,
// which would wrongly flag it as mobile; viewport width is the reliable signal.)
export const PostFX = () => {
  const [mobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < POSTFX.mobileMaxWidth,
  );

  // EffectComposer types its children as elements (no booleans), so the mobile
  // branch is assembled as an array rather than an inline `&&`.
  const effects = [
    <Bloom
      key="bloom"
      mipmapBlur
      luminanceThreshold={POSTFX.bloom.luminanceThreshold}
      luminanceSmoothing={POSTFX.bloom.luminanceSmoothing}
      intensity={POSTFX.bloom.intensity}
      radius={POSTFX.bloom.radius}
      levels={POSTFX.bloom.levels}
      resolutionScale={mobile ? POSTFX.mobileBloomResolutionScale : 1}
    />,
    <Vignette key="vignette" offset={POSTFX.vignette.offset} darkness={POSTFX.vignette.darkness} />,
  ];
  if (!mobile) effects.push(<Noise key="noise" opacity={POSTFX.noise.opacity} />);

  return <EffectComposer>{effects}</EffectComposer>;
};
