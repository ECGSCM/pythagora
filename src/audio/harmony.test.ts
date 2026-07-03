import { describe, it, expect, vi } from 'vitest';
import {
  HarmonyEngine,
  CIRCLE_OF_FIFTHS,
  MAX_HARMONY_HISTORY,
  CHORD_ROOT_GAIN,
  KEY_NAMES,
  REFERENCE_ROOT_HZ,
  keyRatioForRoot,
  shouldStepKey,
} from './harmony';
import { makePitchContext } from './instruments';
import { HARMONY_STEP_INTERVAL } from './constants';

describe('HarmonyEngine', () => {
  it('progresses through the Circle of Fifths in order', () => {
    const engine = new HarmonyEngine();
    const roots = CIRCLE_OF_FIFTHS.map(() => engine.getNextHarmony().root);
    expect(roots).toEqual([...CIRCLE_OF_FIFTHS]);
  });

  it('wraps back to the start after a full progression', () => {
    const engine = new HarmonyEngine();
    for (let i = 0; i < CIRCLE_OF_FIFTHS.length; i++) engine.getNextHarmony();
    expect(engine.getNextHarmony().root).toBe(CIRCLE_OF_FIFTHS[0]);
  });

  it('builds a major triad with linear voice gains in 0..1 (A8)', () => {
    const engine = new HarmonyEngine();
    const chord = engine.calculateHarmony(100);
    expect(chord.third).toBeCloseTo(125); // major third (5/4)
    expect(chord.fifth).toBeCloseTo(150); // perfect fifth (3/2)
    expect(chord.voices).toHaveLength(3);
    for (const voice of chord.voices) {
      expect(voice.gain).toBeGreaterThan(0);
      expect(voice.gain).toBeLessThanOrEqual(1);
    }
    expect(chord.voices[0].gain).toBe(CHORD_ROOT_GAIN);
  });

  it('bounds collision history at MAX_HARMONY_HISTORY', () => {
    const engine = new HarmonyEngine();
    for (let i = 0; i < MAX_HARMONY_HISTORY + 5; i++) {
      engine.advanceHarmony(`node-${i}`, i);
    }
    expect(engine.getCollisionHistory()).toHaveLength(MAX_HARMONY_HISTORY);
  });

  it('reset() restarts the progression and clears history', () => {
    const engine = new HarmonyEngine();
    engine.advanceHarmony('a');
    engine.advanceHarmony('b');
    engine.reset();
    expect(engine.getCollisionHistory()).toEqual([]);
    expect(engine.getNextHarmony().root).toBe(CIRCLE_OF_FIFTHS[0]);
  });

  it('exposes a key name for every circle-of-fifths entry', () => {
    expect(KEY_NAMES).toHaveLength(CIRCLE_OF_FIFTHS.length);
  });

  it('reports the current key index without advancing', () => {
    const engine = new HarmonyEngine();
    expect(engine.getKeyIndex()).toBe(0);
    engine.getNextHarmony();
    expect(engine.getKeyIndex()).toBe(1);
  });
});

// §2.2 — the engine steps the key every HARMONY_STEP_INTERVAL collisions. The
// counting rule is pure and tested here without any Tone.js.
describe('shouldStepKey', () => {
  it('is false before the first interval and true exactly on each boundary', () => {
    const results: boolean[] = [];
    for (let count = 0; count <= 2 * HARMONY_STEP_INTERVAL; count++) {
      results.push(shouldStepKey(count, HARMONY_STEP_INTERVAL));
    }
    // Only counts 8 and 16 (with interval 8) step; count 0 never steps.
    const stepAt = results.flatMap((v, i) => (v ? [i] : []));
    expect(stepAt).toEqual([HARMONY_STEP_INTERVAL, 2 * HARMONY_STEP_INTERVAL]);
  });

  it('never steps on collision count 0', () => {
    expect(shouldStepKey(0, HARMONY_STEP_INTERVAL)).toBe(false);
  });
});

// §2.2 — pitch transposition math: keyRatio scales pentatonic choices linearly.
describe('key transposition', () => {
  it('keyRatioForRoot is 1 at the reference root and proportional elsewhere', () => {
    expect(keyRatioForRoot(REFERENCE_ROOT_HZ)).toBeCloseTo(1);
    expect(keyRatioForRoot(REFERENCE_ROOT_HZ * 2)).toBeCloseTo(2);
    expect(keyRatioForRoot(392)).toBeCloseTo(392 / REFERENCE_ROOT_HZ);
  });

  it('makePitchContext scales the same random pitch by exactly keyRatio', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const inKeyOfC = makePitchContext(1);
      const inKeyOfG = makePitchContext(1.5);
      const base = 261.63;
      // Same seeded random => same underlying pentatonic pick; only keyRatio differs.
      expect(inKeyOfG.scaleFreq(base) / inKeyOfC.scaleFreq(base)).toBeCloseTo(1.5);
      expect(inKeyOfC.keyRatio).toBe(1);
      expect(inKeyOfG.keyRatio).toBe(1.5);
    } finally {
      spy.mockRestore();
    }
  });
});
