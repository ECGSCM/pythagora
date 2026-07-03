import type * as Tone from 'tone';
import type { InstrumentName, PitchContext, Voice } from './instruments';
import { PER_INSTRUMENT_VOICE_CAP } from './constants';

// The manager only needs these two attach points from the bus. Typed against
// Tone.Gain, but the interface keeps it injectable so tests can pass fakes.
export interface VoiceBus {
  readonly input: Tone.Gain;
  readonly reverbSend: Tone.Gain;
}

export type VoiceFactory = (name: InstrumentName) => Voice;

/** A pooled voice plus the bookkeeping the pool uses to reuse/steal it. */
interface PooledVoice {
  voice: Voice;
  /** Wall-clock ms until which the voice is still audibly sounding. */
  busyUntil: number;
  /** Wall-clock ms of its most recent trigger (oldest-first steal ordering). */
  lastTriggered: number;
}

/**
 * True voice pooling (Phase 7A — fixes the per-collision node-graph churn that
 * caused GC stalls). Each instrument grows a small pool of PERSISTENT,
 * retriggerable voices (up to PER_INSTRUMENT_VOICE_CAP). A voice's graph is
 * built once and its oscillators run forever; the closed envelope keeps it
 * silent, and trigger() re-tunes + re-fires it.
 *
 * play() prefers an idle voice (one whose tail has finished). If none is idle
 * it grows the pool up to the cap; once the cap is reached it retriggers the
 * OLDEST voice — that IS the steal, because retriggering restarts the envelope
 * with no fade or disposal. There is no per-hit allocation and there are no
 * timers; dispose() tears down every pooled voice.
 */
export class VoiceManager {
  private readonly pools = new Map<InstrumentName, PooledVoice[]>();
  private readonly bus: VoiceBus;
  private readonly factory: VoiceFactory;

  constructor(bus: VoiceBus, factory: VoiceFactory) {
    this.bus = bus;
    this.factory = factory;
  }

  play(name: InstrumentName, velocityGain: number, brightness: number, pitch: PitchContext): Voice {
    const now = Date.now();
    let pool = this.pools.get(name);
    if (!pool) {
      pool = [];
      this.pools.set(name, pool);
    }

    // 1) Reuse an idle voice (its tail has finished sounding).
    let slot = pool.find((p) => p.busyUntil <= now);

    // 2) Otherwise grow the pool up to the per-instrument cap.
    if (!slot && pool.length < PER_INSTRUMENT_VOICE_CAP) {
      const voice = this.factory(name);
      voice.output.connect(this.bus.input);
      voice.output.connect(this.bus.reverbSend);
      slot = { voice, busyUntil: 0, lastTriggered: 0 };
      pool.push(slot);
    }

    // 3) Otherwise steal the oldest voice — retrigger restarts its envelope, so
    // no fade/dispose is needed (the whole point of pooling).
    if (!slot) {
      slot = pool.reduce((oldest, p) => (p.lastTriggered < oldest.lastTriggered ? p : oldest));
    }

    slot.voice.trigger(velocityGain, brightness, pitch);
    slot.busyUntil = now + slot.voice.lifetimeMs;
    slot.lastTriggered = now;
    return slot.voice;
  }

  /** Number of currently-sounding (busy) voices, optionally filtered by name. */
  activeCount(name?: InstrumentName): number {
    const now = Date.now();
    const busy = (pool: PooledVoice[]): number => pool.filter((p) => p.busyUntil > now).length;
    if (name) return busy(this.pools.get(name) ?? []);
    let total = 0;
    for (const pool of this.pools.values()) total += busy(pool);
    return total;
  }

  /** Number of allocated (pooled) voices, optionally filtered by name. */
  poolSize(name?: InstrumentName): number {
    if (name) return this.pools.get(name)?.length ?? 0;
    let total = 0;
    for (const pool of this.pools.values()) total += pool.length;
    return total;
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      for (const p of pool) {
        try {
          p.voice.dispose();
        } catch {
          // Non-fatal during teardown.
        }
      }
    }
    this.pools.clear();
  }
}
