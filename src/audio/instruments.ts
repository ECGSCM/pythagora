import * as Tone from 'tone';
import {
  BRIGHTNESS_CUTOFF_MUL_MIN,
  BRIGHTNESS_CUTOFF_MUL_MAX,
  FILTER_CUTOFF_MAX_HZ,
  FILTER_CUTOFF_MIN_HZ,
  OCTAVE_MULTIPLIERS,
  PENTATONIC_RATIOS,
} from './constants';
import { REFERENCE_ROOT_HZ } from './harmony';

// Declarative instrument voices. Each factory reproduces the EXACT node recipe
// of the matching play* method in the old audio module (same oscillator
// types/frequencies/detunings, filters/Q, ADSR values and internal gains) — a
// plumbing refactor, not a re-voicing. The differences are deliberate:
//   * every voice ends in a per-voice `output` Gain (never wired straight to
//     the hardware output) so the bus/mute/echo/reverb chain always applies
//     (A3, A15);
//   * the funnel gains a real amplitude envelope so it no longer hard-cuts (A7);
//   * lifetimes are DERIVED from the envelope, never hand-picked (A6).
//
// Phase 7A — voices are POOLED and RETRIGGERABLE. A factory builds its graph
// ONCE and starts its oscillators/LFOs once (they run forever; the closed
// AmplitudeEnvelope gates them to silence). trigger() re-tunes oscillators from
// the current pitch context, re-scales the output gain / filter cutoff, and
// re-fires the envelope. All frequency/gain automation is pinned with
// cancelScheduledValues at a strictly-increasing per-voice time so rapid
// retriggers never raise Tone's 'Start time must be strictly greater' error.

export type InstrumentName =
  | 'bumper'
  | 'chime'
  | 'bell'
  | 'spinner'
  | 'ramp'
  | 'funnel'
  | 'seesaw'
  | 'impact';

/**
 * Pitch selection context supplied by the engine from the HarmonyEngine's
 * current key (§2.2). `scaleFreq` reproduces the original random-pentatonic
 * character but transposed to the current key; `keyRatio` is the raw
 * transposition factor for instruments that pick from their own fixed scale
 * (ramp). Superset of the design-doc type `{ scaleFreq }` — the extra
 * `keyRatio` lets the ramp transpose without widening its octave spread.
 */
export interface PitchContext {
  scaleFreq: (base: number) => number;
  keyRatio: number;
}

export interface Voice {
  /** Per-voice output; the VoiceManager connects this to the bus + reverb send. */
  readonly output: Tone.Gain;
  /** Derived total lifetime in ms (attack+decay+duration+release, plus margin). */
  readonly lifetimeMs: number;
  /**
   * (Re)trigger this voice. `velocityGain` (0..1) scales the output;
   * `brightness` (0..1) scales any filter cutoff (§2.3) — soft hits sound
   * darker, hard hits open up; `pitch` is the current-key pitch context the
   * voice re-tunes its oscillators from. Oscillators are already running (the
   * envelope gates them), so this only re-tunes and re-fires the envelope.
   */
  trigger(velocityGain: number, brightness: number, pitch: PitchContext): void;
  dispose(): void;
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cutoff multiplier for a LOWPASS (§2.3), lerp(0.6, 1.6, b): a harder hit
 * raises the corner, so more of the voice's spectrum passes — louder AND
 * brighter, which is what the README documents.
 */
export function brightnessCutoffMul(brightness: number): number {
  return lerp(BRIGHTNESS_CUTOFF_MUL_MIN, BRIGHTNESS_CUTOFF_MUL_MAX, brightness);
}

/**
 * Cutoff multiplier for a HIGHPASS (A5). The multiplier that OPENS a lowpass
 * CLOSES a highpass — which is why hard seesaw/chime hits used to sound THINNER
 * and quieter than soft ones, the exact opposite of the documented behaviour.
 * Inverting the lerp restores the intent: a hard hit drops the highpass corner
 * so more of the body passes (fuller, louder); a soft hit raises it (small and
 * thin). Same constants, same 0.6..1.6 span, opposite direction.
 */
export function brightnessHighpassCutoffMul(brightness: number): number {
  return lerp(BRIGHTNESS_CUTOFF_MUL_MAX, BRIGHTNESS_CUTOFF_MUL_MIN, brightness);
}

/**
 * A3 — filter cutoff RELATIVE TO THE VOICE'S OWN FUNDAMENTAL.
 *
 * Every instrument used to pin its filter at a fixed Hz value while its pitch
 * jumped around by up to four octaves per hit, so the same instrument was
 * filtered completely differently from one collision to the next (up to ~45dB
 * of loudness swing on the seesaw and chime — four times velocity's 12dB
 * range). Expressing the cutoff as `ratio` x fundamental makes the filter track
 * the pitch, so the octave draw changes the NOTE and velocity changes the
 * LOUDNESS, which is the causality the README promises.
 *
 * `ratio` is the instrument's original cutoff divided by its design
 * fundamental, so the voice's timbre at its design pitch is unchanged.
 */
export function cutoffHz(fundamentalHz: number, ratio: number, mul: number): number {
  const hz = fundamentalHz * ratio * mul;
  return Math.min(FILTER_CUTOFF_MAX_HZ, Math.max(FILTER_CUTOFF_MIN_HZ, hz));
}

/**
 * Pure lifetime derivation shared by every instrument (A6): a voice lives long
 * enough for its full envelope — attack + decay + the held trigger duration +
 * release — plus a small safety margin, so cleanup never truncates the tail.
 */
export function computeVoiceLifetimeMs(
  env: { attack: number; decay: number; release: number },
  triggerDurationSec: number
): number {
  return (env.attack + env.decay + triggerDurationSec + env.release) * 1000 + 100;
}

// ==================== PITCH HELPERS (ported from audio.ts:1017-1027) ====================

function randomFreq(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * A7 — the ONE scale root every instrument (and the C-G-C drone pad) shares.
 * Aliased to the harmony module's reference root (C4) so the scale bases and
 * the `keyRatio` transposition can never drift apart.
 */
export const SCALE_ROOT_HZ = REFERENCE_ROOT_HZ;

/**
 * A7 — per-instrument scale base. EVERY value is a C (a power of two times
 * SCALE_ROOT_HZ), so all eight instruments draw from a single major-pentatonic
 * set and stay in the key the drone establishes. Before this, bell/funnel sat
 * on A and the seesaw on G: an A root yields A B C# E F#, so 2 of every 5
 * bell/funnel notes clashed with the C-rooted pad, and the seesaw's G root
 * contributed a B. `keyRatio` is a uniform transposition so it could never fix
 * a RELATIVE offset like that.
 *
 * Registers are preserved — each off-key instrument moved by the smallest
 * interval that lands on a C (a minor third or less):
 *   bell   A5 880   -> C6 1046.5  (still the highest, brightest voice)
 *   funnel A4 440   -> C5 523.25  (still mid)
 *   seesaw G4 392   -> C5 523.25  (still mid; C5 is 5 semitones up vs 7 down)
 *   impact    528   -> C5 523.25  (528 was the "solfeggio" number, 16 cents
 *                                  sharp of the C5 its own comment claimed)
 */
export const INSTRUMENT_BASE_HZ = {
  bumper: 65.41, // C2
  chime: 523.25, // C5
  bell: 1046.5, // C6
  spinner: 261.63, // C4
  ramp: 130.81, // C3 — the ramp runs its own C-pentatonic ladder, see below
  funnel: 523.25, // C5
  seesaw: 523.25, // C5
  impact: 523.25, // C5
} as const satisfies Record<InstrumentName, number>;

/**
 * Major-pentatonic random pitch — the source of each instrument's "different
 * note every hit" character. A3: the octave jump is now two octaves wide, not
 * four (see OCTAVE_MULTIPLIERS), so it colours the melody instead of swamping
 * velocity.
 */
export function randomScaleFreq(baseFreq: number): number {
  const ratio = PENTATONIC_RATIOS[Math.floor(Math.random() * PENTATONIC_RATIOS.length)];
  const octave = OCTAVE_MULTIPLIERS[Math.floor(Math.random() * OCTAVE_MULTIPLIERS.length)];
  return baseFreq * ratio * octave;
}

/**
 * Build the per-collision pitch context for the current key (§2.2): a random
 * major-pentatonic degree over a two-octave spread, transposed by `keyRatio`
 * (the ratio of the current circle-of-fifths root to C4).
 */
export function makePitchContext(keyRatio: number): PitchContext {
  return {
    keyRatio,
    scaleFreq: (base: number) => randomScaleFreq(base) * keyRatio,
  };
}

type Disposable = { dispose(): void };

function disposeAll(nodes: Disposable[]): void {
  for (const node of nodes) {
    try {
      node.dispose();
    } catch {
      // Disposal errors are non-fatal during teardown.
    }
  }
}

function stopAll(sources: Array<Tone.Oscillator | Tone.LFO | Tone.Chorus>): void {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // Already stopped / disposed.
    }
  }
}

function startAll(sources: Array<Tone.Oscillator | Tone.LFO | Tone.Chorus>): void {
  for (const source of sources) {
    try {
      source.start();
    } catch {
      // Already started / disposed — non-fatal.
    }
  }
}

/** Anything with the Web-Audio param scheduling surface we retune against. */
interface Schedulable {
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
}

/**
 * Pin a param to `value` at `t`, clearing any pending automation first. Called
 * only with strictly-increasing `t` (see makeClock), which is what keeps rapid
 * retriggers from tripping Tone's 'Start time' invariant.
 */
function setParam(param: Schedulable, value: number, t: number): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(value, t);
}

/**
 * Per-voice monotonic schedule clock. Every retrigger asks for `now`, but never
 * gets a time <= the previous one — two collisions in the same audio render
 * quantum would otherwise schedule two events at an identical time on the same
 * param and throw 'Start time must be strictly greater than previous start
 * time'. A 1ms floor is inaudible and guarantees strict monotonicity.
 */
function makeClock(): () => number {
  let last = 0;
  return () => {
    const t = Math.max(Tone.now(), last + 0.001);
    last = t;
    return t;
  };
}

// ==================== INSTRUMENTS ====================

// bumper — DEEP TEMPLE BELL (audio.ts:1029 playDrumHit)
// Design cutoff 800Hz over a C2 fundamental.
const BUMPER_FILTER_RATIO = 800 / 65.41;

function createBumper(): Voice {
  const base = INSTRUMENT_BASE_HZ.bumper;
  const output = new Tone.Gain(1);
  const osc1 = new Tone.Oscillator(base, 'sine'); // C2 base, retuned per trigger
  const osc2 = new Tone.Oscillator(base * 2.02, 'sine');
  const osc3 = new Tone.Oscillator(base * 3.05, 'triangle');
  const gain = new Tone.Gain(0.6);
  const filter = new Tone.Filter({ frequency: base * BUMPER_FILTER_RATIO, type: 'lowpass', Q: 2 });
  const adsr = { attack: 0.01, decay: 1.0, sustain: 0.2, release: 1.5 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  const oscs = [osc1, osc2, osc3];
  startAll(oscs);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 2),
    trigger(v, brightness, pitch) {
      const t = clock();
      const freq = pitch.scaleFreq(base);
      setParam(osc1.frequency, freq, t);
      setParam(osc2.frequency, freq * 2.02, t);
      setParam(osc3.frequency, freq * 3.05, t);
      setParam(output.gain, v, t);
      setParam(
        filter.frequency,
        cutoffHz(freq, BUMPER_FILTER_RATIO, brightnessCutoffMul(brightness)),
        t
      );
      env.triggerAttackRelease('2s', t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll([osc1, osc2, osc3, filter, env, gain, output]);
    },
  };
}

// chime — HEAVENLY HARP (audio.ts:1091 playChimeHit)
//
// A2: this voice used to be effectively inaudible. Its partials sit at
// f x [1, 2.5, 5.1, 8.2, 12.5] with f ~262..3489Hz and gains weighted
// 0.3/(i+1) — so the LOUDEST partial is the LOWEST one — and it ran them
// through a 12kHz HIGHPASS. Analytically that put the chime's peak between
// -71dB and -26dB while the bumper sits around +5..+9dB: 30-55dB down, i.e.
// gone. It is now a LOWPASS at 6x the voice's own fundamental (so the octave
// draw can never push the partials out of the passband, A3) and the master
// gain is raised 0.5 -> 3.0 (+15.6dB) to land it in the bumper's ballpark:
// ~+5.0dB peak at velocity 1, versus the bumper's ~+5.2dB. The lowpass also
// makes A5 correct for free — brightness now OPENS the filter on a hard hit.
const CHIME_FILTER_RATIO = 6;
const CHIME_MASTER_GAIN = 3.0;

function createChime(): Voice {
  const base = INSTRUMENT_BASE_HZ.chime;
  const output = new Tone.Gain(1);
  const harmonicRatios = [1, 2.5, 5.1, 8.2, 12.5];
  const masterGain = new Tone.Gain(CHIME_MASTER_GAIN);
  const filter = new Tone.Filter({
    frequency: base * CHIME_FILTER_RATIO,
    type: 'lowpass',
    Q: 0.5,
  });
  const adsr = { attack: 0.05, decay: 1.5, sustain: 0.2, release: 2.5 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [filter, env, masterGain, output];
  harmonicRatios.forEach((ratio, i) => {
    const osc = new Tone.Oscillator(base * ratio, 'sine'); // C5 base, retuned per trigger
    const layerGain = new Tone.Gain(0.3 / (i + 1)); // decreasing per harmonic
    osc.connect(layerGain);
    layerGain.connect(filter);
    oscs.push(osc);
    disposables.push(osc, layerGain);
  });

  filter.connect(env);
  env.connect(masterGain);
  masterGain.connect(output);

  startAll(oscs);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 3),
    trigger(v, brightness, pitch) {
      const t = clock();
      const freq = pitch.scaleFreq(base);
      oscs.forEach((o, i) => setParam(o.frequency, freq * harmonicRatios[i], t));
      setParam(output.gain, v, t);
      setParam(
        filter.frequency,
        cutoffHz(freq, CHIME_FILTER_RATIO, brightnessCutoffMul(brightness)),
        t
      );
      env.triggerAttackRelease('3s', t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll(disposables);
    },
  };
}

// bell — CRYSTAL PURE TONE (audio.ts:1157 playBellHit)
function createBell(): Voice {
  const base = INSTRUMENT_BASE_HZ.bell;
  const output = new Tone.Gain(1);
  const osc = new Tone.Oscillator(base, 'sine'); // C6 base, retuned per trigger
  // Bandpass + LFO range are already expressed relative to the fundamental, so
  // this voice was never subject to the fixed-cutoff-vs-octave-draw bug (A3).
  const filter = new Tone.Filter({ frequency: base * 1.5, type: 'bandpass', Q: 20 });
  // LFO sweeps the bandpass; its rate + range are re-randomized/retuned per
  // trigger to keep the original "different shimmer every hit" character now
  // that a pooled voice outlives a single hit.
  const lfo = new Tone.LFO({ frequency: 0.1, min: base * 0.8, max: base * 2, type: 'sine' });
  const adsr = { attack: 0.001, decay: 2, sustain: 0.1, release: 3 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const gain = new Tone.Gain(0.4);

  lfo.connect(filter.frequency);
  osc.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  startAll([osc, lfo]);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 4),
    // Bell's bandpass cutoff is already swept by its own LFO, so brightness is
    // intentionally not applied here (would fight the sweep). §2.3.
    trigger(v, _brightness, pitch) {
      const t = clock();
      const freq = pitch.scaleFreq(base);
      setParam(osc.frequency, freq, t);
      setParam(lfo.frequency, randomFreq(0.05, 0.2), t);
      lfo.min = freq * 0.8;
      lfo.max = freq * 2;
      setParam(output.gain, v, t);
      env.triggerAttackRelease('4s', t);
    },
    dispose() {
      stopAll([osc, lfo]);
      disposeAll([osc, filter, lfo, env, gain, output]);
    },
  };
}

// spinner — COSMIC CHORD (audio.ts:1222 playSpinnerHit)
function createSpinner(): Voice {
  const base = INSTRUMENT_BASE_HZ.spinner;
  const output = new Tone.Gain(1);
  const chordIntervals = [1, 1.25, 1.5, 2];

  const chorus = new Tone.Chorus({ frequency: 0.1, delayTime: 4, depth: 0.8, wet: 0.6 });
  const adsr = { attack: 0.3, decay: 1, sustain: 0.5, release: 2 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const masterGain = new Tone.Gain(0.3);

  const oscs: Tone.Oscillator[] = [];
  // Per-note fundamental+harmonic pair so trigger() can retune the whole chord.
  const noteOscs: { fundamental: Tone.Oscillator; harmonic: Tone.Oscillator }[] = [];
  // A3: each chord note's lowpass is stored as a ratio of ITS OWN design
  // frequency (the original 3000 + i*500 Hz over 261.63 * interval), so the
  // whole chord's timbre is identical at every octave draw.
  const filters: { filter: Tone.Filter; ratio: number }[] = [];
  const disposables: Disposable[] = [chorus, env, masterGain, output];
  chordIntervals.forEach((interval, i) => {
    const freq = base * interval; // C4 base, retuned per trigger
    const fundamental = new Tone.Oscillator(freq, 'sine');
    const harmonic = new Tone.Oscillator(freq * 2.01, 'triangle');
    const noteGain = new Tone.Gain(0.2);
    const filterRatio = (3000 + i * 500) / freq;
    const filter = new Tone.Filter({ frequency: freq * filterRatio, type: 'lowpass', Q: 1 });
    fundamental.connect(filter);
    harmonic.connect(filter);
    filter.connect(noteGain); // preserved dead-end from the original recipe
    filter.connect(chorus);
    oscs.push(fundamental, harmonic);
    noteOscs.push({ fundamental, harmonic });
    filters.push({ filter, ratio: filterRatio });
    disposables.push(fundamental, harmonic, noteGain, filter);
  });

  chorus.connect(env);
  env.connect(masterGain);
  masterGain.connect(output);

  startAll([...oscs, chorus]);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 3),
    trigger(v, brightness, pitch) {
      const t = clock();
      const baseFreq = pitch.scaleFreq(base);
      noteOscs.forEach(({ fundamental, harmonic }, i) => {
        const freq = baseFreq * chordIntervals[i];
        setParam(fundamental.frequency, freq, t);
        setParam(harmonic.frequency, freq * 2.01, t);
      });
      setParam(output.gain, v, t);
      const mul = brightnessCutoffMul(brightness);
      filters.forEach(({ filter, ratio }, i) => {
        setParam(filter.frequency, cutoffHz(baseFreq * chordIntervals[i], ratio, mul), t);
      });
      env.triggerAttackRelease('3s', t);
    },
    dispose() {
      stopAll([...oscs, chorus]);
      disposeAll(disposables);
    },
  };
}

// ramp — SUIKINKUTSU water harp (audio.ts:1304 playRampSlide)
// Design cutoff 2000Hz over the ladder's C3 root.
const RAMP_FILTER_RATIO = 2000 / 130.81;

function createRamp(): Voice {
  const output = new Tone.Gain(1);
  // Ramp keeps its own tight low-octave scale (character); each trigger picks a
  // random step and transposes it by the raw keyRatio (not scaleFreq's octave
  // spread). The per-hit random pentatonic choice now lives in trigger().
  // A7: this ladder is C3 D3 E3 G3 A3 C4 — already the shared C major
  // pentatonic, so it needed no re-rooting.
  const pentatonicScale = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63];

  const osc = new Tone.Oscillator(pentatonicScale[0], 'sine');
  const metalOsc1 = new Tone.Oscillator(pentatonicScale[0] * 2.002, 'sine');
  const metalOsc2 = new Tone.Oscillator(pentatonicScale[0] * 3.003, 'sine');
  const metalOsc3 = new Tone.Oscillator(pentatonicScale[0] * 4.001, 'sine');

  const metalEnv1 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 2.0, sustain: 0.1, release: 4.0 });
  const metalEnv2 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.5, sustain: 0.05, release: 3.0 });
  const metalEnv3 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.0, sustain: 0.03, release: 2.0 });
  const mainEnv = new Tone.AmplitudeEnvelope({ attack: 0.005, decay: 0.3, sustain: 0.05, release: 3.0 });

  const filter = new Tone.Filter({
    frequency: pentatonicScale[0] * RAMP_FILTER_RATIO,
    type: 'lowpass',
    Q: 0.5,
  });
  const mainGain = new Tone.Gain(0.5);
  const metalGain1 = new Tone.Gain(0.15);
  const metalGain2 = new Tone.Gain(0.08);
  const metalGain3 = new Tone.Gain(0.05);

  osc.connect(filter);
  filter.connect(mainEnv);
  mainEnv.connect(mainGain);
  mainGain.connect(output);

  metalOsc1.connect(metalEnv1);
  metalEnv1.connect(metalGain1);
  metalGain1.connect(output);
  metalOsc2.connect(metalEnv2);
  metalEnv2.connect(metalGain2);
  metalGain2.connect(output);
  metalOsc3.connect(metalEnv3);
  metalEnv3.connect(metalGain3);
  metalGain3.connect(output);

  const oscs = [osc, metalOsc1, metalOsc2, metalOsc3];
  startAll(oscs);
  const clock = makeClock();
  // Longest-living envelope is metalEnv1 held for 6s.
  const lifetimeMs = Math.max(
    computeVoiceLifetimeMs({ attack: 0.01, decay: 2.0, release: 4.0 }, 6),
    computeVoiceLifetimeMs({ attack: 0.01, decay: 1.5, release: 3.0 }, 5),
    computeVoiceLifetimeMs({ attack: 0.005, decay: 0.3, release: 3.0 }, 3.5)
  );

  return {
    output,
    lifetimeMs,
    trigger(v, brightness, pitch) {
      const t = clock();
      const baseFreq =
        pentatonicScale[Math.floor(Math.random() * pentatonicScale.length)] * pitch.keyRatio;
      const targetFreq = baseFreq * 0.98; // subtle 0.7s downward "plink" bend
      setParam(metalOsc1.frequency, baseFreq * 2.002, t);
      setParam(metalOsc2.frequency, baseFreq * 3.003, t);
      setParam(metalOsc3.frequency, baseFreq * 4.001, t);
      setParam(output.gain, v, t);
      setParam(
        filter.frequency,
        cutoffHz(baseFreq, RAMP_FILTER_RATIO, brightnessCutoffMul(brightness)),
        t
      );
      mainEnv.triggerAttackRelease('3.5s', t);
      metalEnv1.triggerAttackRelease('6s', t);
      metalEnv2.triggerAttackRelease('5s', t + 0.05);
      metalEnv3.triggerAttackRelease('4s', t + 0.1);
      // Gentle downward bend on the fundamental over 0.7s (setValueAtTime pins
      // the start so the exponential ramp has a defined, positive origin).
      setParam(osc.frequency, baseFreq, t);
      osc.frequency.exponentialRampTo(targetFreq, 0.7, t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll([
        osc, metalOsc1, metalOsc2, metalOsc3, filter, mainEnv, metalEnv1, metalEnv2, metalEnv3,
        mainGain, metalGain1, metalGain2, metalGain3, output,
      ]);
    },
  };
}

// funnel — SPIRALING ARPEGGIO (audio.ts:1455 playSpiralEffect)
// A6/A7: the original had NO envelope and was hard-cut after 2s. It now gets a
// swirl-preserving amplitude envelope so the oscillators/pan/delay fade out.
function createFunnel(): Voice {
  const base = INSTRUMENT_BASE_HZ.funnel;
  const output = new Tone.Gain(1);
  const ratios = [1, 1.5, 2];
  const masterGain = new Tone.Gain(0.35);
  const adsr = { attack: 0.05, decay: 0.6, sustain: 0.3, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [masterGain, env, output];
  ratios.forEach((ratio, i) => {
    const osc = new Tone.Oscillator(base * ratio, 'sine'); // C5 base, retuned per trigger
    const gain = new Tone.Gain(0.3);
    const panner = new Tone.Panner(-0.6 + i * 0.6);
    const delay = new Tone.FeedbackDelay('8n', 0.3);
    delay.wet.value = 0.2;
    osc.connect(delay);
    delay.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    oscs.push(osc);
    disposables.push(osc, gain, panner, delay);
  });

  masterGain.connect(env);
  env.connect(output);

  startAll(oscs);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 1.2),
    // No filter, so brightness is intentionally not applied (matches original).
    trigger(v, _brightness, pitch) {
      const t = clock();
      const baseFreq = pitch.scaleFreq(base);
      oscs.forEach((o, i) => setParam(o.frequency, baseFreq * ratios[i], t));
      setParam(output.gain, v, t);
      env.triggerAttackRelease('1.2s', t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll(disposables);
    },
  };
}

// seesaw — PLAYFUL XYLOPHONE (audio.ts:1510 playSeesawTilt)
//
// A3/A5: the highpass used to be pinned at 5kHz while the fundamental jumped
// 196..2614Hz, so a low draw lost all three partials (-41dB) and a high draw
// kept two (+4dB) — a 45dB swing that had nothing to do with how hard the
// marble hit. It now sits at 1.5x the voice's own fundamental (the corner rides
// just above the fundamental, keeping the thin, bright xylophone character at
// every pitch) and it uses the INVERTED brightness multiplier so a hard hit
// LOWERS the corner and sounds fuller, per A5.
const SEESAW_FILTER_RATIO = 1.5;

function createSeesaw(): Voice {
  const base = INSTRUMENT_BASE_HZ.seesaw;
  const output = new Tone.Gain(1);
  const osc1 = new Tone.Oscillator(base, 'sine'); // C5 base, retuned per trigger
  const osc2 = new Tone.Oscillator(base * 3, 'sine');
  const osc3 = new Tone.Oscillator(base * 5, 'triangle');
  const adsr = { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const filter = new Tone.Filter({
    frequency: base * SEESAW_FILTER_RATIO,
    type: 'highpass',
    Q: 2,
  });
  const gain = new Tone.Gain(0.5);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  const oscs = [osc1, osc2, osc3];
  startAll(oscs);
  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 1),
    trigger(v, brightness, pitch) {
      const t = clock();
      const baseFreq = pitch.scaleFreq(base);
      setParam(osc1.frequency, baseFreq, t);
      setParam(osc2.frequency, baseFreq * 3, t);
      setParam(osc3.frequency, baseFreq * 5, t);
      setParam(output.gain, v, t);
      // Highpass => INVERTED brightness multiplier (A5).
      setParam(
        filter.frequency,
        cutoffHz(baseFreq, SEESAW_FILTER_RATIO, brightnessHighpassCutoffMul(brightness)),
        t
      );
      env.triggerAttackRelease('1s', t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll([osc1, osc2, osc3, filter, env, gain, output]);
    },
  };
}

// impact — the old default collision sound (audio.ts:1573 playDefaultCollision).
// Tone.Synth is inherently monophonic + retriggerable: triggerAttackRelease
// both retunes and re-fires it, so it needs no manual oscillator lifecycle.
function createImpact(): Voice {
  const output = new Tone.Gain(1);
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.5 },
  });
  synth.connect(output);

  const clock = makeClock();
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs({ attack: 0.05, decay: 0.3, release: 0.5 }, 0.8),
    trigger(v, _brightness, pitch) {
      const t = clock();
      const freq = pitch.scaleFreq(INSTRUMENT_BASE_HZ.impact); // C5 base (was 528Hz)
      setParam(output.gain, v, t);
      synth.triggerAttackRelease(freq, '0.8s', t);
    },
    dispose() {
      disposeAll([synth, output]);
    },
  };
}

const FACTORIES: Record<InstrumentName, () => Voice> = {
  bumper: createBumper,
  chime: createChime,
  bell: createBell,
  spinner: createSpinner,
  ramp: createRamp,
  funnel: createFunnel,
  seesaw: createSeesaw,
  impact: createImpact,
};

/**
 * Build a pre-wired, un-triggered voice for the named instrument. The graph is
 * constructed and its oscillators started once; the closed envelope keeps it
 * silent until trigger() fires. Pitch is supplied per trigger, not here.
 */
export function createVoice(name: InstrumentName): Voice {
  return FACTORIES[name]();
}
