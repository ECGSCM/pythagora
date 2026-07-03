import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, romanMultiplier } from '../../../config/experience';
import { useGameStore } from '../../../stores/gameStore';
import { SceneLabel } from '../SceneLabel';

// Combo display, Divine dialect (§3.5): the multiplier as a Roman numeral (II..V)
// inside a thin ring, in moonlight — gold only at the apex (goldenMode / ×5).
// No "5x COMBO!" text; light and a numeral, not a HUD shout.
export const ComboDisplay = React.memo(() => {
  const meshRef = useRef<THREE.Group>(null);
  const display = useGameStore((s) => s.comboDisplay);
  const multiplier = useGameStore((s) => s.combo.multiplier);
  const goldenMode = useGameStore((s) => s.unlocks.goldenMode);

  // The store zeroes display.scale on the unlock flash (unlock thresholds
  // coincide with every multiplier tier), so scale is driven here, not from the
  // store — a gentle constant presence + slow spin, not a HUD pop.
  useFrame((_state, delta) => {
    if (meshRef.current && display.show) {
      meshRef.current.scale.setScalar(1);
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  const numeral = romanMultiplier(multiplier);
  // Only surface once there's a real multiplier tier to show.
  if (!display.show || numeral === '') return null;

  const color = goldenMode && multiplier >= 5 ? PALETTE.gold : PALETTE.moonlight;

  return (
    <group ref={meshRef} position={[0, 8, 0]}>
      {/* Thin ring around the numeral. */}
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[1.4, 0.03, 8, 64]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>

      <SceneLabel fontSize={1.5} color={color} anchorX="center" anchorY="middle" position={[0, 0, 0]}>
        {numeral}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </SceneLabel>
    </group>
  );
});
ComboDisplay.displayName = 'ComboDisplay';
