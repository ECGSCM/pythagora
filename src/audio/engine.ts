import * as Tone from 'tone';
import { CollisionEvent } from '../types/events';
import { AudioBus } from './bus';
import { VoiceManager } from './voices';
import { AmbientDrone } from './drone';
import { createVoice, makePitchContext, type InstrumentName } from './instruments';
import { HarmonyEngine, KEY_NAMES, keyRatioForRoot, shouldStepKey } from './harmony';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  HARMONY_STEP_INTERVAL,
  MASTER_VOLUME_MAX_DB,
  MASTER_VOLUME_MIN_DB,
  VELOCITY_GAIN_MAX,
  VELOCITY_GAIN_MIN,
  VELOCITY_OFFSET,
  VELOCITY_RANGE,
  type EchoMode,
} from './constants';

/** Fired when the harmony key changes; Phase 5B drives the Aurora pulse. */
export type ModulationListener = (keyIndex: number, keyName: string) => void;

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

// Collision impact velocity -> filter brightness (0..1), same offset/range as
// the gain map but clamped to the full 0..1 (§2.3).
function mapBrightness(velocity: number): number {
  const b = (velocity - VELOCITY_OFFSET) / VELOCITY_RANGE;
  return Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, b));
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
  private readonly drone: AmbientDrone;
  /** Circle-of-fifths engine driving key transposition (§2.2). */
  readonly harmony: HarmonyEngine;

  private resumePromise: Promise<void> | null = null;
  private resumeErrorLogged = false;

  // Harmony advances one step every HARMONY_STEP_INTERVAL collisions (§2.2).
  private collisionCount = 0;
  private modulationListener: ModulationListener | null = null;

  constructor() {
    this.bus = new AudioBus();
    this.voices = new VoiceManager(this.bus, createVoice);
    this.drone = new AmbientDrone(this.bus);
    this.harmony = new HarmonyEngine();
  }

  /** Register the (optional) key-change callback used by the visual layer. */
  setModulationListener(cb: ModulationListener): void {
    this.modulationListener = cb;
  }

  /**
   * Start (or await an in-flight start of) the audio context. Safe to call
   * repeatedly and never rejects — failures are swallowed and logged once, so
   * there is no unhandled promise (A11).
   */
  async resume(): Promise<void> {
    if (Tone.getContext().state === 'running') {
      this.startDroneIfRunning();
      return;
    }
    if (!this.resumePromise) {
      this.resumePromise = Tone.start()
        .then(() => {
          this.resumePromise = null;
          // The drone must only start once the context is actually running.
          this.startDroneIfRunning();
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

  /** Start the drone iff the context is running; start() self-guards re-entry. */
  private startDroneIfRunning(): void {
    if (Tone.getContext().state === 'running') {
      this.drone.start();
    }
  }

  triggerCollision(event: CollisionEvent): void {
    // Pre-gesture the context may still be suspended; kick a resume without
    // blocking the hit. resume() already swallows its own rejection.
    if (Tone.getContext().state !== 'running') {
      void this.resume();
    }

    const instrument = mapInstrument(event.nodeId);
    const velocityGain = mapVelocity(event.velocity);
    const brightness = mapBrightness(event.velocity);

    // Harmonic resonance chain (§2.2): every Nth collision steps the circle of
    // fifths, retunes the pad and notifies the visual layer.
    this.collisionCount += 1;
    if (shouldStepKey(this.collisionCount, HARMONY_STEP_INTERVAL)) {
      this.harmony.getNextHarmony(); // advance the key
      const index = this.harmony.getKeyIndex();
      const root = this.harmony.getCurrentHarmony().root;
      this.drone.setKey(keyRatioForRoot(root));
      this.modulationListener?.(index, KEY_NAMES[index]);
    }

    // Pitches are chosen from the CURRENT key (§2.2): same pentatonic character,
    // transposed by the key root ratio.
    const pitch = makePitchContext(keyRatioForRoot(this.harmony.getCurrentHarmony().root));
    this.voices.play(instrument, velocityGain, brightness, pitch);
    this.bus.onCollision(event.velocity);
    this.drone.onCollision(instrument);
  }

  // ==================== PASSTHROUGHS ====================

  /** Shimmer drone layer (§2.1); driven by combo ≥ 10 from the shell. */
  setShimmer(active: boolean): void {
    this.drone.setShimmer(active);
  }

  /** Binaural drift (§2.5); driven by the 'B' toggle from the shell. */
  setBinaural(active: boolean): void {
    this.drone.setBinaural(active);
  }

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

  /** Human-readable name of the current harmony key (§2.2), e.g. "G". */
  getCurrentKeyName(): string {
    return KEY_NAMES[this.harmony.getKeyIndex()];
  }

  /**
   * Sound-reactive UI (§4.4): current output level normalized to 0..1,
   * linearly mapping [MASTER_VOLUME_MIN_DB..MASTER_VOLUME_MAX_DB] (-60..0dB)
   * onto [0..1]. True silence (-Infinity dB) maps to 0.
   */
  getOutputLevel(): number {
    const db = this.bus.getLevel();
    if (!Number.isFinite(db)) return 0;
    const range = MASTER_VOLUME_MAX_DB - MASTER_VOLUME_MIN_DB;
    const normalized = (db - MASTER_VOLUME_MIN_DB) / range;
    return Math.max(0, Math.min(1, normalized));
  }

  dispose(): void {
    this.drone.dispose();
    this.voices.dispose();
    this.bus.dispose();
  }
}
