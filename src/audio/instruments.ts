import * as Tone from 'tone';
import { BRIGHTNESS_CUTOFF_MUL_MIN, BRIGHTNESS_CUTOFF_MUL_MAX } from './constants';

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

/** Cutoff multiplier for a given brightness (§2.3), lerp(0.6, 1.6, b). */
function brightnessCutoffMul(brightness: number): number {
  return lerp(BRIGHTNESS_CUTOFF_MUL_MIN, BRIGHTNESS_CUTOFF_MUL_MAX, brightness);
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

// Major-pentatonic random pitch across a few octaves — the source of each
// instrument's "different note every hit" character.
function randomScaleFreq(baseFreq: number): number {
  const pentatonicRatios = [1, 1.125, 1.25, 1.5, 1.667];
  const randomRatio = pentatonicRatios[Math.floor(Math.random() * pentatonicRatios.length)];
  const randomOctave = Math.pow(2, Math.floor(Math.random() * 4) - 1); // -1..+2 octaves
  return baseFreq * randomRatio * randomOctave;
}

/**
 * Build the per-collision pitch context for the current key (§2.2). Same
 * pentatonic ratios/octave spread as before, transposed by `keyRatio` (the
 * ratio of the current circle-of-fifths root to C4).
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
function createBumper(): Voice {
  const output = new Tone.Gain(1);
  const osc1 = new Tone.Oscillator(65.41, 'sine'); // C2 base, retuned per trigger
  const osc2 = new Tone.Oscillator(65.41 * 2.02, 'sine');
  const osc3 = new Tone.Oscillator(65.41 * 3.05, 'triangle');
  const gain = new Tone.Gain(0.6);
  const filterHz = 800;
  const filter = new Tone.Filter({ frequency: filterHz, type: 'lowpass', Q: 2 });
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
      const freq = pitch.scaleFreq(65.41);
      setParam(osc1.frequency, freq, t);
      setParam(osc2.frequency, freq * 2.02, t);
      setParam(osc3.frequency, freq * 3.05, t);
      setParam(output.gain, v, t);
      setParam(filter.frequency, filterHz * brightnessCutoffMul(brightness), t);
      env.triggerAttackRelease('2s', t);
    },
    dispose() {
      stopAll(oscs);
      disposeAll([osc1, osc2, osc3, filter, env, gain, output]);
    },
  };
}

// chime — HEAVENLY HARP (audio.ts:1091 playChimeHit)
function createChime(): Voice {
  const output = new Tone.Gain(1);
  const harmonicRatios = [1, 2.5, 5.1, 8.2, 12.5];
  const masterGain = new Tone.Gain(0.5);
  const filterHz = 12000;
  const filter = new Tone.Filter({ frequency: filterHz, type: 'highpass', Q: 0.5 });
  const adsr = { attack: 0.05, decay: 1.5, sustain: 0.2, release: 2.5 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [filter, env, masterGain, output];
  harmonicRatios.forEach((ratio, i) => {
    const osc = new Tone.Oscillator(523.25 * ratio, 'sine'); // C5 base, retuned per trigger
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
      const freq = pitch.scaleFreq(523.25);
      oscs.forEach((o, i) => setParam(o.frequency, freq * harmonicRatios[i], t));
      setParam(output.gain, v, t);
      setParam(filter.frequency, filterHz * brightnessCutoffMul(brightness), t);
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
  const output = new Tone.Gain(1);
  const osc = new Tone.Oscillator(880, 'sine'); // A5 base, retuned per trigger
  const filter = new Tone.Filter({ frequency: 880 * 1.5, type: 'bandpass', Q: 20 });
  // LFO sweeps the bandpass; its rate + range are re-randomized/retuned per
  // trigger to keep the original "different shimmer every hit" character now
  // that a pooled voice outlives a single hit.
  const lfo = new Tone.LFO({ frequency: 0.1, min: 880 * 0.8, max: 880 * 2, type: 'sine' });
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
      const freq = pitch.scaleFreq(880);
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
  const output = new Tone.Gain(1);
  const chordIntervals = [1, 1.25, 1.5, 2];

  const chorus = new Tone.Chorus({ frequency: 0.1, delayTime: 4, depth: 0.8, wet: 0.6 });
  const adsr = { attack: 0.3, decay: 1, sustain: 0.5, release: 2 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const masterGain = new Tone.Gain(0.3);

  const oscs: Tone.Oscillator[] = [];
  // Per-note fundamental+harmonic pair so trigger() can retune the whole chord.
  const noteOscs: { fundamental: Tone.Oscillator; harmonic: Tone.Oscillator }[] = [];
  const filters: { filter: Tone.Filter; baseHz: number }[] = [];
  const disposables: Disposable[] = [chorus, env, masterGain, output];
  chordIntervals.forEach((interval, i) => {
    const freq = 261.63 * interval; // C4 base, retuned per trigger
    const fundamental = new Tone.Oscillator(freq, 'sine');
    const harmonic = new Tone.Oscillator(freq * 2.01, 'triangle');
    const noteGain = new Tone.Gain(0.2);
    const filterHz = 3000 + i * 500;
    const filter = new Tone.Filter({ frequency: filterHz, type: 'lowpass', Q: 1 });
    fundamental.connect(filter);
    harmonic.connect(filter);
    filter.connect(noteGain); // preserved dead-end from the original recipe
    filter.connect(chorus);
    oscs.push(fundamental, harmonic);
    noteOscs.push({ fundamental, harmonic });
    filters.push({ filter, baseHz: filterHz });
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
      const baseFreq = pitch.scaleFreq(261.63);
      noteOscs.forEach(({ fundamental, harmonic }, i) => {
        const freq = baseFreq * chordIntervals[i];
        setParam(fundamental.frequency, freq, t);
        setParam(harmonic.frequency, freq * 2.01, t);
      });
      setParam(output.gain, v, t);
      const mul = brightnessCutoffMul(brightness);
      for (const { filter, baseHz } of filters) setParam(filter.frequency, baseHz * mul, t);
      env.triggerAttackRelease('3s', t);
    },
    dispose() {
      stopAll([...oscs, chorus]);
      disposeAll(disposables);
    },
  };
}

// ramp — SUIKINKUTSU water harp (audio.ts:1304 playRampSlide)
function createRamp(): Voice {
  const output = new Tone.Gain(1);
  // Ramp keeps its own tight low-octave scale (character); each trigger picks a
  // random step and transposes it by the raw keyRatio (not scaleFreq's wide
  // octave spread). The per-hit random pentatonic choice now lives in trigger().
  const pentatonicScale = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63];

  const osc = new Tone.Oscillator(pentatonicScale[0], 'sine');
  const metalOsc1 = new Tone.Oscillator(pentatonicScale[0] * 2.002, 'sine');
  const metalOsc2 = new Tone.Oscillator(pentatonicScale[0] * 3.003, 'sine');
  const metalOsc3 = new Tone.Oscillator(pentatonicScale[0] * 4.001, 'sine');

  const metalEnv1 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 2.0, sustain: 0.1, release: 4.0 });
  const metalEnv2 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.5, sustain: 0.05, release: 3.0 });
  const metalEnv3 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.0, sustain: 0.03, release: 2.0 });
  const mainEnv = new Tone.AmplitudeEnvelope({ attack: 0.005, decay: 0.3, sustain: 0.05, release: 3.0 });

  const filterHz = 2000;
  const filter = new Tone.Filter({ frequency: filterHz, type: 'lowpass', Q: 0.5 });
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
      setParam(filter.frequency, filterHz * brightnessCutoffMul(brightness), t);
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
  const output = new Tone.Gain(1);
  const ratios = [1, 1.5, 2];
  const masterGain = new Tone.Gain(0.35);
  const adsr = { attack: 0.05, decay: 0.6, sustain: 0.3, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [masterGain, env, output];
  ratios.forEach((ratio, i) => {
    const osc = new Tone.Oscillator(440 * ratio, 'sine'); // A4 base, retuned per trigger
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
      const baseFreq = pitch.scaleFreq(440);
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
function createSeesaw(): Voice {
  const output = new Tone.Gain(1);
  const osc1 = new Tone.Oscillator(392, 'sine'); // G4 base, retuned per trigger
  const osc2 = new Tone.Oscillator(392 * 3, 'sine');
  const osc3 = new Tone.Oscillator(392 * 5, 'triangle');
  const adsr = { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const filterHz = 5000;
  const filter = new Tone.Filter({ frequency: filterHz, type: 'highpass', Q: 2 });
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
      const baseFreq = pitch.scaleFreq(392);
      setParam(osc1.frequency, baseFreq, t);
      setParam(osc2.frequency, baseFreq * 3, t);
      setParam(osc3.frequency, baseFreq * 5, t);
      setParam(output.gain, v, t);
      setParam(filter.frequency, filterHz * brightnessCutoffMul(brightness), t);
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
      const freq = pitch.scaleFreq(528); // C5 base
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
