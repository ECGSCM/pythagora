import { describe, it, expect } from 'vitest';
import {
  HarmonyEngine,
  CIRCLE_OF_FIFTHS,
  MAX_HARMONY_HISTORY,
  CHORD_ROOT_GAIN,
} from './harmony';

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
});
