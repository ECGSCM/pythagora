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
  REVERB_BASE_DECAY,
  REVERB_DECAY_EPSILON,
  REVERB_MAX_DECAY,
  REVERB_MIN_DECAY,
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
 * "reverb never connected" gap in §0.6); its amount and decay are driven by the
 * dynamic monitoring loop ported from the old engine (A2's interval is now
 * stored and cleared in dispose()).
 */
export class AudioBus {
  private readonly compressor: Tone.Compressor;
  private readonly limiter: Tone.Limiter;
  private readonly masterVolume: Tone.Volume;

  /** Single attach point for instrument voices (dry-ish path into the echo). */
  readonly input: Tone.Gain;
  private readonly echo: Tone.FeedbackDelay;

  /** Instruments also connect here; scales how much signal enters the reverb. */
  readonly reverbSend: Tone.Gain;
  private readonly reverb: Tone.Reverb;

  private echoMode: EchoMode = 'off';

  // Reverb tail state (ported from audio.ts:102-108 / 412-456).
  private reverbAccumulation = 0;
  private lastCollisionTime = 0;
  private dynamicReverbDecay = REVERB_BASE_DECAY;
  private appliedReverbDecay = REVERB_BASE_DECAY;
  private reverbInterval: ReturnType<typeof setInterval> | null = null;

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

    // Reverb aux send: the convolver runs fully wet, `reverbSend` controls how
    // much dry signal is fed into it.
    this.reverb = new Tone.Reverb({ decay: REVERB_BASE_DECAY });
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
    this.lastCollisionTime = Date.now();
    const velocityFactor = Math.min(1, velocity / 10);
    this.reverbAccumulation = Math.min(1, this.reverbAccumulation + 0.1 * velocityFactor);
  }

  private startReverbMonitoring(): void {
    this.reverbInterval = setInterval(() => {
      const timeSinceLastCollision = Date.now() - this.lastCollisionTime;

      if (timeSinceLastCollision > REVERB_SILENCE_THRESHOLD_MS) {
        this.dynamicReverbDecay = Math.max(REVERB_MIN_DECAY, this.dynamicReverbDecay * 0.95);
        this.reverbAccumulation = Math.max(0, this.reverbAccumulation - 0.02);
      } else {
        this.reverbAccumulation = Math.min(1, this.reverbAccumulation + 0.05);
      }

      const targetDecay =
        REVERB_MIN_DECAY + this.reverbAccumulation * (REVERB_MAX_DECAY - REVERB_MIN_DECAY);
      this.dynamicReverbDecay += (targetDecay - this.dynamicReverbDecay) * 0.1;

      if (Tone.getContext().state !== 'running') return;

      // Regenerating the convolution buffer is expensive, so only push a new
      // decay once it has drifted past a small threshold.
      if (Math.abs(this.dynamicReverbDecay - this.appliedReverbDecay) > REVERB_DECAY_EPSILON) {
        this.reverb.decay = this.dynamicReverbDecay;
        this.appliedReverbDecay = this.dynamicReverbDecay;
      }

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
    ]) {
      try {
        node.dispose();
      } catch {
        // Non-fatal during teardown.
      }
    }
  }
}
