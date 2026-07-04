import * as Tone from 'tone';
import { CollisionEvent } from '../types/events';
import { AudioBus } from './bus';
import { VoiceManager } from './voices';
import { AmbientDrone } from './drone';
import { createVoice, makePitchContext, type InstrumentName } from './instruments';
import { HarmonyEngine, KEY_NAMES, keyRatioForRoot, shouldStepKey } from './harmony';
import { MediaSessionPin } from './unlock';
import {
  AUDIO_EVENT_WINDOW_MS,
  AUDIO_EVENTS_PER_100MS,
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

// Collision event -> instrument. Prefers the explicit `moduleType` the physics
// body carries in userData (exact, order-independent) and falls back to the
// legacy nodeId substring scan (audio.ts:992-1009) for events without a type;
// anything unrecognised falls back to the impact sound.
function mapInstrument(event: CollisionEvent): InstrumentName {
  switch (event.moduleType) {
    case 'bumper':
    case 'chime':
    case 'bell':
    case 'spinner':
    case 'ramp':
    case 'funnel':
    case 'seesaw':
      return event.moduleType;
  }

  const nodeId = event.nodeId;
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
  // Once disposed, in-flight resumes and incoming collisions must no-op: the
  // shared global AudioContext can resolve a pending Tone.start() long after
  // dispose(), which would otherwise restart the disposed drone on dead nodes.
  private disposed = false;

  // Harmony advances one step every HARMONY_STEP_INTERVAL collisions (§2.2).
  private collisionCount = 0;
  private modulationListener: ModulationListener | null = null;

  // Audio event budget (Phase 7A): timestamps of recent voice-triggering
  // collisions, kept as a sliding AUDIO_EVENT_WINDOW_MS window. Beyond
  // AUDIO_EVENTS_PER_100MS in a window, excess collisions skip voice/drone work
  // (they still step harmony and feed the reverb send).
  private readonly recentEventTimes: number[] = [];

  private gestureUnlock: (() => void) | null = null;
  private visibilityUnlock: (() => void) | null = null;
  private readonly mediaPin = new MediaSessionPin();

  constructor() {
    this.bus = new AudioBus();
    this.voices = new VoiceManager(this.bus, createVoice);
    this.drone = new AmbientDrone(this.bus);
    this.harmony = new HarmonyEngine();
    this.installGestureUnlock();
  }

  /**
   * Mobile audio unlock (see src/audio/unlock.ts for the full story). Inside
   * every user gesture we (1) resume the context — iOS only allows resume()
   * synchronously within a gesture handler — and (2) pin the iOS audio
   * session to the media-playback category via a looping silent <audio>
   * element, which makes Web Audio immune to the hardware SILENT SWITCH
   * (otherwise a running context is still fully muted in ring-silent mode —
   * the "still no sound on mobile" bug).
   *
   * The listeners stay installed for the engine's whole life: iOS suspends or
   * 'interrupt's the context on backgrounding/calls, so any later gesture must
   * be able to re-unlock. The handler is a cheap state check when everything
   * is already running. A visibilitychange hook re-resumes on tab return.
   */
  private installGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      // Media-category pin first — play() must start inside the gesture.
      this.mediaPin.ensure();
      this.mediaPin.refresh();
      // Tone.start() calls context.resume() synchronously within this handler,
      // which satisfies the mobile gesture requirement.
      if (Tone.getContext().state !== 'running') {
        void this.resume();
      }
    };
    this.gestureUnlock = unlock;
    // capture=true so the unlock runs even if some overlay stops propagation.
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    window.addEventListener('keydown', unlock, true);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !this.disposed) {
        // iOS marks the context 'interrupted'/suspended while backgrounded and
        // pauses media elements; nudge both back on return.
        void this.resume();
        this.mediaPin.refresh();
      }
    };
    this.visibilityUnlock = onVisible;
    document.addEventListener('visibilitychange', onVisible);
  }

  private removeGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    if (this.gestureUnlock) {
      window.removeEventListener('pointerdown', this.gestureUnlock, true);
      window.removeEventListener('touchend', this.gestureUnlock, true);
      window.removeEventListener('keydown', this.gestureUnlock, true);
      this.gestureUnlock = null;
    }
    if (this.visibilityUnlock) {
      document.removeEventListener('visibilitychange', this.visibilityUnlock);
      this.visibilityUnlock = null;
    }
    this.mediaPin.dispose();
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
    if (this.disposed) return;
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
    if (this.disposed) return;
    if (Tone.getContext().state === 'running') {
      this.drone.start();
    }
  }

  triggerCollision(event: CollisionEvent): void {
    if (this.disposed) return;
    // Pre-gesture the context may still be suspended; kick a resume without
    // blocking the hit. resume() already swallows its own rejection.
    if (Tone.getContext().state !== 'running') {
      void this.resume();
    }

    // Harmonic resonance chain (§2.2): every Nth collision steps the circle of
    // fifths, retunes the pad and notifies the visual layer. This runs for EVERY
    // collision, even ones the budget drops below, so harmony stepping stays
    // deterministic under load.
    this.collisionCount += 1;
    if (shouldStepKey(this.collisionCount, HARMONY_STEP_INTERVAL)) {
      this.harmony.getNextHarmony(); // advance the key
      const index = this.harmony.getKeyIndex();
      const root = this.harmony.getCurrentHarmony().root;
      this.drone.setKey(keyRatioForRoot(root));
      this.modulationListener?.(index, KEY_NAMES[index]);
    }

    // Reverb send "feel" persists for dropped collisions too, so a combo storm
    // still swells the tail even when its voices are budgeted out.
    this.bus.onCollision(event.velocity);

    // Audio event budget: drop the excess BEFORE any per-voice Tone work.
    if (this.overAudioBudget()) return;

    const instrument = mapInstrument(event);
    const velocityGain = mapVelocity(event.velocity);
    const brightness = mapBrightness(event.velocity);

    // Pitches are chosen from the CURRENT key (§2.2): same pentatonic character,
    // transposed by the key root ratio.
    const pitch = makePitchContext(keyRatioForRoot(this.harmony.getCurrentHarmony().root));
    this.voices.play(instrument, velocityGain, brightness, pitch);
    this.drone.onCollision(instrument);
  }

  /**
   * Record this collision in the sliding window and report whether it exceeds
   * the per-window voice budget. Old timestamps are evicted in place so the
   * array never grows unbounded.
   */
  private overAudioBudget(): boolean {
    const now = Date.now();
    const cutoff = now - AUDIO_EVENT_WINDOW_MS;
    const times = this.recentEventTimes;
    while (times.length > 0 && times[0] <= cutoff) times.shift();
    times.push(now);
    return times.length > AUDIO_EVENTS_PER_100MS;
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
    this.disposed = true;
    this.removeGestureUnlock();
    this.drone.dispose();
    this.voices.dispose();
    this.bus.dispose();
  }
}
