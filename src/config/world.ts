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

// ==================== PHYSICS (world) ====================

export const PHYSICS = {
  gravity: [0, -15, 0] as Vec3,
  // Hinge (seesaw) + kinematic (spinner) need a bit more solver headroom than
  // plain contacts.
  iterations: 5,
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
  spawnCap: 10, // most simultaneous marbles
  spawnHeight: 12, // Space-drop height
  spawnClickMinY: 0.5, // click-spawned marbles never spawn below this
  spawnSpreadX: 10, // Space-drop horizontal spread: (rand-0.5) * spread

  // Appearance (base vs. goldenMarble unlock).
  colorBase: '#8A8A8A',
  colorGolden: '#E0E0E0',
  metalness: 0.9,
  roughnessBase: 0.1,
  roughnessGolden: 0.05,
  emissiveIntensityBase: 0.2,
  emissiveIntensityGolden: 0.4,
  glowIntensityBase: 0.5,
  glowIntensityGolden: 0.8,
  glowDistance: 2,
  glowDecay: 2,
} as const;

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
    flashColor: '#FFFFFF',
    flashDurationMs: 200,
    metalness: 0.8,
    roughness: 0.2,
  },
  chime: {
    args: [0.15, 0.15, 3] as Vec3,
    baseColor: '#4A4A4A',
    flashColor: '#E0E0E0',
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
    flashColor: '#D0D0D0',
    flashDurationMs: 1000,
    metalness: 0.9,
    roughness: 0.1,
  },
} as const;

// Hit-flash emissive intensities shared by useHitFlash (bumper/chime/bell).
export const HIT_FLASH = {
  emissiveActive: 0.35,
  emissiveIdle: 0.1,
} as const;

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

  // Ripple color palettes.
  rippleStandardColors: ['#FF4757', '#FFA502', '#FFDD59', '#00D2D3', '#5F27CD'],
  rippleRainbowColors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'],
  rippleGoldenColor: '#FFD700',
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

export const DIVINE_LIGHT = {
  spotlight: {
    position: [0, 30, 0] as Vec3,
    angle: 1.5,
    penumbra: 0.2,
    intensity: 20.0,
    color: '#FFD700', // golden
  },
  pointLights: [
    { position: [-12, 25, -12], color: '#FF6B6B', intensity: 8.0, distance: 80 }, // divine red
    { position: [12, 25, 12], color: '#4ECDC4', intensity: 8.0, distance: 80 }, // divine cyan
    { position: [-12, 25, 12], color: '#A855F7', intensity: 8.0, distance: 80 }, // divine purple
    { position: [12, 25, -12], color: '#F472B6', intensity: 8.0, distance: 80 }, // divine pink
    { position: [0, 20, 0], color: '#FFD700', intensity: 5.0, distance: 60 }, // center golden fill
  ] as PointLightDef[],
  ambient: { intensity: 3.0, color: '#FFD700' },
} as const;

// ==================== GROUND / SHADOWS ====================

export const GROUND = {
  planeArgs: [50, 50] as [number, number],
  position: [0, -2, 0] as Vec3,
  reflector: {
    mirror: 0.15,
    blur: [256, 256] as [number, number],
    resolution: 256,
    mixBlur: 0.7,
    mixStrength: 0.7,
    color: '#0A0A0F',
    metalness: 0.3,
    roughness: 0.3,
  },
} as const;

export const CONTACT_SHADOWS = {
  position: [0, -1.9, 0] as Vec3,
  opacity: 0.3,
  scale: 20,
  blur: 1.5,
  far: 8,
  // width/height are the shadow-plane dimensions (drei defaults 1, multiplied
  // by `scale`), NOT the render-target size. The FBO is `resolution` (default
  // 512, made explicit here). `frames` is intentionally left at its default
  // (Infinity) because the shadow must track the marbles every frame.
  width: 1024,
  height: 1024,
  resolution: 512,
} as const;

// ==================== ATMOSPHERE ====================

export const ATMOSPHERE_PARTICLE_POSITIONS: Vec3[] = [
  [-9, 8, -12],
  [11, 14, 6],
  [-4, 17, 9],
  [7, 6, -8],
];

export const ATMOSPHERE_PARTICLE = {
  radius: 0.02,
  color: '#00BFA6',
  emissiveIntensity: 0.5,
  opacity: 0.6,
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
