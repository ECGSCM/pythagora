// Centralized world tuning constants for Pythagora Synth.
//
// Every magic number that used to live inline in Physics3DCanvas.tsx and
// App.tsx is collected here, grouped by domain, so the scene modules read
// their geometry / colors / physics from a single source of truth. Values are
// carried over verbatim from Phase 2/3 — this is a pure structural move, no
// behavioural change (REFACTORING_PLAN.md Phase 4).

import type { PatchNode } from '../types/patch';

// ==================== SHARED TYPES ====================

export type Vec3 = [number, number, number];
/** Cylinder geometry args: [radiusTop, radiusBottom, height, radialSegments]. */
export type CylinderArgs = [number, number, number, number];

// The Phase 5B visual-layer tuning (palette, post-processing, aurora, starfield,
// reward glyphs) lives in ./experience.ts to keep this file focused on physics
// and geometry.

// ==================== PHYSICS (world) ====================

export const PHYSICS = {
  gravity: [0, -15, 0] as Vec3,
  // Hinge (seesaw) + kinematic (spinner) need a bit more solver headroom than
  // plain contacts.
  iterations: 5,
  // Fixed timestep with a hard catch-up cap: without maxSubSteps a slow frame
  // makes the worker run extra substeps, which slows the next frame further —
  // a death spiral that reads as a freeze under load. Capping at 3 trades
  // slight slow-motion during spikes for a stable frame rate.
  stepSize: 1 / 60,
  maxSubSteps: 3,
  broadphase: 'Naive' as const,
  defaultContactMaterial: { friction: 0.4, restitution: 0.7 },
  allowSleep: true,
  size: 10, // world size hint for broadphase optimization
} as const;

// ==================== MARBLE ====================

export const MARBLE = {
  mass: 1,
  radius: 0.3,
  material: { restitution: 0.7, friction: 0.3 },

  // Rest / completion detection: a marble's run ends when it falls out of the
  // world or sits still long enough (REFACTORING_PLAN.md P6).
  restSeconds: 2.5,
  restSpeed: 0.15,
  fallLimitY: -8,

  // Spawn behaviour.
  // Cap on ACTIVE marbles: spawning past it evicts the oldest via the ascension
  // fade (Scene.addMarble / <Marble evict>), not an instant unmount. A few
  // extra orbs may exist briefly while they fade out.
  spawnCap: 10,
  spawnHeight: 12, // Space-drop height
  spawnClickMinY: 0.5, // click-spawned marbles never spawn below this
  spawnSpreadX: 10, // Space-drop horizontal spread: (rand-0.5) * spread

  // Appearance (base vs. goldenMarble unlock). Under bloom the marble reads as a
  // light-orb / comet, so emissive is a constant ~1.2 and the per-marble
  // pointLight is gone (bloom replaces it — §3.2).
  colorBase: '#8A8A8A',
  colorGolden: '#D4AF37',
  metalness: 0.9,
  roughnessBase: 0.1,
  roughnessGolden: 0.05,
  emissiveBase: '#E8E6E0', // moonlight glow
  emissiveGolden: '#D4AF37', // gold glow keeps golden marble distinct
  // ~0.9 blooms as a light-orb without going nuclear when several overlap near
  // the spawn cluster (§3.2 tuning).
  emissiveIntensityBase: 0.9,
  emissiveIntensityGolden: 0.9,

  // Settle = ascension (§3.2): a 1s fade (scale down, emissive up then out)
  // plus a few points drifting upward before the marble is removed.
  settleFadeSec: 1.0,
  settleEmissivePeak: 2.6,
  ascensionCount: 8,
  ascensionRisePerSec: 3.0,

  // Comet trail colors (moonlight normally, gold once golden marble unlocks).
  trailColor: '#E8E6E0',
  trailColorGolden: '#D4AF37',

  // Comet trail size (always visible from the first drop). The enhanced size
  // is the visible payoff of the 5-combo `enhancedParticles` unlock.
  trailSize: 0.35,
  trailSizeEnhanced: 0.55,
} as const;

// Fixed unit XZ offsets for the ascension motes (deterministic — no Math.random
// in render, which would teleport them each frame / trip the hooks lint).
export const ASCENSION_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0.12, 0.0],
  [-0.1, 0.08],
  [0.06, -0.12],
  [-0.08, -0.09],
  [0.14, 0.05],
  [-0.13, 0.03],
  [0.02, 0.13],
  [0.0, -0.14],
];

// ==================== QUALITY TIER (§7D adaptive quality) ====================

/**
 * Adaptive quality tier, stepped by drei's PerformanceMonitor off real FPS
 * (COMMERCIAL_GRADE_PLAN.md §7D). The type lives here rather than in
 * experience.ts because `effectiveSpawnCap` below is a gameplay/physics
 * concern that gameStore.ts needs alongside GAMEPLAY/MARBLE — putting it in
 * experience.ts (which already imports types from this file) would create a
 * world.ts <-> experience.ts import cycle. experience.ts's per-tier visual
 * config (dpr/bloom/noise/starfield) imports this same type from here.
 */
export type QualityTier = 'high' | 'medium' | 'low';

/** Active marble cap on the 'low' tier — a struggling GPU shouldn't also be
 * asked to render a full spawnCap of overlapping bloom orbs. */
export const LOW_QUALITY_SPAWN_CAP = 6;

/** The spawn cap Scene.addMarble should enforce for the current quality tier. */
export function effectiveSpawnCap(tier: QualityTier): number {
  return tier === 'low' ? LOW_QUALITY_SPAWN_CAP : MARBLE.spawnCap;
}

// ==================== MODULES ====================

export const MODULES = {
  ramp: {
    args: [4, 0.2, 2] as Vec3,
    defaultAngle: 15, // degrees
    material: { friction: 0.05, restitution: 0.2 },
    color: '#3A3A3A',
    roughness: 0.9,
    metalness: 0.1,
  },
  bumper: {
    args: [1.2, 1.2, 0.6] as Vec3,
    material: { restitution: 0.9, friction: 0.2 },
    baseColor: '#3A3A3A',
    flashColor: '#E8E6E0', // moonlight (subtle swap, not pure white)
    flashDurationMs: 200,
    metalness: 0.8,
    roughness: 0.2,
  },
  chime: {
    args: [0.15, 0.15, 3] as Vec3,
    baseColor: '#4A4A4A',
    flashColor: '#E8E6E0', // moonlight
    flashDurationMs: 500,
    metalness: 0.9,
    roughness: 0.1,
  },
  spinner: {
    // Collider hub is coarse (12 segments); the visible hub is smooth (24).
    hubColliderArgs: [0.6, 0.6, 0.4, 12] as CylinderArgs,
    hubVisualArgs: [0.6, 0.6, 0.4, 24] as CylinderArgs,
    paddleArgsA: [3.8, 0.35, 0.5] as Vec3,
    paddleArgsB: [0.5, 0.35, 3.8] as Vec3,
    defaultSpeed: 1.0,
    speedFactor: 1.5, // angularVelocity = speed * speedFactor
    hubColor: '#5A5A5A',
    paddleColor: '#6A6A6A',
    paddleEmissive: '#5A5A5A',
  },
  funnel: {
    args: [2, 0.3, 2] as Vec3,
    color: '#4A4A4A',
    metalness: 0.7,
    roughness: 0.3,
  },
  seesaw: {
    plankArgs: [3, 0.2, 0.8] as Vec3,
    plankMass: 2,
    plankAngularDamping: 0.6,
    plankLinearDamping: 0.05,
    plankMaterial: { friction: 0.4, restitution: 0.3 },
    postArgs: [0.18, 0.4, 1.2, 12] as CylinderArgs,
    postOffsetY: -0.6, // post sits below the plank pivot
    hingePivotB: [0, 0.6, 0] as Vec3, // top of the post (plank rotates about world Z)
    plankColor: '#6A6A6A',
    postColor: '#4A4A4A',
  },
  bell: {
    args: [1, 1.5, 2] as Vec3,
    baseColor: '#7A7A7A',
    flashColor: '#E8E6E0', // moonlight
    flashDurationMs: 1000,
    metalness: 0.9,
    roughness: 0.1,
  },
} as const;

// Hit = light (§3.1/§3.4). A hit spikes emissiveIntensity to a bloom-blowing
// peak and decays exponentially (same shape as the sound's tail) back down into
// the resting breath. The color swap is kept subtle (moonlight, not white).
export const HIT_FLASH = {
  emissivePeak: 2.5,
  // Exponential time constant (ms): the spike is ~e^-3 (≈5%) after ~3τ, so a
  // ~100ms τ reads as a ~300ms glow.
  emissiveDecayMs: 100,
} as const;

// Shared breathing clock (§3.3): every resting emissive oscillates between
// these bounds on a 5s sine, phase-shifted per module position so the pulse
// travels across the field.
export const BREATH = {
  periodSec: 5,
  emissiveMin: 0.06,
  emissiveMax: 0.14,
} as const;

/** Breath phase offset derived from a module's world position (§3.3). */
export function breathPhaseFromPosition(pos: Vec3): number {
  return pos[0] * 0.3 + pos[1] * 0.2;
}

// ==================== GAMEPLAY ====================

export const GAMEPLAY = {
  comboTimeoutMs: 2000,
  collisionCooldownMs: 120, // per-module gate against machine-gunning (P5)
  minImpactVelocity: 1.2,

  rippleCap: 5,
  rippleDurationSec: 1.0,

  scorePerHit: 10, // multiplied by the active multiplier

  unlockThresholds: {
    enhancedParticles: 5,
    goldenMarble: 10,
    rainbowRipples: 15,
    goldenMode: 20,
  },

  perfectRunThreshold: 15,
  perfectRunHideMs: 3000,
  comboDisplayHideMs: 1000, // multiplier-increase banner
  unlockDisplayHideMs: 2000, // unlock color-dimension flash
  celebrationHideMs: 2000, // completion celebration

  // Ripple color ladder, aligned to the four-color palette (§1.2): moonlight
  // for ordinary hits, turquoise as the combo warms up, gold at the apex. The
  // old red/orange/rainbow ripples read as noise inside Divine Monochrome.
  rippleStandardColors: ['#E8E6E0', '#E8E6E0', '#00BFA6', '#00BFA6', '#D4AF37'],
  rippleRainbowColors: ['#E8E6E0', '#00BFA6', '#E8E6E0', '#00BFA6', '#E8E6E0', '#00BFA6', '#D4AF37'],
  rippleGoldenColor: '#D4AF37',
} as const;

/** combo count -> score multiplier (mirrors the old calculateMultiplier). */
export function calculateMultiplier(combo: number): number {
  if (combo >= 20) return 5;
  if (combo >= 15) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

// Multiplier-tier colors, shared by ComboDisplay text + standard ripples.
export const MULTIPLIER_COLORS = ['#FF4757', '#FFA502', '#FFDD59', '#00D2D3', '#5F27CD'];

// ==================== PLACEMENT ====================

export const PLACEMENT = {
  clampX: 16, // click x clamped to ±16
  clampYMin: 0,
  clampYMax: 24,
  planeArgs: [70, 44] as [number, number],
  planePosition: [0, 12, 0] as Vec3,
} as const;

/**
 * Clamp a raw placement-plane hit point into the playable bounds. Shared by
 * Scene's pointer-down handler and GhostPreview so the hover preview and the
 * actual placement can never disagree about where a module will land — a
 * click near a viewport edge used to snap the module far from the cursor with
 * zero visual warning (COMMERCIAL_GRADE_PLAN.md §7C, diagnosis #2).
 */
export function clampPlacement(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, -PLACEMENT.clampX), PLACEMENT.clampX),
    y: Math.min(Math.max(y, PLACEMENT.clampYMin), PLACEMENT.clampYMax),
  };
}

// ==================== CAMERA / LIGHTS ====================

export const CAMERA = {
  position: [15, 12, 15] as Vec3,
  fov: 60,
  orbit: {
    minDistance: 8,
    maxDistance: 40,
    maxPolarAngle: Math.PI / 2.2,
    target: [0, 2, 0] as Vec3,
  },
} as const;

export const LIGHTS = {
  ambientIntensity: 0.3,
  directional: {
    position: [10, 15, 10] as Vec3,
    intensity: 1.0,
  },
} as const;

// Divine-light rig — data-driven so Scene just maps over it.
export interface PointLightDef {
  position: Vec3;
  color: string;
  intensity: number;
  distance: number;
}

// Rebalanced for the bloom pipeline (§3.1): the pre-bloom values (spot 20 /
// points 8 / ambient 3) blew the whole frame to white once the composer added
// emissive bloom. These read as "sacred shafts" through the composer.
export const DIVINE_LIGHT = {
  spotlight: {
    position: [0, 30, 0] as Vec3,
    angle: 1.5,
    penumbra: 0.2,
    intensity: 5.0,
    color: '#FFD700', // golden
  },
  pointLights: [
    { position: [-12, 25, -12], color: '#FF6B6B', intensity: 2.0, distance: 80 }, // divine red
    { position: [12, 25, 12], color: '#4ECDC4', intensity: 2.0, distance: 80 }, // divine cyan
    { position: [-12, 25, 12], color: '#A855F7', intensity: 2.0, distance: 80 }, // divine purple
    { position: [12, 25, -12], color: '#F472B6', intensity: 2.0, distance: 80 }, // divine pink
    { position: [0, 20, 0], color: '#FFD700', intensity: 1.2, distance: 60 }, // center golden fill
  ] as PointLightDef[],
  ambient: { intensity: 0.7, color: '#FFD700' },
} as const;

// ==================== GROUND / SHADOWS ====================

// Perf: the ground was a MeshReflectorMaterial (a full extra scene render per
// frame) plus ContactShadows (a depth render + two blur passes per frame).
// Both were nearly invisible on a near-black floor and together they roughly
// tripled the per-frame render cost — removed in the performance pass.
export const GROUND = {
  planeArgs: [50, 50] as [number, number],
  position: [0, -2, 0] as Vec3,
  reflector: {
    color: '#0A0A0F',
  },
} as const;


// ==================== APP: MODULE DEFAULTS + DEMO LAYOUT ====================

/** Default params for a freshly-placed module (moved from App.tsx). */
export function getDefaultParams(
  moduleType: PatchNode['type'],
): Record<string, string | number | string[]> {
  switch (moduleType) {
    case 'ramp':
      return { angle: 15, material: 'wood' };
    case 'bumper':
      return { pitch: 'C4', resonance: 0.8 };
    case 'chime':
      return { note: 'A4', decay: 2.0 };
    case 'spinner':
      return { speed: 1.0, notes: ['C4', 'E4', 'G4'] };
    case 'funnel':
      return { effect: 'spiral', intensity: 0.7 };
    case 'seesaw':
      return { balance: 0.5, sensitivity: 1.0 };
    case 'bell':
      return { frequency: 440, harmonics: 3 };
    default:
      return {};
  }
}

// Demo modules seeded on first entry (moved from App.tsx handleEnter).
export const DEMO_LAYOUT: PatchNode[] = [
  {
    id: 'ramp-demo-1',
    type: 'ramp',
    // Negative angle slopes down toward +x, sending marbles across the
    // bumper/chime/bell chain to the right.
    position: { x: -5, y: 8 },
    params: { angle: -20 },
  },
  {
    id: 'bumper-demo-1',
    type: 'bumper',
    position: { x: 0, y: 5 },
    params: { pitch: 'C4' },
  },
  {
    id: 'chime-demo-1',
    type: 'chime',
    position: { x: 3, y: 3 },
    params: { note: 'E4' },
  },
  {
    id: 'bell-demo-1',
    type: 'bell',
    position: { x: 6, y: 1 },
    params: { frequency: 528 },
  },
];
