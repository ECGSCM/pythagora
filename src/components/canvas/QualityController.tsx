import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGameStore } from '../../stores/gameStore';
import { QUALITY_TIERS } from '../../config/experience';

// Adaptive quality (§7D): Canvas's `dpr` prop only sets the INITIAL device
// pixel ratio — r3f doesn't watch it for changes after mount — so stepping the
// quality tier must push the new dpr through the r3f store's imperative
// `setDpr` instead. Mounted inside <Canvas> (any depth) purely for the
// useThree context; it renders nothing.
//
// Tier changes are rare events (PerformanceMonitor debounces its own
// onIncline/onDecline to multi-second windows — see Physics3DCanvas), so this
// is a plain effect keyed on the tier value, not a per-frame useFrame write
// (which the project's lint rules treat as a smell for anything but genuinely
// continuous state).
export const QualityController = () => {
  const setDpr = useThree((state) => state.setDpr);
  const tier = useGameStore((state) => state.qualityTier);

  useEffect(() => {
    setDpr(QUALITY_TIERS[tier].dpr);
  }, [tier, setDpr]);

  return null;
};
