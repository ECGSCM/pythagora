import * as Tone from 'tone';
import { CollisionEvent } from '../types/events';
import { AudioBus } from './bus';
import { VoiceManager } from './voices';
import { createVoice, type InstrumentName } from './instruments';
import { HarmonyEngine } from './harmony';
import {
  VELOCITY_GAIN_MAX,
  VELOCITY_GAIN_MIN,
  VELOCITY_OFFSET,
  VELOCITY_RANGE,
  type EchoMode,
} from './constants';

// nodeId substring -> instrument. Mirrors the old triggerCollision dispatch
// (audio.ts:992-1009); anything unrecognised falls back to the impact sound.
function mapInstrument(nodeId: string): InstrumentName {
  if (nodeId.includes('bumper')) return 'bumper';
  if (nodeId.includes('chime')) return 'chime';
  if (nodeId.includes('bell')) return 'bell';
  if (nodeId.includes('spinner')) return 'spinner';
  if (nodeId.includes('ramp')) return 'ramp';
  if (nodeId.includes('funnel')) return 'funnel';
  if (nodeId.includes('seesaw')) return 'seesaw';
  return 'impact';
}

// Collision impact velocity -> voice gain (0..1), clamped so even soft hits are
// audible and hard hits don't overdrive.
function mapVelocity(velocity: number): number {
  const gain = (velocity - VELOCITY_OFFSET) / VELOCITY_RANGE;
  return Math.max(VELOCITY_GAIN_MIN, Math.min(VELOCITY_GAIN_MAX, gain));
}

/**
 * The only public audio surface the app touches. Owns the bus, the voice
 * manager and the (Phase-5) harmony engine, and manages the Tone.js lifecycle.
 * Replaces the old engine + synth-bridge pair; the bridge layer is gone
 * (A5 — physics events call this directly).
 */
export class AudioEngine {
  private readonly bus: AudioBus;
  private readonly voices: VoiceManager;
  /** Circle-of-fifths engine; not yet wired into playback (Phase 5). */
  readonly harmony: HarmonyEngine;

  private resumePromise: Promise<void> | null = null;
  private resumeErrorLogged = false;

  constructor() {
    this.bus = new AudioBus();
    this.voices = new VoiceManager(this.bus, createVoice);
    this.harmony = new HarmonyEngine();
  }

  /**
   * Start (or await an in-flight start of) the audio context. Safe to call
   * repeatedly and never rejects — failures are swallowed and logged once, so
   * there is no unhandled promise (A11).
   */
  async resume(): Promise<void> {
    if (Tone.getContext().state === 'running') return;
    if (!this.resumePromise) {
      this.resumePromise = Tone.start()
        .then(() => {
          this.resumePromise = null;
        })
        .catch((error: unknown) => {
          this.resumePromise = null;
          if (!this.resumeErrorLogged) {
            this.resumeErrorLogged = true;
            console.warn('AudioEngine: audio context could not start yet', error);
          }
        });
    }
    return this.resumePromise;
  }

  triggerCollision(event: CollisionEvent): void {
    // Pre-gesture the context may still be suspended; kick a resume without
    // blocking the hit. resume() already swallows its own rejection.
    if (Tone.getContext().state !== 'running') {
      void this.resume();
    }

    const instrument = mapInstrument(event.nodeId);
    const velocityGain = mapVelocity(event.velocity);
    this.voices.play(instrument, velocityGain);
    this.bus.onCollision(event.velocity);

    // ── Phase 5 integration point ────────────────────────────────────────
    // The harmonic resonance chain is ready but intentionally not wired into
    // playback yet (REFACTORING_PLAN.md Phase 5 / §0.6). When enabled, the
    // chord from `this.harmony.advanceHarmony(event.nodeId)` will select the
    // pitches played above. Referenced here so the instance stays live.
    void this.harmony;
  }

  // ==================== PASSTHROUGHS ====================

  setMuted(muted: boolean): void {
    this.bus.setMuted(muted);
  }

  setMasterVolume(db: number): void {
    this.bus.setMasterVolume(db);
  }

  getMasterVolume(): number {
    return this.bus.getMasterVolume();
  }

  setEchoMode(mode: EchoMode): void {
    this.bus.setEchoMode(mode);
  }

  cycleEchoMode(): EchoMode {
    return this.bus.cycleEchoMode();
  }

  getEchoMode(): EchoMode {
    return this.bus.getEchoMode();
  }

  dispose(): void {
    this.voices.dispose();
    this.bus.dispose();
  }
}
