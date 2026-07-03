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

// ==================== VELOCITY -> BRIGHTNESS (§2.3) ====================
// Velocity also drives filter cutoff so soft hits sound muffled and hard hits
// open up. brightness is clamped to 0..1 using the same offset/range as the
// gain map, then lerped into a cutoff multiplier. Kept subtle (not a wah).

export const BRIGHTNESS_MIN = 0;
export const BRIGHTNESS_MAX = 1;
export const BRIGHTNESS_CUTOFF_MUL_MIN = 0.6; // soft hit -> darker
export const BRIGHTNESS_CUTOFF_MUL_MAX = 1.6; // hard hit -> brighter

// ==================== REVERB BLOOM (§2.4) ====================
// First hit after a long silence blooms the reverb send to max, then settles
// back over a few seconds ("breaking the silence").

export const REVERB_BLOOM_GAP_MS = 4000; // silence gap that arms the bloom
export const REVERB_BLOOM_ATTACK_SEC = 0.05; // short ramp up (no click)
export const REVERB_BLOOM_DECAY_SEC = 3; // ramp back to normal

// ==================== HARMONY (§2.2) ====================
// The circle-of-fifths key advances one step every N collisions; every voice's
// pitch is transposed to the current key root (relative to C4).

export const HARMONY_STEP_INTERVAL = 8;

// ==================== AMBIENT DRONE (§2.1 / §2.5) ====================
// The always-on "場" (field). Three tonal layers plus optional shimmer and
// binaural entrainment tones. Levels are dB; LFO rates are integer-ratio
// related to the 5s breath period (0.2Hz) per §1.3.

export const DRONE_FADE_IN_SEC = 8; // silent -> full on start()
export const DRONE_REVERB_SEND = 0.25; // modest tap into the shared reverb

// Breathing LFO depth (dB) applied to each layer's gain; the LFO swings the
// gain between dbToGain(-depth) and 1 so it only ever dips (keeps headroom).
export const DRONE_LFO_DEPTH_DB = 2.5;

// Ground — near-tactile low end.
export const DRONE_GROUND_FREQS = [65.41, 130.81]; // C2 + C3
export const DRONE_GROUND_LEVEL_DB = -28;
export const DRONE_GROUND_LFO_HZ = 0.2;

// Pad — C-G-C perfect fifths through a lowpass; follows the harmony key.
export const DRONE_PAD_FREQS = [261.63, 392, 523.25]; // C4 + G4 + C5
export const DRONE_PAD_LEVEL_DB = -34;
export const DRONE_PAD_LFO_HZ = 0.1;
export const DRONE_PAD_FILTER_HZ = 800;
export const DRONE_PAD_FILTER_LFO_MIN_HZ = 600;
export const DRONE_PAD_FILTER_LFO_MAX_HZ = 1000;

// Air — quiet high shimmer, never ducked (survives The Silence).
export const DRONE_AIR_FREQS = [1046.5, 1568]; // C6 + G6
export const DRONE_AIR_LEVEL_DB = -44;
export const DRONE_AIR_LFO_HZ = 0.08;

// Collision "the field responds": boost the matching layer, then decay back.
export const DRONE_COLLISION_BOOST_DB = 3;
export const DRONE_COLLISION_ATTACK_SEC = 0.2;
export const DRONE_COLLISION_DECAY_SEC = 4;

// The Silence (§2.4): after this idle gap, duck Ground+Pad and leave Air.
export const DRONE_SILENCE_MS = 2000;
export const DRONE_SILENCE_DUCK_DB = -12;
export const DRONE_SILENCE_RAMP_SEC = 2;
export const DRONE_SILENCE_RESTORE_SEC = 1; // un-duck on next collision
export const DRONE_SILENCE_CHECK_MS = 250; // silence watchdog interval

// Shimmer (§2.1): 4th layer added while combo >= 10.
export const DRONE_SHIMMER_FREQS = [2093, 3136]; // C7 + G7
export const DRONE_SHIMMER_LEVEL_DB = -50;
export const DRONE_SHIMMER_LFO_HZ = 0.05;
export const DRONE_SHIMMER_FADE_SEC = 2;
// NOTE: the combo count that arms the shimmer lives in the game layer
// (GAMEPLAY.unlockThresholds.goldenMarble) — shimmer and the goldenMarble
// unlock are one synchronized event. The audio package must not depend on game
// config, so the engine API stays setShimmer(bool) and the shell owns the gate.

// Pad key crossfade when the harmony key changes.
export const DRONE_KEY_CROSSFADE_SEC = 2;

// Binaural drift (§2.5): L/R detuned sines for a 4Hz theta beat.
export const BINAURAL_LEFT_HZ = 220;
export const BINAURAL_RIGHT_HZ = 224;
export const BINAURAL_LEVEL_DB = -38;
export const BINAURAL_FADE_SEC = 1;

// ==================== POLYPHONY ====================

export const GLOBAL_VOICE_CAP = 24;
export const PER_INSTRUMENT_VOICE_CAP = 5;

// Fade lengths (seconds) applied to a voice's output before it is disposed, so
// teardown never produces a click (A6).
export const VOICE_STEAL_FADE_SEC = 0.03; // 30ms when a cap steals a voice
export const VOICE_CLEANUP_FADE_SEC = 0.05; // 50ms at end-of-life
