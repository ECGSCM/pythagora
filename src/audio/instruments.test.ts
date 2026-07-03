import { describe, it, expect } from 'vitest';
import { computeVoiceLifetimeMs } from './instruments';

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
