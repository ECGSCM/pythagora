import { describe, it, expect } from 'vitest';
import { toRomanNumeral, QUALITY_TIERS, PLACEMENT_GESTURE, isPlacementClick } from './experience';

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

// Placement gesture (§7C): placing on pointerdown meant every OrbitControls
// drag also dropped a module/marble at the press point, because r3f's
// stopPropagation never stops the DOM event the controls are listening for.
// Placement is now decided on pointer-up by this pure predicate.
describe('isPlacementClick', () => {
  const gesture = (over: Partial<Parameters<typeof isPlacementClick>[0]> = {}) => ({
    pointerType: 'mouse',
    movedPx: 0,
    durationMs: 80,
    ...over,
  });

  it('places on a quick, still mouse click', () => {
    expect(isPlacementClick(gesture())).toBe(true);
    expect(isPlacementClick(gesture({ movedPx: 2 }))).toBe(true);
  });

  it('rejects an orbit drag', () => {
    expect(isPlacementClick(gesture({ movedPx: 40, durationMs: 300 }))).toBe(false);
  });

  it('treats the mouse slop bound as inclusive', () => {
    expect(isPlacementClick(gesture({ movedPx: PLACEMENT_GESTURE.maxMovePx }))).toBe(true);
    expect(isPlacementClick(gesture({ movedPx: PLACEMENT_GESTURE.maxMovePx + 0.5 }))).toBe(false);
  });

  it('allows more slop for touch than for mouse, so a tap still places', () => {
    const wobble = PLACEMENT_GESTURE.maxMovePx + 2;
    expect(wobble).toBeLessThanOrEqual(PLACEMENT_GESTURE.touchMaxMovePx);
    expect(isPlacementClick(gesture({ pointerType: 'touch', movedPx: wobble }))).toBe(true);
    expect(isPlacementClick(gesture({ pointerType: 'mouse', movedPx: wobble }))).toBe(false);
  });

  it('still rejects a one-finger orbit drag on touch', () => {
    expect(
      isPlacementClick(gesture({ pointerType: 'touch', movedPx: PLACEMENT_GESTURE.touchMaxMovePx + 1 })),
    ).toBe(false);
  });

  it('treats a pen contact like a mouse', () => {
    expect(isPlacementClick(gesture({ pointerType: 'pen', movedPx: 3 }))).toBe(true);
    expect(
      isPlacementClick(gesture({ pointerType: 'pen', movedPx: PLACEMENT_GESTURE.maxMovePx + 1 })),
    ).toBe(false);
  });

  it('rejects a press-and-hold that never moved', () => {
    expect(isPlacementClick(gesture({ durationMs: PLACEMENT_GESTURE.maxDurationMs }))).toBe(true);
    expect(isPlacementClick(gesture({ durationMs: PLACEMENT_GESTURE.maxDurationMs + 1 }))).toBe(false);
  });

  it('leaves room for a deliberate, unhurried click', () => {
    // A user lining a placement up takes noticeably longer than a reflex
    // click; half a second must still place.
    expect(isPlacementClick(gesture({ durationMs: 500, movedPx: 3 }))).toBe(true);
  });
});
