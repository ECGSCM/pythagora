import { describe, it, expect } from 'vitest';
import { admitAudioEvent } from './engine';
import { AUDIO_EVENT_WINDOW_MS, AUDIO_EVENTS_PER_100MS } from './constants';

// A6 — the audio budget used to be a CLIFF. Dropped events were pushed into the
// sliding window before the threshold check, so at any sustained rate above the
// budget the window steady-stated above the threshold and every subsequent
// collision was dropped: 0 voices instead of the intended 8. admitAudioEvent is
// pure (it only mutates the window array it is handed), so the limiter's
// behaviour is verifiable here without any Tone.js.
describe('admitAudioEvent', () => {
  const WINDOW = 100;
  const BUDGET = 8;

  it('admits exactly `budget` events inside one window', () => {
    const times: number[] = [];
    const admitted = Array.from({ length: BUDGET + 5 }, (_, i) =>
      admitAudioEvent(times, 1000 + i, WINDOW, BUDGET)
    );
    expect(admitted.filter(Boolean)).toHaveLength(BUDGET);
    expect(admitted.slice(0, BUDGET).every(Boolean)).toBe(true);
    expect(admitted.slice(BUDGET).some(Boolean)).toBe(false);
  });

  it('only records events that were actually admitted', () => {
    const times: number[] = [];
    for (let i = 0; i < BUDGET * 10; i++) admitAudioEvent(times, 1000 + i, WINDOW, BUDGET);
    // Dropped events must not enter the window, or it can never drain.
    expect(times).toHaveLength(BUDGET);
  });

  it('keeps thinning to the budget under sustained overload instead of going silent', () => {
    const times: number[] = [];
    // 5 collisions per millisecond for a full second — far above any budget.
    let admitted = 0;
    for (let ms = 0; ms < 1000; ms++) {
      for (let k = 0; k < 5; k++) if (admitAudioEvent(times, 1000 + ms, WINDOW, BUDGET)) admitted++;
    }
    // ~1 window's worth of voices per window (10 windows in a second), NOT zero.
    // The old push-then-check version admitted only the first `budget` events
    // and then nothing at all for the rest of the run.
    expect(admitted).toBeGreaterThanOrEqual(BUDGET * 9);
    expect(admitted).toBeLessThanOrEqual(BUDGET * 11);
  });

  it('re-admits immediately once the window has drained', () => {
    const times: number[] = [];
    for (let i = 0; i < BUDGET; i++) admitAudioEvent(times, 1000, WINDOW, BUDGET);
    expect(admitAudioEvent(times, 1000, WINDOW, BUDGET)).toBe(false);
    // One full window later the old timestamps are evicted.
    expect(admitAudioEvent(times, 1000 + WINDOW, WINDOW, BUDGET)).toBe(true);
  });

  it('never lets the window grow beyond the budget', () => {
    const times: number[] = [];
    for (let i = 0; i < 5000; i++) admitAudioEvent(times, 1000 + i * 0.1, WINDOW, BUDGET);
    expect(times.length).toBeLessThanOrEqual(BUDGET);
  });

  it('uses a budget the shipped constants can actually reach', () => {
    const times: number[] = [];
    let admitted = 0;
    for (let i = 0; i < 100; i++) {
      if (admitAudioEvent(times, 5000, AUDIO_EVENT_WINDOW_MS, AUDIO_EVENTS_PER_100MS)) admitted++;
    }
    expect(admitted).toBe(AUDIO_EVENTS_PER_100MS);
  });
});
