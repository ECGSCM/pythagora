import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Tone from 'tone';
import { VoiceManager, type VoiceBus, type VoiceFactory } from './voices';
import type { PitchContext, Voice } from './instruments';
import { PER_INSTRUMENT_VOICE_CAP } from './constants';

// Stub pitch context — the manager just threads it to the voice's trigger().
const PITCH: PitchContext = { scaleFreq: (b) => b, keyRatio: 1 };

// These specs use injected fake voices + fake timers, so no real Tone.js is
// loaded — the pool accounting (reuse / grow-to-cap / oldest-steal / dispose)
// is exercised purely. Fake timers also mock Date.now(), which is how the pool
// decides a voice is idle (busyUntil <= now).

function makeFakeBus(): VoiceBus {
  const target = { connect: () => undefined };
  return {
    input: target as unknown as Tone.Gain,
    reverbSend: target as unknown as Tone.Gain,
  };
}

interface FakeVoice extends Voice {
  disposed: boolean;
  triggers: number;
}

function makeFactory(lifetimeMs = 1000): { factory: VoiceFactory; created: FakeVoice[] } {
  const created: FakeVoice[] = [];
  const factory: VoiceFactory = () => {
    const voice: FakeVoice = {
      disposed: false,
      triggers: 0,
      lifetimeMs,
      output: {
        connect: () => undefined,
        gain: { rampTo: () => undefined },
      } as unknown as Tone.Gain,
      trigger() {
        voice.triggers += 1;
      },
      dispose() {
        voice.disposed = true;
      },
    };
    created.push(voice);
    return voice;
  };
  return { factory, created };
}

describe('VoiceManager (pool)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('triggers a voice and reports it as active until its lifetime elapses', () => {
    const { factory, created } = makeFactory(500);
    const vm = new VoiceManager(makeFakeBus(), factory);

    vm.play('bumper', 1, 1, PITCH);
    expect(created.length).toBe(1);
    expect(created[0].triggers).toBe(1);
    expect(vm.activeCount('bumper')).toBe(1);

    vi.advanceTimersByTime(600); // tail finished -> idle, but still pooled
    expect(vm.activeCount('bumper')).toBe(0);
    expect(vm.poolSize('bumper')).toBe(1);
  });

  it('reuses an idle voice instead of allocating a new one', () => {
    const { factory, created } = makeFactory(500);
    const vm = new VoiceManager(makeFakeBus(), factory);

    vm.play('bumper', 1, 1, PITCH);
    vi.advanceTimersByTime(600); // first voice is now idle

    vm.play('bumper', 1, 1, PITCH);
    expect(created.length).toBe(1); // reused, not re-created
    expect(created[0].triggers).toBe(2); // retriggered
  });

  it('grows the pool to the cap, then steals the OLDEST busy voice', () => {
    const { factory, created } = makeFactory(10_000); // long-lived => all stay busy
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < PER_INSTRUMENT_VOICE_CAP; i++) {
      vm.play('chime', 1, 1, PITCH);
      vi.advanceTimersByTime(1); // distinct lastTriggered timestamps
    }
    expect(created.length).toBe(PER_INSTRUMENT_VOICE_CAP);
    expect(vm.poolSize('chime')).toBe(PER_INSTRUMENT_VOICE_CAP);

    // All busy at the cap: the next hit steals the oldest by retriggering it.
    vm.play('chime', 1, 1, PITCH);
    expect(created.length).toBe(PER_INSTRUMENT_VOICE_CAP); // no new allocation
    expect(created[0].triggers).toBe(2); // oldest retriggered (the steal)
    expect(created[1].triggers).toBe(1); // second-oldest untouched
  });

  it('never allocates more than the per-instrument cap', () => {
    const { factory, created } = makeFactory(10_000);
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < PER_INSTRUMENT_VOICE_CAP * 3; i++) {
      vm.play('bell', 1, 1, PITCH);
      vi.advanceTimersByTime(1);
    }
    expect(created.length).toBe(PER_INSTRUMENT_VOICE_CAP);
    expect(vm.poolSize('bell')).toBe(PER_INSTRUMENT_VOICE_CAP);
  });

  it('pools each instrument independently', () => {
    const { factory } = makeFactory(10_000);
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < PER_INSTRUMENT_VOICE_CAP; i++) vm.play('bumper', 1, 1, PITCH);
    vm.play('chime', 1, 1, PITCH);

    expect(vm.poolSize('bumper')).toBe(PER_INSTRUMENT_VOICE_CAP);
    expect(vm.poolSize('chime')).toBe(1);
  });

  it('dispose() disposes every pooled voice and clears all pools', () => {
    const { factory, created } = makeFactory(10_000);
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < 3; i++) vm.play('impact', 1, 1, PITCH);
    expect(created.length).toBe(3);

    vm.dispose();
    expect(created.every((v) => v.disposed)).toBe(true);
    expect(vm.poolSize()).toBe(0);
    expect(vm.activeCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
