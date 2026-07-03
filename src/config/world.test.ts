import { describe, it, expect } from 'vitest';
import { clampPlacement, PLACEMENT } from './world';

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
