import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { POSTFX, QUALITY_TIERS } from '../../../config/experience';
import { useGameStore } from '../../../stores/gameStore';

// Post-processing pipeline (§3.1): Bloom makes emissive read as light, Vignette
// pulls the eye to center, Noise rescues the near-black gradients. No chromatic
// aberration, no DoF — both fight the meditative read / mobile budget.
//
// Adaptive quality (§7D): the pipeline now reads its shape from the store's
// qualityTier (stepped by drei's PerformanceMonitor off real FPS in
// Physics3DCanvas, with a one-time mobile-viewport hint at mount — see
// QUALITY_TIERS in config/experience.ts for the per-tier table). On 'low' the
// whole EffectComposer is skipped — not just Bloom disabled inside it — so a
// struggling GPU drops the post pass entirely rather than paying for an
// (almost) empty composer.
export const PostFX = () => {
  const tier = useGameStore((state) => state.qualityTier);
  const config = QUALITY_TIERS[tier];

  if (!config.bloomEnabled) return null;

  // EffectComposer types its children as elements (no booleans), so the noise
  // toggle is assembled as an array rather than an inline `&&`.
  const effects = [
    <Bloom
      key="bloom"
      mipmapBlur
      luminanceThreshold={POSTFX.bloom.luminanceThreshold}
      luminanceSmoothing={POSTFX.bloom.luminanceSmoothing}
      intensity={POSTFX.bloom.intensity}
      radius={POSTFX.bloom.radius}
      levels={POSTFX.bloom.levels}
      resolutionScale={config.bloomResolutionScale}
    />,
    <Vignette key="vignette" offset={POSTFX.vignette.offset} darkness={POSTFX.vignette.darkness} />,
  ];
  if (config.noiseEnabled) effects.push(<Noise key="noise" opacity={POSTFX.noise.opacity} />);

  // multisampling=0: MSAA on the composer's buffers is expensive and pointless
  // here — bloom/grain hide aliasing, and the base render has antialias:false.
  return <EffectComposer multisampling={0}>{effects}</EffectComposer>;
};
