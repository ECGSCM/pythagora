import { describe, it, expect, vi } from 'vitest';
import {
  INSTRUMENT_BASE_HZ,
  SCALE_ROOT_HZ,
  brightnessCutoffMul,
  brightnessHighpassCutoffMul,
  computeVoiceLifetimeMs,
  cutoffHz,
  randomScaleFreq,
} from './instruments';
import {
  BRIGHTNESS_CUTOFF_MUL_MAX,
  BRIGHTNESS_CUTOFF_MUL_MIN,
  FILTER_CUTOFF_MAX_HZ,
  FILTER_CUTOFF_MIN_HZ,
  OCTAVE_MULTIPLIERS,
  PENTATONIC_RATIOS,
  VELOCITY_GAIN_MAX,
  VELOCITY_GAIN_MIN,
} from './constants';

// computeVoiceLifetimeMs is a pure function (no Tone.js), so these assert the
// A6 fix directly: lifetime is DERIVED from the envelope, never hand-picked.
describe('computeVoiceLifetimeMs', () => {
  it('sums attack + decay + trigger duration + release, plus a 100ms margin', () => {
    const env = { attack: 0.01, decay: 1.0, release: 1.5 };
    expect(computeVoiceLifetimeMs(env, 2)).toBe((0.01 + 1.0 + 2 + 1.5) * 1000 + 100);
  });

  it('is always longer than the held note plus its release tail', () => {
    const env = { attack: 0.05, decay: 0.3, release: 0.5 };
    const durationSec = 0.8;
    expect(computeVoiceLifetimeMs(env, durationSec)).toBeGreaterThan(
      (durationSec + env.release) * 1000
    );
  });

  it('grows when the release lengthens', () => {
    const shortRelease = computeVoiceLifetimeMs({ attack: 0.01, decay: 0.5, release: 0.5 }, 1);
    const longRelease = computeVoiceLifetimeMs({ attack: 0.01, decay: 0.5, release: 2 }, 1);
    expect(longRelease).toBeGreaterThan(shortRelease);
  });

  it('reduces to just the safety margin for a zero-length voice', () => {
    expect(computeVoiceLifetimeMs({ attack: 0, decay: 0, release: 0 }, 0)).toBe(100);
  });
});

const dB = (linear: number) => 20 * Math.log10(linear);

// A3 — loudness must be dominated by velocity, not by a random octave draw.
// The draw used to span FOUR octaves (x0.5..x4); against fixed-Hz filter
// cutoffs that put up to ~45dB of hit-to-hit swing on top of velocity's 12dB.
describe('randomScaleFreq (A3 — octave spread)', () => {
  function allDraws(base: number): number[] {
    const out: number[] = [];
    for (const ratio of PENTATONIC_RATIOS) for (const oct of OCTAVE_MULTIPLIERS) out.push(base * ratio * oct);
    return out;
  }

  it('spans exactly two octaves', () => {
    const octaves = [...OCTAVE_MULTIPLIERS].sort((a, b) => a - b);
    expect(Math.log2(octaves[octaves.length - 1] / octaves[0])).toBeCloseTo(1);
  });

  it('keeps the whole pitch spread under the velocity range it must not swamp', () => {
    const draws = allDraws(SCALE_ROOT_HZ);
    const spreadOctaves = Math.log2(Math.max(...draws) / Math.min(...draws));
    // Was log2(13.3) ~ 3.7 octaves; now pentatonic (1.667) x one octave.
    expect(spreadOctaves).toBeLessThan(2);
    expect(dB(VELOCITY_GAIN_MAX / VELOCITY_GAIN_MIN)).toBeCloseTo(12.04, 1);
  });

  it('preserves the average register: the geometric mean of the draw is unchanged', () => {
    // Old multipliers were 2^{-1,0,1,2}; both sets have a geometric mean of 2^0.5.
    const gmean = (xs: readonly number[]) =>
      Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
    expect(gmean(OCTAVE_MULTIPLIERS)).toBeCloseTo(gmean([0.5, 1, 2, 4]), 6);
  });

  it('only ever returns base x (pentatonic degree) x (octave multiplier)', () => {
    const allowed = new Set(allDraws(100).map((f) => f.toFixed(6)));
    for (let i = 0; i < 400; i++) {
      expect(allowed.has(randomScaleFreq(100).toFixed(6))).toBe(true);
    }
  });

  it('picks the lowest degree of the lowest octave when Math.random() is 0', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(randomScaleFreq(100)).toBeCloseTo(100 * PENTATONIC_RATIOS[0] * OCTAVE_MULTIPLIERS[0]);
    } finally {
      spy.mockRestore();
    }
  });
});

// A7 — every instrument must draw from ONE pentatonic set so it agrees with the
// C-G-C drone pad. Bell (A5), funnel (A4) and seesaw (G4) used to sit on other
// roots; keyRatio is a uniform transposition and could never fix that.
describe('INSTRUMENT_BASE_HZ (A7 — one shared key)', () => {
  const names = Object.keys(INSTRUMENT_BASE_HZ) as Array<keyof typeof INSTRUMENT_BASE_HZ>;

  it('covers all eight instruments', () => {
    expect(names).toHaveLength(8);
  });

  it.each(names)('roots %s on a C (a power of two from the shared scale root)', (name) => {
    const octaves = Math.log2(INSTRUMENT_BASE_HZ[name] / SCALE_ROOT_HZ);
    // Within 5 cents of an exact octave of C4.
    expect(Math.abs(octaves - Math.round(octaves)) * 1200).toBeLessThan(5);
  });

  it('keeps each instrument in its own register (bell highest, bumper lowest)', () => {
    expect(INSTRUMENT_BASE_HZ.bell).toBeGreaterThan(INSTRUMENT_BASE_HZ.chime);
    expect(INSTRUMENT_BASE_HZ.chime).toBeGreaterThan(INSTRUMENT_BASE_HZ.spinner);
    expect(INSTRUMENT_BASE_HZ.spinner).toBeGreaterThan(INSTRUMENT_BASE_HZ.ramp);
    expect(INSTRUMENT_BASE_HZ.ramp).toBeGreaterThan(INSTRUMENT_BASE_HZ.bumper);
    // The three re-rooted voices moved by a minor third or less.
    const semitones = (from: number, to: number) => Math.abs(12 * Math.log2(to / from));
    expect(semitones(880, INSTRUMENT_BASE_HZ.bell)).toBeLessThanOrEqual(3.01);
    expect(semitones(440, INSTRUMENT_BASE_HZ.funnel)).toBeLessThanOrEqual(3.01);
    expect(semitones(392, INSTRUMENT_BASE_HZ.seesaw)).toBeLessThanOrEqual(5.01);
  });

  it('gives the whole board a single pentatonic pitch class set', () => {
    // Every reachable pitch, folded into one octave, must land on one of the
    // five pentatonic degrees — regardless of which instrument produced it.
    // (Before A7 the A-rooted bell/funnel added C#, F# and B to the set.)
    const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
    const hit = new Set<number>();
    for (const name of names) {
      for (const ratio of PENTATONIC_RATIOS) {
        for (const oct of OCTAVE_MULTIPLIERS) {
          let folded = (INSTRUMENT_BASE_HZ[name] * ratio * oct) / SCALE_ROOT_HZ;
          folded /= Math.pow(2, Math.floor(Math.log2(folded)));
          const degree = PENTATONIC_RATIOS.find(
            (d) => cents(folded, d) < 5 || cents(folded, d * 2) < 5
          );
          expect(degree, `${name} x${ratio} x${oct} folded to ${folded}`).toBeDefined();
          if (degree !== undefined) hit.add(degree);
        }
      }
    }
    expect([...hit].sort((a, b) => a - b)).toEqual([...PENTATONIC_RATIOS]);
  });
});

// A5 — velocity -> brightness must move in the documented direction ("harder
// hits are louder AND brighter"). The multiplier that OPENS a lowpass CLOSES a
// highpass, which is exactly why hard seesaw/chime hits used to sound thinner.
describe('brightness cutoff multipliers (A5)', () => {
  it('opens a lowpass as velocity rises', () => {
    expect(brightnessCutoffMul(0)).toBeCloseTo(BRIGHTNESS_CUTOFF_MUL_MIN);
    expect(brightnessCutoffMul(1)).toBeCloseTo(BRIGHTNESS_CUTOFF_MUL_MAX);
    expect(brightnessCutoffMul(1)).toBeGreaterThan(brightnessCutoffMul(0));
  });

  it('opens a highpass as velocity rises (by LOWERING its corner)', () => {
    expect(brightnessHighpassCutoffMul(0)).toBeCloseTo(BRIGHTNESS_CUTOFF_MUL_MAX);
    expect(brightnessHighpassCutoffMul(1)).toBeCloseTo(BRIGHTNESS_CUTOFF_MUL_MIN);
    expect(brightnessHighpassCutoffMul(1)).toBeLessThan(brightnessHighpassCutoffMul(0));
  });

  it('spans the same range in both directions and meets in the middle', () => {
    expect(brightnessCutoffMul(0.5)).toBeCloseTo(brightnessHighpassCutoffMul(0.5));
  });
});

// A3 — cutoffs are relative to the voice's own fundamental, so the octave draw
// changes the NOTE and velocity changes the LOUDNESS.
describe('cutoffHz (A3 — fundamental-relative filters)', () => {
  it('tracks the fundamental so every octave draw is filtered identically', () => {
    for (const oct of OCTAVE_MULTIPLIERS) {
      expect(cutoffHz(200 * oct, 6, 1) / (200 * oct)).toBeCloseTo(6);
    }
  });

  it('scales with the brightness multiplier', () => {
    expect(cutoffHz(200, 6, 1.6) / cutoffHz(200, 6, 0.6)).toBeCloseTo(1.6 / 0.6);
  });

  it('clamps into the audible range instead of running past Nyquist', () => {
    expect(cutoffHz(20000, 12, 1.6)).toBe(FILTER_CUTOFF_MAX_HZ);
    expect(cutoffHz(1, 0.001, 0.6)).toBe(FILTER_CUTOFF_MIN_HZ);
  });
});
