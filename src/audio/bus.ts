import * as Tone from 'tone';
import {
  ECHO_CONFIGS,
  ECHO_MODES,
  ECHO_RAMP_SEC,
  MASTER_COMPRESSOR,
  MASTER_LIMITER_THRESHOLD,
  MASTER_VOLUME_DEFAULT_DB,
  MASTER_VOLUME_MAX_DB,
  MASTER_VOLUME_MIN_DB,
  REVERB_FIXED_DECAY,
  REVERB_BLOOM_ATTACK_SEC,
  REVERB_BLOOM_DECAY_SEC,
  REVERB_BLOOM_GAP_MS,
  REVERB_MONITOR_INTERVAL_MS,
  REVERB_SEND_DEFAULT,
  REVERB_SEND_MAX,
  REVERB_SEND_MIN,
  REVERB_SILENCE_THRESHOLD_MS,
  type EchoMode,
} from './constants';

/**
 * AudioBus owns the shared signal graph:
 *
 *   voices ─┬─▶ input ─▶ echo ─────────────┐
 *           └─▶ reverbSend ─▶ reverb ───────┤
 *                                           ▼
 *                          compressor ─▶ limiter ─▶ masterVolume ─▶ Destination
 *
 * Every instrument routes through this, so mute / echo / compression / limiting
 * always apply (fixes A3). The reverb is a real, audible aux send (fixes the
 * "reverb never connected" gap in §0.6). Its impulse response is generated ONCE
 * at construction with a fixed decay (Phase 7A); the dynamic "tail grows with
 * activity" feel is driven entirely by the send-gain monitoring loop, never by
 * regenerating the IR (that offline render was the primary freeze). A2's
 * interval is stored and cleared in dispose().
 */
export class AudioBus {
  private readonly compressor: Tone.Compressor;
  private readonly limiter: Tone.Limiter;
  private readonly masterVolume: Tone.Volume;
  /** Sound-reactive UI tap (§4.4): analysis-only, does not feed Destination. */
  private readonly meter: Tone.Meter;

  /** Single attach point for instrument voices (dry-ish path into the echo). */
  readonly input: Tone.Gain;
  private readonly echo: Tone.FeedbackDelay;

  /** Instruments also connect here; scales how much signal enters the reverb. */
  readonly reverbSend: Tone.Gain;
  private readonly reverb: Tone.Reverb;

  private echoMode: EchoMode = 'off';

  // Reverb tail state (ported from audio.ts:102-108 / 412-456). Only the send
  // level is dynamic now — the IR decay is fixed at construction.
  private reverbAccumulation = 0;
  private lastCollisionTime = 0;
  private reverbInterval: ReturnType<typeof setInterval> | null = null;
  // While a "first hit after silence" bloom is decaying, the monitor loop must
  // not fight it by pulling reverbSend back down (§2.4).
  private bloomUntil = 0;

  constructor() {
    // Master chain (audio.ts:126-142).
    this.compressor = new Tone.Compressor({
      threshold: MASTER_COMPRESSOR.threshold,
      ratio: MASTER_COMPRESSOR.ratio,
      attack: MASTER_COMPRESSOR.attack,
      release: MASTER_COMPRESSOR.release,
    });
    this.limiter = new Tone.Limiter(MASTER_LIMITER_THRESHOLD);
    this.masterVolume = new Tone.Volume(MASTER_VOLUME_DEFAULT_DB);

    this.compressor.connect(this.limiter);
    this.limiter.connect(this.masterVolume);
    this.masterVolume.toDestination();

    // Meter taps the signal AFTER masterVolume (post-mute-chain would be nicer
    // but Tone.Destination.mute doesn't expose a tappable node); it fans out
    // from masterVolume without joining the mute switch, so a muted mute-icon
    // pulse is avoided instead by gating reads on `!isMuted` at the call site
    // (ControlsOverlay). Smoothing 0.8 keeps the pulse a slow "breathing"
    // signal rather than a jittery VU meter.
    this.meter = new Tone.Meter({ smoothing: 0.8 });
    this.masterVolume.connect(this.meter);

    // Reverb aux send: the convolver runs fully wet, `reverbSend` controls how
    // much dry signal is fed into it. The IR is generated ONCE here with a fixed
    // decay — it is never regenerated at runtime (Phase 7A freeze fix).
    this.reverb = new Tone.Reverb({ decay: REVERB_FIXED_DECAY });
    this.reverb.wet.value = 1;
    this.reverb.connect(this.compressor);
    this.reverbSend = new Tone.Gain(REVERB_SEND_DEFAULT);
    this.reverbSend.connect(this.reverb);

    // Echo feedback delay -> compressor (audio.ts:171-176).
    const off = ECHO_CONFIGS.off;
    this.echo = new Tone.FeedbackDelay({
      delayTime: off.delayTime,
      feedback: off.feedback,
      wet: off.wet,
    });
    this.echo.connect(this.compressor);

    this.input = new Tone.Gain(1);
    this.input.connect(this.echo);

    this.startReverbMonitoring();
  }

  // ==================== ECHO ====================

  setEchoMode(mode: EchoMode): void {
    this.echoMode = mode;
    const config = ECHO_CONFIGS[mode];
    // Ramp rather than hard-set to remove zipper clicks (A14). delayTime,
    // feedback and wet are all Tone Signal/Param types that support rampTo.
    this.echo.delayTime.rampTo(config.delayTime, ECHO_RAMP_SEC);
    this.echo.feedback.rampTo(config.feedback, ECHO_RAMP_SEC);
    this.echo.wet.rampTo(config.wet, ECHO_RAMP_SEC);
  }

  getEchoMode(): EchoMode {
    return this.echoMode;
  }

  cycleEchoMode(): EchoMode {
    const nextIndex = (ECHO_MODES.indexOf(this.echoMode) + 1) % ECHO_MODES.length;
    const next = ECHO_MODES[nextIndex];
    this.setEchoMode(next);
    return next;
  }

  // ==================== REVERB TAIL ====================

  /** Called on every collision to feed the dynamic reverb tail (A2 logic). */
  onCollision(velocity: number): void {
    const now = Date.now();
    const gap = now - this.lastCollisionTime;
    this.lastCollisionTime = now;
    const velocityFactor = Math.min(1, velocity / 10);
    this.reverbAccumulation = Math.min(1, this.reverbAccumulation + 0.1 * velocityFactor);

    // First hit after a long silence blooms the reverb send to max, then eases
    // back over a few seconds (§2.4). A short attack ramp avoids a click; the
    // bloom window keeps the monitor loop from clawing it back.
    if (gap > REVERB_BLOOM_GAP_MS) {
      const bloomStart = Tone.now();
      this.reverbSend.gain.rampTo(REVERB_SEND_MAX, REVERB_BLOOM_ATTACK_SEC, bloomStart);
      this.reverbSend.gain.rampTo(
        REVERB_SEND_DEFAULT,
        REVERB_BLOOM_DECAY_SEC,
        bloomStart + REVERB_BLOOM_ATTACK_SEC
      );
      this.bloomUntil = now + REVERB_BLOOM_DECAY_SEC * 1000;
    }
  }

  private startReverbMonitoring(): void {
    this.reverbInterval = setInterval(() => {
      const timeSinceLastCollision = Date.now() - this.lastCollisionTime;

      // Accumulation still tracks activity — it just drives the send level now,
      // not the (fixed) IR decay. The audible "tail grows with activity" intent
      // survives entirely through reverbSend dynamics.
      if (timeSinceLastCollision > REVERB_SILENCE_THRESHOLD_MS) {
        this.reverbAccumulation = Math.max(0, this.reverbAccumulation - 0.02);
      } else {
        this.reverbAccumulation = Math.min(1, this.reverbAccumulation + 0.05);
      }

      if (Tone.getContext().state !== 'running') return;

      // Don't touch the send while a silence-breaking bloom is decaying (§2.4).
      if (Date.now() < this.bloomUntil) return;

      const sendGain =
        REVERB_SEND_MIN + this.reverbAccumulation * (REVERB_SEND_MAX - REVERB_SEND_MIN);
      this.reverbSend.gain.rampTo(sendGain, 0.1);
    }, REVERB_MONITOR_INTERVAL_MS);
  }

  // ==================== MUTE / VOLUME ====================

  /** True mute via the global destination — independent of master volume (A3/A4). */
  setMuted(muted: boolean): void {
    Tone.getDestination().mute = muted;
  }

  setMasterVolume(db: number): void {
    this.masterVolume.volume.value = Math.max(
      MASTER_VOLUME_MIN_DB,
      Math.min(MASTER_VOLUME_MAX_DB, db)
    );
  }

  getMasterVolume(): number {
    return this.masterVolume.volume.value;
  }

  // ==================== METERING (§4.4) ====================

  /**
   * Current output level in dBFS (roughly -Infinity when silent .. 0 at full
   * scale). Callers wanting a UI-friendly 0..1 value should normalize (see
   * `AudioEngine.getOutputLevel`); this returns the raw Tone.Meter reading.
   */
  getLevel(): number {
    const value = this.meter.getValue();
    return typeof value === 'number' ? value : (value[0] ?? -Infinity);
  }

  // ==================== LIFECYCLE ====================

  dispose(): void {
    if (this.reverbInterval !== null) {
      clearInterval(this.reverbInterval);
      this.reverbInterval = null;
    }
    for (const node of [
      this.input,
      this.echo,
      this.reverbSend,
      this.reverb,
      this.compressor,
      this.limiter,
      this.masterVolume,
      this.meter,
    ]) {
      try {
        node.dispose();
      } catch {
        // Non-fatal during teardown.
      }
    }
  }
}
