import { describe, it, expect } from 'vitest';
import { toRomanNumeral, QUALITY_TIERS } from './experience';

describe('toRomanNumeral', () => {
  it('converts small values', () => {
    expect(toRomanNumeral(1)).toBe('I');
    expect(toRomanNumeral(4)).toBe('IV');
    expect(toRomanNumeral(9)).toBe('IX');
  });

  it('converts a session-summary-scale combo streak (§4.2 "VII chain")', () => {
    expect(toRomanNumeral(7)).toBe('VII');
    expect(toRomanNumeral(42)).toBe('XLII');
  });

  it('handles values beyond romanMultiplier\'s 2..5 range', () => {
    expect(toRomanNumeral(20)).toBe('XX');
    expect(toRomanNumeral(99)).toBe('XCIX');
  });

  it('clamps non-positive input to "0"', () => {
    expect(toRomanNumeral(0)).toBe('0');
    expect(toRomanNumeral(-3)).toBe('0');
  });
});

// Adaptive quality (COMMERCIAL_GRADE_PLAN.md §7D): each tier must get lighter
// (or equal) than the one above it, and 'low' must skip bloom entirely (PostFX
// renders no EffectComposer at all, not just a disabled Bloom pass).
describe('QUALITY_TIERS', () => {
  it('steps dpr, bloom, noise and starfield count down from high to low', () => {
    expect(QUALITY_TIERS.high.bloomEnabled).toBe(true);
    expect(QUALITY_TIERS.high.noiseEnabled).toBe(true);
    expect(QUALITY_TIERS.medium.bloomEnabled).toBe(true);
    expect(QUALITY_TIERS.medium.noiseEnabled).toBe(false);
    expect(QUALITY_TIERS.low.bloomEnabled).toBe(false);
    expect(QUALITY_TIERS.low.noiseEnabled).toBe(false);

    // dpr upper bound is non-increasing high -> medium -> low.
    expect(QUALITY_TIERS.medium.dpr[1]).toBeLessThanOrEqual(QUALITY_TIERS.high.dpr[1]);
    expect(QUALITY_TIERS.low.dpr[1]).toBeLessThanOrEqual(QUALITY_TIERS.medium.dpr[1]);

    // Starfield count is non-increasing high -> medium -> low.
    expect(QUALITY_TIERS.medium.starfieldCount).toBeLessThanOrEqual(QUALITY_TIERS.high.starfieldCount);
    expect(QUALITY_TIERS.low.starfieldCount).toBeLessThanOrEqual(QUALITY_TIERS.medium.starfieldCount);
  });
});
