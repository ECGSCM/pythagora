import { describe, it, expect } from 'vitest';
import { clampPlacement, PLACEMENT, effectiveSpawnCap, LOW_QUALITY_SPAWN_CAP, MARBLE } from './world';

describe('clampPlacement', () => {
  it('passes through points already inside the bounds unchanged', () => {
    expect(clampPlacement(3, 10)).toEqual({ x: 3, y: 10 });
    expect(clampPlacement(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('clamps x to +-clampX at the horizontal edges', () => {
    expect(clampPlacement(-50, 10)).toEqual({ x: -PLACEMENT.clampX, y: 10 });
    expect(clampPlacement(50, 10)).toEqual({ x: PLACEMENT.clampX, y: 10 });
  });

  it('clamps y to [clampYMin, clampYMax] at the vertical edges', () => {
    expect(clampPlacement(0, -10)).toEqual({ x: 0, y: PLACEMENT.clampYMin });
    expect(clampPlacement(0, 100)).toEqual({ x: 0, y: PLACEMENT.clampYMax });
  });

  it('clamps both axes independently at a far corner click', () => {
    expect(clampPlacement(-100, 999)).toEqual({ x: -PLACEMENT.clampX, y: PLACEMENT.clampYMax });
    expect(clampPlacement(999, -999)).toEqual({ x: PLACEMENT.clampX, y: PLACEMENT.clampYMin });
  });
});

// Adaptive quality (COMMERCIAL_GRADE_PLAN.md §7D): 'low' halves the active
// marble budget so a struggling GPU isn't also asked to render a full
// spawnCap of overlapping bloom orbs.
describe('effectiveSpawnCap', () => {
  it('returns MARBLE.spawnCap on high and medium tiers', () => {
    expect(effectiveSpawnCap('high')).toBe(MARBLE.spawnCap);
    expect(effectiveSpawnCap('medium')).toBe(MARBLE.spawnCap);
  });

  it('returns the reduced cap on the low tier', () => {
    expect(effectiveSpawnCap('low')).toBe(LOW_QUALITY_SPAWN_CAP);
    expect(LOW_QUALITY_SPAWN_CAP).toBeLessThan(MARBLE.spawnCap);
  });
});
