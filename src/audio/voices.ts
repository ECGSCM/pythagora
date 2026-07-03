import type * as Tone from 'tone';
import type { InstrumentName, PitchContext, Voice } from './instruments';
import {
  GLOBAL_VOICE_CAP,
  PER_INSTRUMENT_VOICE_CAP,
  VOICE_CLEANUP_FADE_SEC,
  VOICE_STEAL_FADE_SEC,
} from './constants';

// The manager only needs these two attach points from the bus. Typed against
// Tone.Gain, but the interface keeps it injectable so tests can pass fakes.
export interface VoiceBus {
  readonly input: Tone.Gain;
  readonly reverbSend: Tone.Gain;
}

export type VoiceFactory = (name: InstrumentName, pitch: PitchContext) => Voice;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Real polyphony with voice stealing (fixes A9/A10). Voices are tracked as
 * unique instances (not by type name), so per-instrument and global caps
 * actually bind. When a cap is hit the oldest voice is stolen with a short
 * fade; every voice is cleaned up at its derived lifetime with a fade-out, so
 * nothing clicks. All timers are tracked and cleared on dispose().
 */
export class VoiceManager {
  private readonly active = new Map<InstrumentName, Voice[]>(); // per instrument, oldest-first
  private readonly order: Voice[] = []; // global, oldest-first
  private readonly nameOf = new Map<Voice, InstrumentName>();
  private readonly lifetimeTimers = new Map<Voice, Timer>();
  private readonly disposeTimers = new Set<Timer>();
  private readonly liveVoices = new Set<Voice>();
  private readonly bus: VoiceBus;
  private readonly factory: VoiceFactory;

  constructor(bus: VoiceBus, factory: VoiceFactory) {
    this.bus = bus;
    this.factory = factory;
  }

  play(name: InstrumentName, velocityGain: number, brightness: number, pitch: PitchContext): Voice {
    const voice = this.factory(name, pitch);

    // Enforce caps by stealing the oldest voice before adding the new one.
    const perInstrument = this.active.get(name);
    if (perInstrument && perInstrument.length >= PER_INSTRUMENT_VOICE_CAP) {
      this.steal(perInstrument[0]);
    }
    if (this.order.length >= GLOBAL_VOICE_CAP) {
      this.steal(this.order[0]);
    }

    voice.output.connect(this.bus.input);
    voice.output.connect(this.bus.reverbSend);
    voice.trigger(velocityGain, brightness);

    this.liveVoices.add(voice);
    this.nameOf.set(voice, name);
    const list = this.active.get(name) ?? [];
    list.push(voice);
    this.active.set(name, list);
    this.order.push(voice);

    const timer = setTimeout(() => {
      this.lifetimeTimers.delete(voice);
      this.removeFromAccounting(voice);
      this.fadeAndDispose(voice, VOICE_CLEANUP_FADE_SEC);
    }, voice.lifetimeMs);
    this.lifetimeTimers.set(voice, timer);

    return voice;
  }

  /** Number of active voices, optionally filtered to one instrument. */
  activeCount(name?: InstrumentName): number {
    if (name) return this.active.get(name)?.length ?? 0;
    return this.order.length;
  }

  private steal(voice: Voice): void {
    const timer = this.lifetimeTimers.get(voice);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.lifetimeTimers.delete(voice);
    }
    this.removeFromAccounting(voice);
    this.fadeAndDispose(voice, VOICE_STEAL_FADE_SEC);
  }

  private removeFromAccounting(voice: Voice): void {
    const name = this.nameOf.get(voice);
    if (name !== undefined) {
      const list = this.active.get(name);
      if (list) {
        const idx = list.indexOf(voice);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.active.delete(name);
      }
    }
    const orderIdx = this.order.indexOf(voice);
    if (orderIdx >= 0) this.order.splice(orderIdx, 1);
  }

  private fadeAndDispose(voice: Voice, fadeSec: number): void {
    try {
      voice.output.gain.rampTo(0, fadeSec);
    } catch {
      // Output may already be disposed; disposal below is still safe.
    }
    const timer = setTimeout(() => {
      this.disposeTimers.delete(timer);
      this.finalizeDispose(voice);
    }, Math.ceil(fadeSec * 1000));
    this.disposeTimers.add(timer);
  }

  private finalizeDispose(voice: Voice): void {
    if (!this.liveVoices.has(voice)) return;
    this.liveVoices.delete(voice);
    this.nameOf.delete(voice);
    try {
      voice.dispose();
    } catch {
      // Non-fatal.
    }
  }

  dispose(): void {
    for (const timer of this.lifetimeTimers.values()) clearTimeout(timer);
    this.lifetimeTimers.clear();
    for (const timer of this.disposeTimers) clearTimeout(timer);
    this.disposeTimers.clear();

    for (const voice of [...this.liveVoices]) {
      this.liveVoices.delete(voice);
      try {
        voice.dispose();
      } catch {
        // Non-fatal.
      }
    }
    this.nameOf.clear();
    this.active.clear();
    this.order.length = 0;
  }
}
