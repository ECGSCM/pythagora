import * as Tone from 'tone';

// Declarative instrument voices. Each factory reproduces the EXACT node recipe
// of the matching play* method in the old audio module (same oscillator
// types/frequencies/detunings, filters/Q, ADSR values and internal gains) — a
// plumbing refactor, not a re-voicing. The differences are deliberate:
//   * every voice ends in a per-voice `output` Gain (never wired straight to
//     the hardware output) so the bus/mute/echo/reverb chain always applies
//     (A3, A15);
//   * the funnel gains a real amplitude envelope so it no longer hard-cuts (A7);
//   * lifetimes are DERIVED from the envelope, never hand-picked (A6).

export type InstrumentName =
  | 'bumper'
  | 'chime'
  | 'bell'
  | 'spinner'
  | 'ramp'
  | 'funnel'
  | 'seesaw'
  | 'impact';

export interface Voice {
  /** Per-voice output; the VoiceManager connects this to the bus + reverb send. */
  readonly output: Tone.Gain;
  /** Derived total lifetime in ms (attack+decay+duration+release, plus margin). */
  readonly lifetimeMs: number;
  /** Start oscillators/envelopes; velocityGain (0..1) scales the output. */
  trigger(velocityGain: number): void;
  dispose(): void;
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

function stopAll(sources: Array<Tone.Oscillator | Tone.LFO>): void {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // Already stopped / disposed.
    }
  }
}

// ==================== INSTRUMENTS ====================

// bumper — DEEP TEMPLE BELL (audio.ts:1029 playDrumHit)
function createBumper(): Voice {
  const output = new Tone.Gain(1);
  const freq = randomScaleFreq(65.41); // C2 base
  const osc1 = new Tone.Oscillator(freq, 'sine');
  const osc2 = new Tone.Oscillator(freq * 2.02, 'sine');
  const osc3 = new Tone.Oscillator(freq * 3.05, 'triangle');
  const gain = new Tone.Gain(0.6);
  const filter = new Tone.Filter({ frequency: 800, type: 'lowpass', Q: 2 });
  const adsr = { attack: 0.01, decay: 1.0, sustain: 0.2, release: 1.5 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  const oscs = [osc1, osc2, osc3];
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 2),
    trigger(v) {
      output.gain.value = v;
      for (const o of oscs) o.start();
      env.triggerAttackRelease('2s');
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
  const freq = randomScaleFreq(523.25); // C5 base
  const frequencies = [freq, freq * 2.5, freq * 5.1, freq * 8.2, freq * 12.5];
  const masterGain = new Tone.Gain(0.5);
  const filter = new Tone.Filter({ frequency: 12000, type: 'highpass', Q: 0.5 });
  const adsr = { attack: 0.05, decay: 1.5, sustain: 0.2, release: 2.5 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [filter, env, masterGain, output];
  frequencies.forEach((f, i) => {
    const osc = new Tone.Oscillator(f, 'sine');
    const layerGain = new Tone.Gain(0.3 / (i + 1)); // decreasing per harmonic
    osc.connect(layerGain);
    layerGain.connect(filter);
    oscs.push(osc);
    disposables.push(osc, layerGain);
  });

  filter.connect(env);
  env.connect(masterGain);
  masterGain.connect(output);

  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 3),
    trigger(v) {
      output.gain.value = v;
      for (const o of oscs) o.start();
      env.triggerAttackRelease('3s');
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
  const freq = randomScaleFreq(880); // A5 base
  const osc = new Tone.Oscillator(freq, 'sine');
  const filter = new Tone.Filter({ frequency: freq * 1.5, type: 'bandpass', Q: 20 });
  const lfo = new Tone.LFO({ frequency: randomFreq(0.05, 0.2), min: freq * 0.8, max: freq * 2, type: 'sine' });
  const adsr = { attack: 0.001, decay: 2, sustain: 0.1, release: 3 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const gain = new Tone.Gain(0.4);

  lfo.connect(filter.frequency);
  osc.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 4),
    trigger(v) {
      output.gain.value = v;
      lfo.start();
      osc.start();
      env.triggerAttackRelease('4s');
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
  const baseFreq = randomScaleFreq(261.63); // C4 base
  const chordIntervals = [1, 1.25, 1.5, 2];
  const notes = chordIntervals.map((interval) => baseFreq * interval);

  const chorus = new Tone.Chorus({ frequency: 0.1, delayTime: 4, depth: 0.8, wet: 0.6 });
  const adsr = { attack: 0.3, decay: 1, sustain: 0.5, release: 2 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const masterGain = new Tone.Gain(0.3);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [chorus, env, masterGain, output];
  notes.forEach((freq, i) => {
    const fundamental = new Tone.Oscillator(freq, 'sine');
    const harmonic = new Tone.Oscillator(freq * 2.01, 'triangle');
    const noteGain = new Tone.Gain(0.2);
    const filter = new Tone.Filter({ frequency: 3000 + i * 500, type: 'lowpass', Q: 1 });
    fundamental.connect(filter);
    harmonic.connect(filter);
    filter.connect(noteGain); // preserved dead-end from the original recipe
    filter.connect(chorus);
    oscs.push(fundamental, harmonic);
    disposables.push(fundamental, harmonic, noteGain, filter);
  });

  chorus.connect(env);
  env.connect(masterGain);
  masterGain.connect(output);

  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 3),
    trigger(v) {
      output.gain.value = v;
      chorus.start();
      for (const o of oscs) o.start();
      env.triggerAttackRelease('3s');
    },
    dispose() {
      stopAll(oscs);
      disposeAll(disposables);
    },
  };
}

// ramp — SUIKINKUTSU water harp (audio.ts:1304 playRampSlide)
function createRamp(): Voice {
  const output = new Tone.Gain(1);
  const pentatonicScale = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63];
  const baseFreq = pentatonicScale[Math.floor(Math.random() * pentatonicScale.length)];

  const osc = new Tone.Oscillator(baseFreq, 'sine');
  const metalOsc1 = new Tone.Oscillator(baseFreq * 2.002, 'sine');
  const metalOsc2 = new Tone.Oscillator(baseFreq * 3.003, 'sine');
  const metalOsc3 = new Tone.Oscillator(baseFreq * 4.001, 'sine');

  const metalEnv1 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 2.0, sustain: 0.1, release: 4.0 });
  const metalEnv2 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.5, sustain: 0.05, release: 3.0 });
  const metalEnv3 = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 1.0, sustain: 0.03, release: 2.0 });
  const mainEnv = new Tone.AmplitudeEnvelope({ attack: 0.005, decay: 0.3, sustain: 0.05, release: 3.0 });

  const pitchSlide = new Tone.FrequencyEnvelope({
    attack: 0.01,
    decay: 0.2,
    sustain: 0,
    release: 0.5,
    attackCurve: 'exponential',
    releaseCurve: 'exponential',
  });
  const targetFreq = baseFreq * 0.98;
  pitchSlide.connect(osc.frequency);

  const filter = new Tone.Filter({ frequency: 2000, type: 'lowpass', Q: 0.5 });
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
  // Longest-living envelope is metalEnv1 held for 6s.
  const lifetimeMs = Math.max(
    computeVoiceLifetimeMs({ attack: 0.01, decay: 2.0, release: 4.0 }, 6),
    computeVoiceLifetimeMs({ attack: 0.01, decay: 1.5, release: 3.0 }, 5),
    computeVoiceLifetimeMs({ attack: 0.005, decay: 0.3, release: 3.0 }, 3.5)
  );

  return {
    output,
    lifetimeMs,
    trigger(v) {
      output.gain.value = v;
      for (const o of oscs) o.start();
      const now = Tone.now();
      mainEnv.triggerAttackRelease('3.5s', now);
      metalEnv1.triggerAttackRelease('6s', now);
      metalEnv2.triggerAttackRelease('5s', now + 0.05);
      metalEnv3.triggerAttackRelease('4s', now + 0.1);
      pitchSlide.triggerAttackRelease(targetFreq, '0.7s', now);
    },
    dispose() {
      stopAll(oscs);
      disposeAll([
        osc, metalOsc1, metalOsc2, metalOsc3, filter, mainEnv, metalEnv1, metalEnv2, metalEnv3,
        pitchSlide, mainGain, metalGain1, metalGain2, metalGain3, output,
      ]);
    },
  };
}

// funnel — SPIRALING ARPEGGIO (audio.ts:1455 playSpiralEffect)
// A6/A7: the original had NO envelope and was hard-cut after 2s. It now gets a
// swirl-preserving amplitude envelope so the oscillators/pan/delay fade out.
function createFunnel(): Voice {
  const output = new Tone.Gain(1);
  const baseFreq = randomScaleFreq(440); // A4 base
  const ratios = [1, 1.5, 2];
  const masterGain = new Tone.Gain(0.35);
  const adsr = { attack: 0.05, decay: 0.6, sustain: 0.3, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);

  const oscs: Tone.Oscillator[] = [];
  const disposables: Disposable[] = [masterGain, env, output];
  ratios.forEach((ratio, i) => {
    const osc = new Tone.Oscillator(baseFreq * ratio, 'sine');
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

  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 1.2),
    trigger(v) {
      output.gain.value = v;
      for (const o of oscs) o.start();
      env.triggerAttackRelease('1.2s');
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
  const baseFreq = randomScaleFreq(392); // G4 base
  const osc1 = new Tone.Oscillator(baseFreq, 'sine');
  const osc2 = new Tone.Oscillator(baseFreq * 3, 'sine');
  const osc3 = new Tone.Oscillator(baseFreq * 5, 'triangle');
  const adsr = { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.8 };
  const env = new Tone.AmplitudeEnvelope(adsr);
  const filter = new Tone.Filter({ frequency: 5000, type: 'highpass', Q: 2 });
  const gain = new Tone.Gain(0.5);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(env);
  env.connect(gain);
  gain.connect(output);

  const oscs = [osc1, osc2, osc3];
  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs(adsr, 1),
    trigger(v) {
      output.gain.value = v;
      for (const o of oscs) o.start();
      env.triggerAttackRelease('1s');
    },
    dispose() {
      stopAll(oscs);
      disposeAll([osc1, osc2, osc3, filter, env, gain, output]);
    },
  };
}

// impact — the old default collision sound (audio.ts:1573 playDefaultCollision)
function createImpact(): Voice {
  const output = new Tone.Gain(1);
  const freq = randomScaleFreq(528); // C5 base
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.5 },
  });
  synth.connect(output);

  return {
    output,
    lifetimeMs: computeVoiceLifetimeMs({ attack: 0.05, decay: 0.3, release: 0.5 }, 0.8),
    trigger(v) {
      output.gain.value = v;
      synth.triggerAttackRelease(freq, '0.8s');
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

/** Create a fresh, un-triggered voice for the named instrument. */
export function createVoice(name: InstrumentName): Voice {
  return FACTORIES[name]();
}
