import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Tone from 'tone';
import { VoiceManager, type VoiceBus, type VoiceFactory } from './voices';
import type { PitchContext, Voice } from './instruments';
import { GLOBAL_VOICE_CAP, PER_INSTRUMENT_VOICE_CAP } from './constants';

// Stub pitch context — the manager just threads it to the factory.
const PITCH: PitchContext = { scaleFreq: (b) => b, keyRatio: 1 };

// These specs use injected fake voices + fake timers, so no real Tone.js is
// loaded — the accounting/stealing/cleanup logic (A9/A10) is exercised purely.

function makeFakeBus(): VoiceBus {
  const target = { connect: () => undefined };
  return {
    input: target as unknown as Tone.Gain,
    reverbSend: target as unknown as Tone.Gain,
  };
}

interface FakeVoice extends Voice {
  disposed: boolean;
}

function makeFactory(lifetimeMs = 1000): { factory: VoiceFactory; created: FakeVoice[] } {
  const created: FakeVoice[] = [];
  const factory: VoiceFactory = () => {
    const voice: FakeVoice = {
      disposed: false,
      lifetimeMs,
      output: {
        connect: () => undefined,
        gain: { rampTo: () => undefined },
      } as unknown as Tone.Gain,
      trigger: () => undefined,
      dispose() {
        voice.disposed = true;
      },
    };
    created.push(voice);
    return voice;
  };
  return { factory, created };
}

describe('VoiceManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enforces the per-instrument cap by stealing older voices', () => {
    const { factory, created } = makeFactory();
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < PER_INSTRUMENT_VOICE_CAP + 2; i++) vm.play('bumper', 1, 1, PITCH);

    expect(vm.activeCount('bumper')).toBe(PER_INSTRUMENT_VOICE_CAP);
    // The two oldest were stolen and dispose after their short fade.
    vi.advanceTimersByTime(50);
    expect(created[0].disposed).toBe(true);
    expect(created[1].disposed).toBe(true);
  });

  it('steals the OLDEST voice of the instrument first', () => {
    const { factory, created } = makeFactory();
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < PER_INSTRUMENT_VOICE_CAP; i++) vm.play('chime', 1, 1, PITCH);
    vm.play('chime', 1, 1, PITCH); // exceeds cap -> steal created[0]

    vi.advanceTimersByTime(50);
    expect(created[0].disposed).toBe(true);
    expect(created[1].disposed).toBe(false);
  });

  it('enforces the global cap across instruments', () => {
    const { factory } = makeFactory();
    const vm = new VoiceManager(makeFakeBus(), factory);
    const names = [
      'bumper',
      'chime',
      'bell',
      'spinner',
      'ramp',
      'funnel',
      'seesaw',
      'impact',
    ] as const;

    // Round-robin so no single instrument reaches its own cap first; only the
    // global cap can bind.
    for (let i = 0; i < GLOBAL_VOICE_CAP + 3; i++) {
      vm.play(names[i % names.length], 1, 1, PITCH);
    }

    expect(vm.activeCount()).toBe(GLOBAL_VOICE_CAP);
  });

  it('cleans up a voice at its lifetime and removes it from accounting', () => {
    const { factory, created } = makeFactory(500);
    const vm = new VoiceManager(makeFakeBus(), factory);

    vm.play('bell', 1, 1, PITCH);
    expect(vm.activeCount('bell')).toBe(1);

    vi.advanceTimersByTime(500); // lifetime fires: accounting drops immediately
    expect(vm.activeCount('bell')).toBe(0);

    vi.advanceTimersByTime(50); // fade-out completes, then dispose
    expect(created[0].disposed).toBe(true);
  });

  it('dispose() disposes every active voice and leaves no dangling timers', () => {
    const { factory, created } = makeFactory();
    const vm = new VoiceManager(makeFakeBus(), factory);

    for (let i = 0; i < 3; i++) vm.play('impact', 1, 1, PITCH);
    vm.dispose();

    expect(created.every((v) => v.disposed)).toBe(true);
    expect(vm.activeCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
