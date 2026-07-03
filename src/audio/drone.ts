import * as Tone from 'tone';
import type { InstrumentName } from './instruments';
import {
  BINAURAL_FADE_SEC,
  BINAURAL_LEFT_HZ,
  BINAURAL_LEVEL_DB,
  BINAURAL_RIGHT_HZ,
  DRONE_AIR_FREQS,
  DRONE_AIR_LEVEL_DB,
  DRONE_AIR_LFO_HZ,
  DRONE_COLLISION_ATTACK_SEC,
  DRONE_COLLISION_BOOST_DB,
  DRONE_COLLISION_DECAY_SEC,
  DRONE_FADE_IN_SEC,
  DRONE_GROUND_FREQS,
  DRONE_GROUND_LEVEL_DB,
  DRONE_GROUND_LFO_HZ,
  DRONE_KEY_CROSSFADE_SEC,
  DRONE_LFO_DEPTH_DB,
  DRONE_PAD_FILTER_LFO_MAX_HZ,
  DRONE_PAD_FILTER_LFO_MIN_HZ,
  DRONE_PAD_FREQS,
  DRONE_PAD_LEVEL_DB,
  DRONE_PAD_LFO_HZ,
  DRONE_REVERB_SEND,
  DRONE_SHIMMER_FADE_SEC,
  DRONE_SHIMMER_FREQS,
  DRONE_SHIMMER_LEVEL_DB,
  DRONE_SHIMMER_LFO_HZ,
  DRONE_SILENCE_CHECK_MS,
  DRONE_SILENCE_DUCK_DB,
  DRONE_SILENCE_MS,
  DRONE_SILENCE_RAMP_SEC,
  DRONE_SILENCE_RESTORE_SEC,
} from './constants';

/** The three tonal drone layers (§2.1). */
export type DroneLayerName = 'ground' | 'pad' | 'air';

/**
 * Pure register mapping (§2.1): which drone layer a collision instrument
 * boosts. Exported and unit-tested independently of Tone.js.
 */
export function layerForInstrument(name: InstrumentName): DroneLayerName {
  switch (name) {
    case 'bumper':
    case 'seesaw':
      return 'ground';
    case 'ramp':
    case 'funnel':
    case 'spinner':
      return 'pad';
    case 'chime':
    case 'bell':
    case 'impact':
      return 'air';
  }
}

/** Minimal bus surface the drone needs (input + reverb aux send). */
export interface DroneBus {
  readonly input: Tone.Gain;
  readonly reverbSend: Tone.Gain;
}

type Disposable = { dispose(): void };
type Source = Tone.Oscillator | Tone.LFO;

interface TonalLayer {
  name: DroneLayerName | 'shimmer';
  oscillators: Tone.Oscillator[];
  /** LFO-driven level (breathing); its `gain` sits at [dbToGain(level±depth)]. */
  levelGain: Tone.Gain;
  lfo: Tone.LFO;
  /** Dynamic multiplier: fade-in, collision boost, silence duck. Starts at 0. */
  dynGain: Tone.Gain;
  filter?: Tone.Filter;
  filterLfo?: Tone.LFO;
  /** Pad only — base (C-key) frequencies for setKey() transposition. */
  padBaseFreqs?: number[];
  canDuck: boolean;
  fadesInOnStart: boolean;
  ducked: boolean;
}

interface TonalLayerConfig {
  name: DroneLayerName | 'shimmer';
  freqs: number[];
  oscType: Tone.ToneOscillatorType;
  levelDb: number;
  lfoHz: number;
  canDuck: boolean;
  fadesInOnStart: boolean;
  filter?: { lfoHz: number; minHz: number; maxHz: number };
  padBaseFreqs?: number[];
}

/**
 * The always-on ambient "field" (§2.1). Three tonal layers (Ground / Pad /
 * Air) plus an optional shimmer layer and binaural drift, all routed through
 * the shared bus so mute / echo / master / reverb always apply. Every audible
 * change is a ramp — no instant parameter jumps.
 *
 * Node graph per tonal layer:
 *   oscillators ─▶ [filter] ─▶ levelGain(LFO) ─▶ dynGain ─┬─▶ bus.input
 *                                                          └─▶ sendGain ─▶ bus.reverbSend
 */
export class AmbientDrone {
  private readonly bus: DroneBus;

  private readonly ground: TonalLayer;
  private readonly pad: TonalLayer;
  private readonly air: TonalLayer;
  private readonly shimmer: TonalLayer;
  private readonly tonalLayers: TonalLayer[];
  private readonly layerByName: Record<DroneLayerName, TonalLayer>;

  private readonly binauralGain: Tone.Gain;
  private readonly binauralLevel: number;

  private readonly boostGain: number;
  private readonly duckGain: number;

  // Every node (for dispose) and every startable source (for start/stop).
  private readonly nodes: Disposable[] = [];
  private readonly sources: Source[] = [];

  private started = false;
  // Once disposed the nodes are dead; a late start() (e.g. from a resume that
  // resolved after dispose()) must not re-run and leak a new silence interval.
  private disposed = false;
  private shimmerActive = false;
  private binauralActive = false;
  private lastCollisionMs = 0;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(bus: DroneBus) {
    this.bus = bus;
    this.boostGain = Tone.dbToGain(DRONE_COLLISION_BOOST_DB);
    this.duckGain = Tone.dbToGain(DRONE_SILENCE_DUCK_DB);
    this.binauralLevel = Tone.dbToGain(BINAURAL_LEVEL_DB);

    this.ground = this.buildTonalLayer({
      name: 'ground',
      freqs: DRONE_GROUND_FREQS,
      oscType: 'sine',
      levelDb: DRONE_GROUND_LEVEL_DB,
      lfoHz: DRONE_GROUND_LFO_HZ,
      canDuck: true,
      fadesInOnStart: true,
    });
    this.pad = this.buildTonalLayer({
      name: 'pad',
      freqs: DRONE_PAD_FREQS,
      oscType: 'triangle',
      levelDb: DRONE_PAD_LEVEL_DB,
      lfoHz: DRONE_PAD_LFO_HZ,
      canDuck: true,
      fadesInOnStart: true,
      filter: {
        lfoHz: DRONE_PAD_LFO_HZ,
        minHz: DRONE_PAD_FILTER_LFO_MIN_HZ,
        maxHz: DRONE_PAD_FILTER_LFO_MAX_HZ,
      },
      padBaseFreqs: [...DRONE_PAD_FREQS],
    });
    this.air = this.buildTonalLayer({
      name: 'air',
      freqs: DRONE_AIR_FREQS,
      oscType: 'sine',
      levelDb: DRONE_AIR_LEVEL_DB,
      lfoHz: DRONE_AIR_LFO_HZ,
      canDuck: false,
      fadesInOnStart: true,
    });
    this.shimmer = this.buildTonalLayer({
      name: 'shimmer',
      freqs: DRONE_SHIMMER_FREQS,
      oscType: 'sine',
      levelDb: DRONE_SHIMMER_LEVEL_DB,
      lfoHz: DRONE_SHIMMER_LFO_HZ,
      canDuck: false,
      fadesInOnStart: false, // gated by setShimmer(), not the start() fade-in
    });

    this.tonalLayers = [this.ground, this.pad, this.air, this.shimmer];
    this.layerByName = { ground: this.ground, pad: this.pad, air: this.air };

    // Binaural drift (§2.5): L/R detuned sines through hard-panned nodes,
    // summed into a level gain that stays silent until setBinaural(true).
    this.binauralGain = new Tone.Gain(0);
    this.binauralGain.connect(this.bus.input);
    this.nodes.push(this.binauralGain);
    const oscL = new Tone.Oscillator(BINAURAL_LEFT_HZ, 'sine');
    const oscR = new Tone.Oscillator(BINAURAL_RIGHT_HZ, 'sine');
    const panL = new Tone.Panner(-1);
    const panR = new Tone.Panner(1);
    oscL.connect(panL);
    oscR.connect(panR);
    panL.connect(this.binauralGain);
    panR.connect(this.binauralGain);
    this.sources.push(oscL, oscR);
    this.nodes.push(oscL, oscR, panL, panR);
  }

  private buildTonalLayer(config: TonalLayerConfig): TonalLayer {
    // Level gain base is 0 and the LFO drives it into [dbToGain(level-depth),
    // dbToGain(level)]. Keeping the base at 0 makes the result identical under
    // both additive and override param-connection semantics.
    const levelGain = new Tone.Gain(0);
    const lfo = new Tone.LFO({
      frequency: config.lfoHz,
      min: Tone.dbToGain(config.levelDb - DRONE_LFO_DEPTH_DB),
      max: Tone.dbToGain(config.levelDb),
      type: 'sine',
    });
    lfo.connect(levelGain.gain);

    const dynGain = new Tone.Gain(0);
    const sendGain = new Tone.Gain(DRONE_REVERB_SEND);

    let filter: Tone.Filter | undefined;
    let filterLfo: Tone.LFO | undefined;
    if (config.filter) {
      // Base frequency 0 for the same both-semantics reason as the level gain.
      filter = new Tone.Filter({ frequency: 0, type: 'lowpass', Q: 1 });
      filterLfo = new Tone.LFO({
        frequency: config.filter.lfoHz,
        min: config.filter.minHz,
        max: config.filter.maxHz,
        type: 'sine',
      });
      filterLfo.connect(filter.frequency);
    }

    const oscillators = config.freqs.map((f) => new Tone.Oscillator(f, config.oscType));
    for (const osc of oscillators) osc.connect(filter ?? levelGain);
    filter?.connect(levelGain);
    levelGain.connect(dynGain);
    dynGain.connect(this.bus.input);
    dynGain.connect(sendGain);
    sendGain.connect(this.bus.reverbSend);

    this.sources.push(...oscillators, lfo);
    this.nodes.push(...oscillators, lfo, levelGain, dynGain, sendGain);
    if (filter) this.nodes.push(filter);
    if (filterLfo) {
      this.sources.push(filterLfo);
      this.nodes.push(filterLfo);
    }

    return {
      name: config.name,
      oscillators,
      levelGain,
      lfo,
      dynGain,
      filter,
      filterLfo,
      padBaseFreqs: config.padBaseFreqs,
      canDuck: config.canDuck,
      fadesInOnStart: config.fadesInOnStart,
      ducked: false,
    };
  }

  /**
   * Begin sounding: start all sources and fade the main layers in over 8s.
   * Must only be called with the audio context running; idempotent (guarded
   * against double-start).
   */
  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.lastCollisionMs = Date.now();

    for (const source of this.sources) {
      try {
        source.start();
      } catch {
        // Already started / disposed — non-fatal.
      }
    }

    for (const layer of this.tonalLayers) {
      if (layer.fadesInOnStart) layer.dynGain.gain.rampTo(1, DRONE_FADE_IN_SEC);
    }

    this.silenceTimer = setInterval(() => this.checkSilence(), DRONE_SILENCE_CHECK_MS);
  }

  /**
   * "The field responds" (§2.1): boost the matching layer and un-duck the rest
   * if The Silence had set in.
   */
  onCollision(instrument: InstrumentName): void {
    this.lastCollisionMs = Date.now();
    if (!this.started) return;

    const target = layerForInstrument(instrument);
    for (const layer of this.tonalLayers) {
      if (!layer.canDuck || layer.name === target) continue;
      if (layer.ducked) {
        layer.ducked = false;
        layer.dynGain.gain.rampTo(1, DRONE_SILENCE_RESTORE_SEC);
      }
    }
    this.boostLayer(this.layerByName[target]);
  }

  private boostLayer(layer: TonalLayer): void {
    layer.ducked = false;
    const now = Tone.now();
    const g = layer.dynGain.gain;
    g.rampTo(this.boostGain, DRONE_COLLISION_ATTACK_SEC, now);
    g.rampTo(1, DRONE_COLLISION_DECAY_SEC, now + DRONE_COLLISION_ATTACK_SEC);
  }

  private checkSilence(): void {
    if (!this.started) return;
    if (Date.now() - this.lastCollisionMs <= DRONE_SILENCE_MS) return;
    for (const layer of this.tonalLayers) {
      if (layer.canDuck && !layer.ducked) {
        layer.ducked = true;
        layer.dynGain.gain.rampTo(this.duckGain, DRONE_SILENCE_RAMP_SEC);
      }
    }
  }

  /**
   * Crossfade the Pad layer to the current harmony key (§2.2). `rootFreqRatio`
   * is the current key root relative to C.
   */
  setKey(rootFreqRatio: number): void {
    const base = this.pad.padBaseFreqs;
    if (!base) return;
    this.pad.oscillators.forEach((osc, i) => {
      osc.frequency.rampTo(base[i] * rootFreqRatio, DRONE_KEY_CROSSFADE_SEC);
    });
  }

  /** Fade the shimmer layer in/out over 2s (driven by combo ≥ 10). */
  setShimmer(active: boolean): void {
    if (active === this.shimmerActive) return;
    this.shimmerActive = active;
    this.shimmer.dynGain.gain.rampTo(active ? 1 : 0, DRONE_SHIMMER_FADE_SEC);
  }

  /** Fade the binaural drift in/out over 1s (§2.5). */
  setBinaural(active: boolean): void {
    if (active === this.binauralActive) return;
    this.binauralActive = active;
    this.binauralGain.gain.rampTo(active ? this.binauralLevel : 0, BINAURAL_FADE_SEC);
  }

  dispose(): void {
    this.disposed = true;
    this.started = false;
    if (this.silenceTimer !== null) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped / disposed.
      }
    }
    for (const node of this.nodes) {
      try {
        node.dispose();
      } catch {
        // Non-fatal during teardown.
      }
    }
  }
}
