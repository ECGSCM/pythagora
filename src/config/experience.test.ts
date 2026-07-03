import { describe, it, expect } from 'vitest';
import { toRomanNumeral } from './experience';

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
