// Phase 5B "Sound is Light" visual-layer tuning (EXPERIENCE_DESIGN.md §1/§3).
//
// Kept separate from world.ts (physics/geometry) so the aesthetic knobs — the
// four-color palette, post-processing, aurora, starfield, reward glyphs — read
// as one system and world.ts stays focused on the machine.

import type { Vec3, QualityTier } from './world';

// ==================== PALETTE (§1.2) ====================

/**
 * The whole aesthetic lives in four colors. Anything NEW (Phase 5B) draws only
 * from here; older rainbow ripple palettes are grandfathered.
 */
export const PALETTE = {
  ink: '#0A0A0F', // near-black world
  moonlight: '#E8E6E0', // resting light
  turquoise: '#00BFA6', // modulation / aurora
  gold: '#D4AF37', // combo apex / golden mode
} as const;

// ==================== POST-PROCESSING (§3.1) ====================

export const POSTFX = {
  // Tight halo, dark world: radius is the spatial size of the glow — at 0.8 a
  // single marble's halo swallowed half the screen ("street lamp in fog").
  // 0.35 keeps the orb a crisp point of light with a close-fitting corona, and
  // the higher threshold means only genuinely luminous things (marbles, hit
  // flashes, aurora) bloom at all — the near-black world stays black.
  bloom: {
    luminanceThreshold: 0.8,
    luminanceSmoothing: 0.08,
    intensity: 0.5,
    radius: 0.35,
    // MipmapBlur's spatial reach is governed by the MIP chain depth (default 8
    // ≈ halo across half the viewport). 4 levels keeps the corona close to the
    // light source, preserving the dark world.
    levels: 4,
    // Bloom is low-frequency glow — computing it at half resolution is
    // visually indistinguishable and roughly quarters the bloom pass cost.
    resolutionScale: 0.5,
  },
  vignette: { offset: 0.32, darkness: 0.55 },
  noise: { opacity: 0.015 },
  // Narrow-viewport threshold: used once, at mount, as the adaptive-quality
  // initial tier hint (§7D QUALITY_TIERS below) — not for a per-frame check.
  mobileMaxWidth: 768,
} as const;

// ==================== AURORA PULSE (§3.4) ====================

export const AURORA = {
  color: PALETTE.turquoise,
  maxRadius: 30,
  durationSec: 2.5,
  peakOpacity: 0.35,
  ringThickness: 0.6, // ring inner/outer gap at unit scale
  labelColor: PALETTE.turquoise,
  labelFontSize: 1.2,
  labelPosition: [0, 1, 0] as Vec3,
} as const;

// ==================== STARFIELD (§3.6) ====================

export const STARFIELD = {
  count: 200,
  radiusMin: 25,
  radiusMax: 45,
  size: 0.06,
  color: PALETTE.moonlight,
  opacity: 0.5,
  rotationDegPerSec: 0.05,
} as const;

// ==================== ADAPTIVE QUALITY (§7D) ====================

/**
 * Per-tier visual budget, stepped by drei's PerformanceMonitor off real FPS
 * (COMMERCIAL_GRADE_PLAN.md §7D). `bloomEnabled: false` means PostFX skips the
 * whole EffectComposer (plain render, no post pass at all) rather than just
 * disabling the Bloom effect inside it.
 */
export const QUALITY_TIERS: Record<
  QualityTier,
  {
    dpr: [number, number];
    bloomEnabled: boolean;
    bloomResolutionScale: number;
    noiseEnabled: boolean;
    starfieldCount: number;
  }
> = {
  high: {
    dpr: [1, 1.5],
    bloomEnabled: true,
    bloomResolutionScale: POSTFX.bloom.resolutionScale,
    noiseEnabled: true,
    starfieldCount: STARFIELD.count,
  },
  medium: {
    dpr: [1, 1.25],
    bloomEnabled: true,
    bloomResolutionScale: 0.35,
    noiseEnabled: false,
    starfieldCount: STARFIELD.count,
  },
  low: {
    dpr: [1, 1],
    bloomEnabled: false,
    // Unused while bloomEnabled is false (PostFX renders no EffectComposer at
    // all on 'low') — kept for type uniformity across tiers.
    bloomResolutionScale: 0.35,
    noiseEnabled: false,
    starfieldCount: 100,
  },
} as const;

// ==================== REWARD DISPLAY (§3.5) ====================

/** Roman numeral for the combo multiplier (2..5); '' below 2. */
export function romanMultiplier(multiplier: number): string {
  switch (multiplier) {
    case 2:
      return 'II';
    case 3:
      return 'III';
    case 4:
      return 'IV';
    case 5:
      return 'V';
    default:
      return '';
  }
}

// General-purpose Roman numeral conversion, unlike `romanMultiplier` (which
// only covers the 2..5 multiplier tiers) this handles any positive integer —
// used by the Landing session summary (§4.2) to render an arbitrary combo
// streak ("VII chain"). Pure/table-driven, no allocation beyond the result
// string.
const ROMAN_TABLE: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Convert a positive integer to a Roman numeral string; 0 or below -> '0'. */
export function toRomanNumeral(value: number): string {
  let n = Math.floor(value);
  if (n <= 0) return '0';
  let out = '';
  for (const [amount, numeral] of ROMAN_TABLE) {
    while (n >= amount) {
      out += numeral;
      n -= amount;
    }
  }
  return out;
}

// ==================== PLACEMENT GESTURE (§7C) ====================

/**
 * Click-vs-drag thresholds for placement on the interaction plane.
 *
 * Placement used to fire straight off `pointerdown`, but OrbitControls listens
 * for `pointerdown` on the very same canvas element and r3f's
 * `event.stopPropagation()` only prunes r3f's own intersection list — it never
 * stops the DOM event. So every orbit/pan drag also dropped a marble or a
 * module at the press point. Placement is therefore decided on pointer-UP, and
 * only when the whole gesture reads as a click.
 *
 * (Input tuning lives here rather than in world.ts's PLACEMENT block: that one
 * describes the physical placement plane and its clamp bounds, this describes
 * the pointer gesture that triggers a placement.)
 */
export const PLACEMENT_GESTURE = {
  /** Mouse/pen slop, in CSS px. 6px sits just above the ~5px browsers
   * themselves use to separate a click from a drag, so an ordinary click —
   * which almost always moves 0-2px — always places, while an orbit drag
   * (tens of px) never does. */
  maxMovePx: 6,
  /** Touch slop, in CSS px. A finger "tap" routinely wanders 8-10px before
   * lift-off, so mouse slop applied to touch would make taps unreliable;
   * 12px is the usual mobile tap slop and is still far below a one-finger
   * orbit drag. */
  touchMaxMovePx: 12,
  /** Upper bound on a click, in ms. Movement is the primary signal (and is
   * measured as the FURTHEST the pointer ever got from the press point, so a
   * drag that loops back doesn't sneak through); this only rejects a
   * press-and-hold that happened to end near where it started. Generous at
   * 800ms so a slow, deliberate click still places. */
  maxDurationMs: 800,
} as const;

/** A completed pointer gesture over the placement plane, reduced to the only
 * facts the click/drag decision needs. */
export interface PlacementGesture {
  /** PointerEvent.pointerType ('mouse' | 'pen' | 'touch' | ...). */
  pointerType: string;
  /** Furthest distance, in CSS px, the pointer reached from the press point. */
  movedPx: number;
  /** Time from pointerdown to pointerup, in ms. */
  durationMs: number;
}

/**
 * True when a finished gesture should place (a click), false when it was a
 * camera drag. Pure — the whole decision is unit-tested in isolation.
 */
export function isPlacementClick(gesture: PlacementGesture): boolean {
  const slop =
    gesture.pointerType === 'touch' ? PLACEMENT_GESTURE.touchMaxMovePx : PLACEMENT_GESTURE.maxMovePx;
  return gesture.movedPx <= slop && gesture.durationMs <= PLACEMENT_GESTURE.maxDurationMs;
}

// ==================== PRESENCE (§4.1) ====================

/**
 * "The UI exists to disappear": after `idleMs` of no pointer/keyboard/touch
 * activity, overlay chrome (controls, module bar, help card) fades to
 * invisible over `fadeOutSec`; any activity restores it over the much
 * quicker `fadeInSec`. See `components/ui/usePresence.ts`.
 */
export const PRESENCE = {
  idleMs: 30000,
  fadeOutSec: 2,
  fadeInSec: 0.3,
} as const;
