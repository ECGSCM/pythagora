// Named constants for the audio engine. Values are carried over verbatim from
// the old monolithic audio module so the rebuild preserves behaviour; anything
// that only existed as a magic literal there now lives here.

// ==================== ECHO MODE ====================

export type EchoMode = 'off' | 'short' | 'long';

export interface EchoConfig {
  delayTime: number;
  feedback: number;
  wet: number;
}

// Ported from audio.ts:91-95.
export const ECHO_CONFIGS: Record<EchoMode, EchoConfig> = {
  off: { delayTime: 0, feedback: 0, wet: 0 },
  short: { delayTime: 0.2, feedback: 0.3, wet: 0.25 }, // 200ms delay
  long: { delayTime: 0.8, feedback: 0.6, wet: 0.4 }, // 800ms delay
};

export const ECHO_MODES: EchoMode[] = ['off', 'short', 'long'];

// A short ramp instead of an instant parameter jump kills the zipper/click
// noise when switching echo modes (A14).
export const ECHO_RAMP_SEC = 0.05;

// ==================== MASTER CHAIN ====================
// Chain: [sources] -> compressor -> limiter -> volume -> Destination
// Ported from audio.ts:126-137.

export const MASTER_COMPRESSOR = {
  threshold: -16, // start compressing at -16dB
  ratio: 8, // 8:1 (aggressive)
  attack: 0.005, // 5ms
  release: 0.25, // 250ms
} as const;

export const MASTER_LIMITER_THRESHOLD = -3; // never exceed -3dB
export const MASTER_VOLUME_DEFAULT_DB = -12; // -12dB default for headroom

// setMasterVolume() clamps into this window (audio.ts:1624-1626).
export const MASTER_VOLUME_MIN_DB = -60;
export const MASTER_VOLUME_MAX_DB = 0;

// ==================== REVERB TAIL ====================
// The reverb is an aux send: the convolver itself runs fully wet and the
// audible amount is controlled by `reverbSend`'s linear gain. Ported from
// audio.ts:102-108 / 412-456.

export const REVERB_BASE_DECAY = 8; // seconds (hall)
export const REVERB_MIN_DECAY = 2;
export const REVERB_MAX_DECAY = 20;

// Reverb send (linear gain) range, mapped from the old wet range (0.2-0.5).
export const REVERB_SEND_MIN = 0.2;
export const REVERB_SEND_MAX = 0.5;
export const REVERB_SEND_DEFAULT = 0.3;

export const REVERB_MONITOR_INTERVAL_MS = 100;
export const REVERB_SILENCE_THRESHOLD_MS = 3000; // no collisions => "silence"
export const REVERB_DECAY_EPSILON = 0.25; // only regenerate the buffer past this

// ==================== VELOCITY MAPPING ====================
// velocityGain = clamp((v - VELOCITY_OFFSET) / VELOCITY_RANGE, MIN, MAX)

export const VELOCITY_OFFSET = 1;
export const VELOCITY_RANGE = 12;
export const VELOCITY_GAIN_MIN = 0.25;
export const VELOCITY_GAIN_MAX = 1;

// ==================== POLYPHONY ====================

export const GLOBAL_VOICE_CAP = 24;
export const PER_INSTRUMENT_VOICE_CAP = 5;

// Fade lengths (seconds) applied to a voice's output before it is disposed, so
// teardown never produces a click (A6).
export const VOICE_STEAL_FADE_SEC = 0.03; // 30ms when a cap steals a voice
export const VOICE_CLEANUP_FADE_SEC = 0.05; // 50ms at end-of-life
