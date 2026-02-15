import * as Tone from 'tone';
import { PatchNode } from '../types/db.types';
import { CollisionEvent } from './physics';

export interface AudioConnection {
  from: string;
  to: string;
  param?: string;
}

// Type definitions for audio nodes
type AudioNode = Tone.Oscillator | Tone.Noise | Tone.Filter | Tone.LFO |
  Tone.Reverb | Tone.Delay | Tone.BitCrusher | Tone.Chorus |
  Tone.Volume | Tone.Gain | Tone.Synth | Tone.PolySynth | Tone.MetalSynth |
  Tone.AmplitudeEnvelope | Tone.FrequencyEnvelope | Tone.PingPongDelay;

interface NodeParameter {
  value?: number;
  set?(value: number): void;
}

// Type for nodes with dynamic parameters
type NodeWithParameters = AudioNode & Record<string, NodeParameter | undefined>;

// Proper type for Tone.js audio nodes with parameters
type ToneAudioNodeWithParams = Tone.ToneAudioNode & {
  [key: string]: NodeParameter | Tone.ToneAudioNode | undefined;
};

// Track temporary nodes for cleanup
interface TemporaryNodes {
  nodes: AudioNode[];
  timeoutId: NodeJS.Timeout | null;
}

// Echo Mode System
type EchoMode = 'off' | 'short' | 'long';

interface EchoConfig {
  delayTime: number;
  feedback: number;
  wet: number;
}

// Harmonic Resonance Chain System
interface CollisionRecord {
  nodeId: string;
  timestamp: number;
  frequency: number;
}

interface HarmonyNote {
  root: number; // Root frequency
  third: number; // Major third
  fifth: number; // Perfect fifth
}

// Circle of Fifths progression (chromatic scale ascending in perfect fifths)
const CIRCLE_OF_FIFTHS = [
  261.63, // C4
  392.00, // G4
  293.66, // D4
  440.00, // A4
  329.63, // E4
  493.88, // B4
  369.99, // F#4
  554.37, // C#5
  415.30, // G#4
  622.25, // D#5
  466.16, // A#4
  349.23, // F4
  261.63  // Back to C4
];

export class AudioEngine {
  private nodes: Map<string, AudioNode> = new Map();
  private connections: AudioConnection[] = [];
  private isStarted = false;
  private masterVolume: Tone.Volume;
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;
  private ambientReverb: Tone.Reverb;
  private ambientChorus: Tone.Chorus;
  private glitchProcessor: Tone.BitCrusher;
  private granularDelay: Tone.PingPongDelay;
  private temporaryNodes: Map<string, TemporaryNodes> = new Map();

  // Echo Mode System
  private echoMode: EchoMode = 'off';
  private echoDelay: Tone.FeedbackDelay;
  private echoConfigs: Record<EchoMode, EchoConfig> = {
    off: { delayTime: 0, feedback: 0, wet: 0 },
    short: { delayTime: 0.2, feedback: 0.3, wet: 0.25 },  // 200ms delay
    long: { delayTime: 0.8, feedback: 0.6, wet: 0.4 }     // 800ms delay
  };

  // Harmonic Resonance Chain System
  private collisionHistory: CollisionRecord[] = [];
  private harmonyIndex = 0; // Current position in Circle of Fifths
  private readonly maxHistoryLength = 10;

  // Reverb Tail System
  private masterReverb: Tone.Reverb;
  private reverbAccumulation = 0; // 0-1, increases with each collision
  private lastCollisionTime = 0;
  private silenceThreshold = 3000; // ms of no collision = "silence moment"
  private baseReverbDecay = 12; // Default reverb decay in seconds
  private dynamicReverbDecay = 12; // Current reverb decay (adjusts dynamically)

  // Performance Optimization: Voice Pool System
  private voicePool: Array<{
    osc: Tone.Oscillator;
    env: Tone.AmplitudeEnvelope;
    gain: Tone.Gain;
    inUse: boolean;
  }> = [];
  private readonly maxVoices = 16; // Maximum simultaneous sounds
  private activeVoiceCount = 0;

  constructor() {
    try {
      // Initialize saturation prevention chain FIRST
      // Chain: [Sources] → [Compressor] → [Limiter] → [Volume] → [Destination]

      // Master Compressor - prevents audio buildup
      this.masterCompressor = new Tone.Compressor({
        threshold: -16,  // Start compressing at -16dB
        ratio: 8,        // 8:1 ratio (aggressive)
        attack: 0.005,   // 5ms attack (fast response)
        release: 0.25    // 250ms release (natural decay)
      });

      // Limiter - absolute ceiling, prevents clipping
      this.masterLimiter = new Tone.Limiter(-3); // Never exceed -3dB

      // Master Volume - final output control
      this.masterVolume = new Tone.Volume(-12); // -12dB default for safety

      // Connect the chain
      this.masterCompressor.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterVolume);
      this.masterVolume.toDestination();

      // Initialize master reverb for spatial tail accumulation (connects to compressor)
      this.masterReverb = new Tone.Reverb({
        decay: this.baseReverbDecay,
        wet: 0.3
      }).connect(this.masterCompressor);

      // Initialize ambient effects chain (connects to master reverb)
      this.ambientReverb = new Tone.Reverb({
        decay: 8,
        wet: 0.4
      }).connect(this.masterReverb);

      this.ambientChorus = new Tone.Chorus({
        frequency: 0.2,
        delayTime: 2.5,
        depth: 0.7,
        wet: 0.3
      }).connect(this.ambientReverb);

      this.glitchProcessor = new Tone.BitCrusher(8).connect(this.ambientChorus);

      this.granularDelay = new Tone.PingPongDelay({
        delayTime: '8n',
        feedback: 0.6,
        wet: 0.2
      }).connect(this.glitchProcessor);

      // Initialize echo delay for echo modes
      this.echoDelay = new Tone.FeedbackDelay({
        delayTime: this.echoConfigs.off.delayTime,
        feedback: this.echoConfigs.off.feedback,
        wet: this.echoConfigs.off.wet
      }).connect(this.masterCompressor);

      // Performance: Initialize voice pool for reusing oscillators
      this.initializeVoicePool();

      // Start reverb decay monitoring loop
      this.startReverbMonitoring();
    } catch (error) {
      throw new Error(`Failed to initialize AudioEngine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==================== PERFORMANCE OPTIMIZATION ====================

  /**
   * Initialize voice pool for reusing oscillators
   * Pre-allocates oscillators to avoid garbage collection during playback
   */
  private initializeVoicePool(): void {
    for (let i = 0; i < this.maxVoices; i++) {
      const osc = new Tone.Oscillator({
        type: 'sine',
        volume: -12
      });

      const env = new Tone.AmplitudeEnvelope({
        attack: 0.05,
        decay: 0.3,
        sustain: 0.4,
        release: 1.0
      });

      const gain = new Tone.Gain(-12);

      osc.connect(env);
      env.connect(gain);
      gain.connect(this.ambientReverb);

      osc.start();

      this.voicePool.push({
        osc,
        env,
        gain,
        inUse: false
      });
    }
  }

  /**
   * Get a voice from the pool, or reuse oldest if all are in use
   */
  private getVoiceFromPool(): {
    osc: Tone.Oscillator;
    env: Tone.AmplitudeEnvelope;
    gain: Tone.Gain;
  } | null {
    // Find an available voice
    const availableVoice = this.voicePool.find(v => !v.inUse);

    if (availableVoice) {
      availableVoice.inUse = true;
      this.activeVoiceCount++;
      return {
        osc: availableVoice.osc,
        env: availableVoice.env,
        gain: availableVoice.gain
      };
    }

    // All voices in use, find oldest (simple round-robin)
    const reuseIndex = this.activeVoiceCount % this.maxVoices;
    const voiceToReuse = this.voicePool[reuseIndex];

    // Quick fade out the old sound using triggerRelease
    try {
      voiceToReuse.env.triggerRelease();
      voiceToReuse.osc.frequency.setValueAtTime(voiceToReuse.osc.frequency.value, Tone.now());
    } catch {
      // Ignore errors during reuse
    }

    return {
      osc: voiceToReuse.osc,
      env: voiceToReuse.env,
      gain: voiceToReuse.gain
    };
  }

  /**
   * Return a voice to the pool after use
   */
  private returnVoiceToPool(voiceIndex: number): void {
    if (voiceIndex >= 0 && voiceIndex < this.voicePool.length) {
      this.voicePool[voiceIndex].inUse = false;
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
    }
  }

  // ==================== ECHO MODE SYSTEM ====================

  /**
   * Set the echo mode (off, short, or long)
   * Short: 200ms delay with subtle feedback for quick rhythmic echoes
   * Long: 800ms delay with rich feedback for atmospheric depth
   */
  setEchoMode(mode: EchoMode): void {
    this.echoMode = mode;
    const config = this.echoConfigs[mode];

    try {
      this.echoDelay.delayTime.value = config.delayTime;
      this.echoDelay.feedback.value = config.feedback;
      this.echoDelay.wet.value = config.wet;
    } catch (e) {
      console.error('Failed to set echo mode:', e);
    }
  }

  /**
   * Get current echo mode
   */
  getEchoMode(): EchoMode {
    return this.echoMode;
  }

  /**
   * Cycle through echo modes: off → short → long → off
   */
  cycleEchoMode(): EchoMode {
    const modes: EchoMode[] = ['off', 'short', 'long'];
    const currentIndex = modes.indexOf(this.echoMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    this.setEchoMode(nextMode);
    return nextMode;
  }

  // ==================== HARMONIC RESONANCE CHAIN ====================

  /**
   * Calculate harmony notes (major triad) from root frequency
   * Root, Major Third (5/4 ratio), Perfect Fifth (3/2 ratio)
   */
  private calculateHarmony(rootFreq: number): HarmonyNote {
    return {
      root: rootFreq,
      third: rootFreq * 1.25, // Major third (5/4)
      fifth: rootFreq * 1.5     // Perfect fifth (3/2)
    };
  }

  /**
   * Get the next harmony in the Circle of Fifths progression
   */
  private getNextHarmony(): HarmonyNote {
    const rootFreq = CIRCLE_OF_FIFTHS[this.harmonyIndex];
    this.harmonyIndex = (this.harmonyIndex + 1) % CIRCLE_OF_FIFTHS.length;
    return this.calculateHarmony(rootFreq);
  }

  /**
   * Play harmonic chord instead of single note
   * Creates rich, layered sound with root, third, and fifth
   * PERFORMANCE: Uses voice pool to avoid creating new oscillators
   */
  private playHarmonicChord(harmony: HarmonyNote, duration: number = 1.5): void {
    const now = Tone.now();
    const notes = [harmony.root, harmony.third, harmony.fifth];
    const usedVoices: number[] = [];

    notes.forEach((freq, index) => {
      // Get voice from pool
      const voice = this.getVoiceFromPool();
      if (!voice) return; // Skip if no voice available

      // Find voice index in pool for later return
      const voiceIndex = this.voicePool.findIndex(v => v.osc === voice.osc);
      if (voiceIndex >= 0) usedVoices.push(voiceIndex);

      // Set frequency and trigger
      try {
        voice.osc.frequency.setValueAtTime(freq, now);
        voice.gain.gain.setValueAtTime(index === 0 ? -6 : -9, now);
        voice.env.triggerAttackRelease(duration, now);
      } catch (e) {
        // Ignore errors during voice reuse
      }
    });

    // Return voices to pool after sound completes
    const returnTime = (duration + 0.5) * 1000;
    setTimeout(() => {
      usedVoices.forEach(index => this.returnVoiceToPool(index));
    }, returnTime);
  }

  /**
   * Record collision and advance harmony progression
   */
  private advanceHarmony(nodeId: string): void {
    const record: CollisionRecord = {
      nodeId,
      timestamp: Date.now(),
      frequency: CIRCLE_OF_FIFTHS[this.harmonyIndex]
    };

    this.collisionHistory.push(record);

    // Keep only recent history
    if (this.collisionHistory.length > this.maxHistoryLength) {
      this.collisionHistory.shift();
    }

    // Get next harmony in Circle of Fifths
    const nextHarmony = this.getNextHarmony();

    // Play harmonic chord
    this.playHarmonicChord(nextHarmony, 1.5);
  }

  /**
   * Get collision history for pattern recognition
   */
  getCollisionHistory(): CollisionRecord[] {
    return [...this.collisionHistory];
  }

  /**
   * Reset harmonic progression to beginning
   */
  resetHarmony(): void {
    this.harmonyIndex = 0;
    this.collisionHistory = [];
  }

  // ==================== REVERB TAIL SYSTEM ====================

  /**
   * Start the reverb decay monitoring loop
   * Runs every 100ms to adjust reverb based on activity
   */
  private startReverbMonitoring(): void {
    setInterval(() => {
      const timeSinceLastCollision = Date.now() - this.lastCollisionTime;

      if (timeSinceLastCollision > this.silenceThreshold) {
        // Silence moment detected - gradually fade reverb for "clean" feeling
        this.dynamicReverbDecay = Math.max(2, this.dynamicReverbDecay * 0.95);
        this.reverbAccumulation = Math.max(0, this.reverbAccumulation - 0.02);
      } else {
        // Activity detected - maintain or increase reverb accumulation
        this.reverbAccumulation = Math.min(1, this.reverbAccumulation + 0.05);
      }

      // Smoothly adjust reverb decay based on accumulation
      const targetDecay = 2 + (this.reverbAccumulation * 18); // 2-20 seconds range
      this.dynamicReverbDecay += (targetDecay - this.dynamicReverbDecay) * 0.1;

      // Apply new decay value to master reverb
      if (this.masterReverb && Tone.context.state === 'running') {
        this.masterReverb.decay = this.dynamicReverbDecay;
        // Also adjust wet level based on accumulation
        this.masterReverb.wet.value = 0.2 + (this.reverbAccumulation * 0.3); // 0.2-0.5 range
      }
    }, 100);
  }

  /**
   * Enhance reverb on collision - called from triggerCollision
   * Increases reverb accumulation and updates last collision time
   */
  private enhanceReverbOnCollision(velocity: number): void {
    this.lastCollisionTime = Date.now();

    // Velocity-based enhancement (higher velocity = more reverb)
    const velocityFactor = Math.min(1, velocity / 10);
    const enhancement = 0.1 * velocityFactor;

    this.reverbAccumulation = Math.min(1, this.reverbAccumulation + enhancement);
  }

  /**
   * Get current reverb status for monitoring/debugging
   */
  getReverbStatus(): {
    accumulation: number;
    dynamicDecay: number;
    timeSinceLastCollision: number;
  } {
    return {
      accumulation: this.reverbAccumulation,
      dynamicDecay: this.dynamicReverbDecay,
      timeSinceLastCollision: Date.now() - this.lastCollisionTime
    };
  }

  /**
   * Reset reverb accumulation (e.g., on new session)
   */
  resetReverb(): void {
    this.reverbAccumulation = 0;
    this.dynamicReverbDecay = this.baseReverbDecay;
    this.lastCollisionTime = 0;
  }

  async start(): Promise<void> {
    if (this.isStarted) return;

    try {
      await Tone.start();
      this.isStarted = true;
    } catch (error) {
      throw new Error(`Failed to start AudioEngine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  createNode(patchNode: PatchNode): AudioNode | null {
    let audioNode: AudioNode;

    try {
      switch (patchNode.type) {
        // New Pythagora Switch Modules
        case 'ramp':
          // Ramp creates a sliding sound effect
          audioNode = this.createRampNode();
          break;

        case 'bumper':
          // Drum-like percussion sound
          audioNode = this.createDrumSound();
          break;

        case 'chime':
          // Bell-like melodic sound
          audioNode = this.createChimeSound();
          break;

        case 'spinner':
          // Rotating melody wheel
          audioNode = this.createSpinnerSound();
          break;

        case 'funnel':
          // Spiral sound effect
          audioNode = this.createSpiralEffect();
          break;

        case 'seesaw':
          // Balance-triggered sound
          audioNode = this.createSeesawSound();
          break;

        case 'bell':
          // Harmonic bell sound
          audioNode = this.createBellSound();
          break;

        // Original synth modules
        case 'osc':
          const solfeggioFreqs = [396, 417, 528, 639];
          const defaultFreq = solfeggioFreqs[Math.floor(Math.random() * solfeggioFreqs.length)];

          audioNode = new Tone.Oscillator({
            frequency: patchNode.params.frequency || defaultFreq,
            type: patchNode.params.waveform || 'triangle',
            volume: patchNode.params.volume || -25
          });
          break;

        case 'filter':
          audioNode = new Tone.Filter({
            frequency: patchNode.params.cutoff || 1000,
            type: patchNode.params.type || 'lowpass',
            Q: patchNode.params.resonance || 1
          });
          break;

        case 'lfo':
          audioNode = new Tone.LFO({
            frequency: patchNode.params.rate || 1,
            type: patchNode.params.waveform || 'sine',
            min: patchNode.params.min || 0,
            max: patchNode.params.max || 1
          });
          break;

        case 'reverb':
          audioNode = new Tone.Reverb({
            decay: patchNode.params.decay || 2,
            wet: patchNode.params.wet || 0.3
          });
          break;

        case 'delay':
          audioNode = new Tone.Delay(patchNode.params.time || 0.2);
          break;

        case 'bitcrusher':
          audioNode = new Tone.BitCrusher(patchNode.params.bits || 8);
          break;

        case 'chorus':
          audioNode = new Tone.Chorus({
            frequency: patchNode.params.frequency || 0.5,
            delayTime: patchNode.params.delayTime || 2.5,
            depth: patchNode.params.depth || 0.7,
            wet: patchNode.params.wet || 0.4
          });
          break;

        default:
          return null;
      }

      this.nodes.set(patchNode.id, audioNode);
      return audioNode;
    } catch (error) {
      throw new Error(`Failed to create node ${patchNode.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper method to create ramp node
  private createRampNode(): AudioNode {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter({
      frequency: 800,
      type: 'lowpass',
      Q: 2
    });
    noise.connect(filter);
    return filter;
  }

  // Create specialized sounds for new modules
  private createDrumSound(): AudioNode {
    const freq = 261.63; // C4 default

    // Layer 1: Pure sine tone for body
    const bodyOsc = new Tone.Oscillator(freq * 2, 'sine');
    const bodyGain = new Tone.Gain(0.5);

    // Layer 2: Lower sine for depth
    const depthOsc = new Tone.Oscillator(freq, 'sine');
    const depthGain = new Tone.Gain(0.3);

    // Very small noise for texture (reduced)
    const noise = new Tone.Noise('white');
    const noiseGain = new Tone.Gain(0.08);
    const noiseFilter = new Tone.Filter(3000, 'highpass');

    // Clean punchy envelope
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,     // Very fast attack
      decay: 0.15,       // Short decay
      sustain: 0,        // No sustain (percussive)
      release: 0.3       // Short tail
    });

    const filter = new Tone.Filter({
      frequency: freq * 3,
      type: 'lowpass',
      Q: 1
    });

    const gain = new Tone.Gain(0.7);

    bodyOsc.connect(bodyGain);
    depthOsc.connect(depthGain);
    noise.connect(noiseGain);
    noiseGain.connect(noiseFilter);

    bodyGain.connect(filter);
    depthGain.connect(filter);
    noiseFilter.connect(filter);

    filter.connect(env);
    env.connect(gain);

    bodyOsc.start();
    depthOsc.start();
    noise.start();

    return gain;
  }

  private createChimeSound(): AudioNode {
    const freq = 440; // A4 default

    // Layer 1: Fundamental (sine) - pure base tone
    const fundamental = new Tone.Oscillator(freq, 'sine');
    const fundamentalGain = new Tone.Gain(0.4);

    // Layer 2: Third harmonic (sine) - adds brightness
    const thirdHarmonic = new Tone.Oscillator(freq * 3.02, 'sine'); // Slightly detuned for warmth
    const thirdGain = new Tone.Gain(0.25);

    // Layer 3: Fifth harmonic (triangle) - adds complexity
    const fifthHarmonic = new Tone.Oscillator(freq * 5.05, 'triangle');
    const fifthGain = new Tone.Gain(0.15);

    // Layer 4: High sparkle (sine) - adds brilliance
    const sparkle = new Tone.Oscillator(freq * 8.1, 'sine');
    const sparkleGain = new Tone.Gain(0.08);

    // Envelope - soft attack, long release (5 seconds!)
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.02,      // Very soft attack
      attackCurve: 'sine',
      decay: 2,          // Gradual decay
      sustain: 0.4,      // Some sustain
      release: 5,        // Very long release for beautiful tail
      releaseCurve: 'exponential'
    });

    // Lowpass filter for warmth
    const filter = new Tone.Filter({
      frequency: 8000,
      type: 'lowpass',
      Q: 0.5
    });

    // Chorus for thickness and depth
    const chorus = new Tone.Chorus({
      frequency: 0.15,
      delayTime: 3.5,
      depth: 0.6,
      wet: 0.4
    }).start();

    // Connect layers
    fundamental.connect(fundamentalGain);
    thirdHarmonic.connect(thirdGain);
    fifthHarmonic.connect(fifthGain);
    sparkle.connect(sparkleGain);

    fundamentalGain.connect(filter);
    thirdGain.connect(filter);
    fifthGain.connect(filter);
    sparkleGain.connect(filter);

    filter.connect(chorus);
    chorus.connect(env);

    // Start oscillators
    fundamental.start();
    thirdHarmonic.start();
    fifthHarmonic.start();
    sparkle.start();

    return env;
  }

  private createSpinnerSound(): AudioNode {
    // Beautiful layered sound with warmth

    // Layer 1: Sine foundation
    const sineLayer = new Tone.Oscillator(523.25, 'sine'); // C5
    const sineGain = new Tone.Gain(0.35);

    // Layer 2: Triangle harmonic richness
    const triangleLayer = new Tone.Oscillator(523.25 * 1.01, 'triangle'); // Slightly detuned
    const triangleGain = new Tone.Gain(0.2);

    // Layer 3: High sine for clarity
    const highLayer = new Tone.Oscillator(523.25 * 2, 'sine');
    const highGain = new Tone.Gain(0.1);

    // Warm envelope
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.05,      // Soft attack
      attackCurve: 'sine',
      decay: 0.5,
      sustain: 0.6,
      release: 2,        // Long release
      releaseCurve: 'exponential'
    });

    // Warm lowpass filter
    const filter = new Tone.Filter({
      frequency: 3000,
      type: 'lowpass',
      Q: 1
    });

    // Slight chorus for depth
    const chorus = new Tone.Chorus({
      frequency: 0.2,
      delayTime: 2,
      depth: 0.4,
      wet: 0.3
    }).start();

    // Connect
    sineLayer.connect(sineGain);
    triangleLayer.connect(triangleGain);
    highLayer.connect(highGain);

    sineGain.connect(filter);
    triangleGain.connect(filter);
    highGain.connect(filter);

    filter.connect(chorus);
    chorus.connect(env);

    sineLayer.start();
    triangleLayer.start();
    highLayer.start();

    return env;
  }

  private createSpiralEffect(): AudioNode {
    // Ethereal spiral sound with movement

    const baseFreq = 660; // E5

    // Layer 1: Main tone
    const mainOsc = new Tone.Oscillator(baseFreq, 'sine');
    const mainGain = new Tone.Gain(0.3);

    // Layer 2: Detuned harmony
    const harmonyOsc = new Tone.Oscillator(baseFreq * 1.5, 'sine');
    const harmonyGain = new Tone.Gain(0.2);

    // Movement with filter sweep
    const filter = new Tone.Filter({
      frequency: 2000,
      type: 'bandpass',
      Q: 2
    });

    const lfo = new Tone.LFO({
      frequency: 0.3,
      min: 500,
      max: 4000,
      type: 'sine'
    });
    lfo.connect(filter.frequency);
    lfo.start();

    // Envelope
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.1,
      decay: 1,
      sustain: 0.3,
      release: 2
    });

    mainOsc.connect(mainGain);
    harmonyOsc.connect(harmonyGain);
    mainGain.connect(filter);
    harmonyGain.connect(filter);
    filter.connect(env);

    mainOsc.start();
    harmonyOsc.start();

    return env;
  }

  private createSeesawSound(): AudioNode {
    // Warm, playful seesaw sound

    const baseFreq = 330; // E4

    // Layer 1: Warm sine foundation
    const warmOsc = new Tone.Oscillator(baseFreq, 'sine');
    const warmGain = new Tone.Gain(0.4);

    // Layer 2: Triangle adds character
    const charOsc = new Tone.Oscillator(baseFreq * 2, 'triangle');
    const charGain = new Tone.Gain(0.15);

    // Gentle pitch wobble
    const pitchLFO = new Tone.LFO({
      frequency: 0.15,
      min: -8,
      max: 8,
      type: 'sine'
    });
    pitchLFO.connect(warmOsc.detune);
    pitchLFO.start();

    // Envelope
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.08,
      decay: 0.4,
      sustain: 0.5,
      release: 1.5
    });

    // Filter for warmth
    const filter = new Tone.Filter({
      frequency: 2500,
      type: 'lowpass',
      Q: 1.5
    });

    warmOsc.connect(warmGain);
    charOsc.connect(charGain);
    warmGain.connect(filter);
    charGain.connect(filter);
    filter.connect(env);

    warmOsc.start();
    charOsc.start();

    return env;
  }

  private createBellSound(): AudioNode {
    const bell = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.4, sustain: 0.1, release: 3 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5
    });

    return bell;
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      try {
        // Disconnect from all connections
        this.connections = this.connections.filter(
          conn => conn.from !== nodeId && conn.to !== nodeId
        );

        // Stop oscillators if running
        if (node instanceof Tone.Oscillator) {
          node.stop();
        }

        // Stop LFOs if running
        if (node instanceof Tone.LFO) {
          node.stop();
        }

        node.dispose();
        this.nodes.delete(nodeId);
      } catch (error) {
        // Log error but continue cleanup
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to remove node ${nodeId}: ${errorMessage}`);
      }
    }
  }

  connect(fromId: string, toId: string, param?: string): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) return false;

    try {
      if (param) {
        const typedToNode = toNode as unknown as ToneAudioNodeWithParams;
        if (typedToNode[param]) {
          fromNode.connect(typedToNode[param] as Tone.ToneAudioNode);
        } else {
          fromNode.connect(toNode);
        }
      } else {
        fromNode.connect(toNode);
      }

      this.connections.push({ from: fromId, to: toId, param });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Audio connection failed from ${fromId} to ${toId}: ${errorMessage}`);
    }
  }

  disconnect(fromId: string, toId: string): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (fromNode && toNode) {
      try {
        fromNode.disconnect(toNode);
        this.connections = this.connections.filter(
          conn => !(conn.from === fromId && conn.to === toId)
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Audio disconnect failed from ${fromId} to ${toId}: ${errorMessage}`);
      }
    }
  }

  triggerCollision(event: CollisionEvent): void {
    try {
      // Ensure Tone.js context is running
      if (Tone.context.state === 'suspended') {
        Tone.start().catch((error) => {
          throw new Error(`Failed to resume Tone.js context: ${error.message}`);
        });
      }

      // Enhance reverb tail on collision for spatial accumulation
      this.enhanceReverbOnCollision(event.velocity);

      // ADVANCE HARMONIC PROGRESSION DISABLED - Key changes during combos removed
      // this.advanceHarmony(event.nodeId);

      // Handle different module types
      if (event.nodeId.includes('bumper')) {
        this.playDrumHit();
      } else if (event.nodeId.includes('chime')) {
        this.playChimeHit();
      } else if (event.nodeId.includes('bell')) {
        this.playBellHit();
      } else if (event.nodeId.includes('spinner')) {
        this.playSpinnerHit();
      } else if (event.nodeId.includes('ramp')) {
        this.playRampSlide();
      } else if (event.nodeId.includes('funnel')) {
        this.playSpiralEffect();
      } else if (event.nodeId.includes('seesaw')) {
        this.playSeesawTilt();
      } else {
        // Default collision sound
        this.playDefaultCollision();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to trigger collision for node ${event.nodeId}: ${errorMessage}`);
    }
  }

  // Helper: Generate completely random frequency within musical range
  private randomFreq(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  // Helper: Generate random frequency from a scale (pentatonic for pleasantness)
  private randomScaleFreq(baseFreq: number): number {
    const pentatonicRatios = [1, 1.125, 1.25, 1.5, 1.667]; // Major pentatonic
    const randomRatio = pentatonicRatios[Math.floor(Math.random() * pentatonicRatios.length)];
    const randomOctave = Math.pow(2, Math.floor(Math.random() * 4) - 1); // -1 to +2 octaves
    return baseFreq * randomRatio * randomOctave;
  }

  private playDrumHit(): void {
    // PERFORMANCE: Check active nodes limit to prevent audio glitch
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // DEEP TEMPLE BELL - completely random pitch each time
    const freq = this.randomScaleFreq(65.41); // C2 base, random variation

    // Multiple detuned layers for richness
    const osc1 = new Tone.Oscillator(freq, 'sine');
    const osc2 = new Tone.Oscillator(freq * 2.02, 'sine');
    const osc3 = new Tone.Oscillator(freq * 3.05, 'triangle');

    const gain = new Tone.Gain(0.6);

    const filter = new Tone.Filter({
      frequency: 800,
      type: 'lowpass',
      Q: 2
    });

    // PERFORMANCE: Shorter envelope for faster cleanup (same sound quality)
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 1.0,      // Reduced from 2.5s (still sounds good)
      sustain: 0.2,
      release: 1.5     // Reduced from 4s (fades out faster)
    });

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(env);
    env.connect(gain);
    gain.connect(this.echoDelay);

    osc1.start();
    osc2.start();
    osc3.start();

    env.triggerAttackRelease('2s'); // Reduced from 4s

    // PERFORMANCE: Faster cleanup (2.5s instead of 5s)
    const timeoutId = setTimeout(() => {
      try {
        osc1.dispose();
        osc2.dispose();
        osc3.dispose();
        filter.dispose();
        env.dispose();
        gain.dispose();
        this.temporaryNodes.delete('drum');
      } catch (error) {
        // Ignore
      }
    }, 2500);

    this.temporaryNodes.set('drum', { nodes: [osc1, osc2, osc3, filter, env, gain], timeoutId });
  }

  private playChimeHit(): void {
    // PERFORMANCE: Check active nodes limit
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // HEAVENLY HARP - completely random pitch each time
    const freq = this.randomScaleFreq(523.25); // C5 base, random variation

    // 5 layered sine waves for rich harmonics
    const layers: Array<{ osc: Tone.Oscillator; gain: Tone.Gain }> = [];
    const frequencies = [freq, freq * 2.5, freq * 5.1, freq * 8.2, freq * 12.5];

    frequencies.forEach((f, i) => {
      const osc = new Tone.Oscillator(f, 'sine');
      const layerGain = new Tone.Gain(0.3 / (i + 1)); // Decreasing volume for higher harmonics
      layers.push({ osc, gain: layerGain });
      osc.connect(layerGain);
      osc.start();
    });

    const masterGain = new Tone.Gain(0.5);
    const filter = new Tone.Filter({
      frequency: 12000,
      type: 'highpass', // Keep high frequencies
      Q: 0.5
    });

    // PERFORMANCE: Shorter envelope (still sounds beautiful)
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.05,
      decay: 1.5,      // Reduced from 3s
      sustain: 0.2,
      release: 2.5     // Reduced from 6s (fades faster)
    });

    layers.forEach(layer => {
      layer.gain.connect(filter);
    });

    filter.connect(env);
    env.connect(masterGain);
    masterGain.connect(this.echoDelay);

    env.triggerAttackRelease('3s'); // Reduced from 8s

    // PERFORMANCE: Faster cleanup
    const timeoutId = setTimeout(() => {
      try {
        layers.forEach(l => {
          l.osc.dispose();
          l.gain.dispose();
        });
        filter.dispose();
        env.dispose();
        masterGain.dispose();
        this.temporaryNodes.delete('chime');
      } catch (error) {
        // Ignore
      }
    }, 3500); // Reduced from 9000ms

    this.temporaryNodes.set('chime', { nodes: [env, filter, masterGain], timeoutId });
  }

  private playBellHit(): void {
    // PERFORMANCE: Check active nodes limit
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // CRYSTAL PURE TONE - completely random pitch each time
    const freq = this.randomScaleFreq(880); // A5 base, random variation

    // Single pure sine with incredible resonance
    const osc = new Tone.Oscillator(freq, 'sine');

    // Resonant filter that creates singing effect
    const filter = new Tone.Filter({
      frequency: freq * 1.5,
      type: 'bandpass',
      Q: 20         // Extremely high Q for resonance
    });

    // LFO to modulate filter frequency
    const lfo = new Tone.LFO({
      frequency: this.randomFreq(0.05, 0.2),
      min: freq * 0.8,
      max: freq * 2,
      type: 'sine'
    });
    lfo.connect(filter.frequency);
    lfo.start();

    // PERFORMANCE: Shorter envelope (still sounds resonant)
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 2,       // Reduced from 4s
      sustain: 0.1,
      release: 3       // Reduced from 8s (still long tail)
    });

    const gain = new Tone.Gain(0.4);

    osc.connect(filter);
    filter.connect(env);
    env.connect(gain);
    gain.connect(this.echoDelay);

    osc.start();
    env.triggerAttackRelease('4s'); // Reduced from 10s

    // PERFORMANCE: Faster cleanup
    const timeoutId = setTimeout(() => {
      try {
        osc.dispose();
        filter.dispose();
        lfo.dispose();
        env.dispose();
        gain.dispose();
        this.temporaryNodes.delete('bell');
      } catch (error) {
        // Ignore
      }
    }, 5000); // Reduced from 12000ms

    this.temporaryNodes.set('bell', { nodes: [osc, filter, lfo, env, gain], timeoutId });
  }

  private playSpinnerHit(): void {
    // PERFORMANCE: Check active nodes limit
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // COSMIC CHORD - completely random chord each time
    const baseFreq = this.randomScaleFreq(261.63); // C4 base, random variation
    const chordIntervals = [1, 1.25, 1.5, 2]; // Major chord intervals
    const notes = chordIntervals.map(interval => baseFreq * interval);

    const oscillators: (Tone.Oscillator | Tone.Gain | Tone.Filter)[] = [];

    notes.forEach((freq, i) => {
      // PERFORMANCE: Simplified to 2 layers per note (was 3)
      const fundamental = new Tone.Oscillator(freq, 'sine');
      const harmonic = new Tone.Oscillator(freq * 2.01, 'triangle');

      const noteGain = new Tone.Gain(0.2);
      const filter = new Tone.Filter({
        frequency: 3000 + (i * 500),
        type: 'lowpass',
        Q: 1
      });

      fundamental.connect(filter);
      harmonic.connect(filter);
      filter.connect(noteGain);

      fundamental.start();
      harmonic.start();

      oscillators.push(fundamental, harmonic, filter, noteGain);
    });

    // Chorus for cosmic effect
    const chorus = new Tone.Chorus({
      frequency: 0.1,
      delayTime: 4,
      depth: 0.8,
      wet: 0.6
    }).start();

    // PERFORMANCE: Shorter envelope
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.3,
      decay: 1,       // Reduced from 2s
      sustain: 0.5,
      release: 2       // Reduced from 3s
    });

    const masterGain = new Tone.Gain(0.3);

    oscillators.forEach((osc) => {
      if (osc instanceof Tone.Filter) {
        osc.connect(chorus);
      }
    });

    chorus.connect(env);
    env.connect(masterGain);
    masterGain.connect(this.echoDelay);

    env.triggerAttackRelease('3s'); // Reduced from 5s

    // PERFORMANCE: Faster cleanup
    const timeoutId = setTimeout(() => {
      try {
        oscillators.forEach(o => o.dispose());
        chorus.dispose();
        env.dispose();
        masterGain.dispose();
        this.temporaryNodes.delete('spinner');
      } catch (error) {
        // Ignore
      }
    }, 4000); // Reduced from 6000ms

    this.temporaryNodes.set('spinner', { nodes: [chorus, env, masterGain], timeoutId });
  }

  private playRampSlide(): void {
    // PERFORMANCE: Check active nodes limit to prevent audio glitch
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // SACRED GEOMETRY SLIDE - harmonious pentatonic glissando
    const pentatonicScale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // C4, D4, E4, G4, A4, C5
    const startIndex = Math.floor(Math.random() * (pentatonicScale.length - 1));
    const endIndex = Math.min(startIndex + 2, pentatonicScale.length - 1);

    const startFreq = pentatonicScale[startIndex];
    const endFreq = pentatonicScale[endIndex] * 2; // Octave up for ascension effect

    // Multiple layered oscillators for richness
    const osc1 = new Tone.Oscillator(startFreq, 'sine');
    const osc2 = new Tone.Oscillator(startFreq * 2.01, 'triangle'); // Slight detune
    const osc3 = new Tone.Oscillator(startFreq * 0.5, 'sine'); // Sub octave

    const filter = new Tone.Filter({
      frequency: 3000,
      type: 'lowpass',
      Q: 2
    });

    // Pitch envelope for smooth ascent
    const pitchEnv = new Tone.FrequencyEnvelope({
      attack: 0.1,
      decay: 0.4,
      sustain: 0.4,
      release: 0.6,
      attackCurve: 'exponential',
      releaseCurve: 'exponential'
    });

    pitchEnv.connect(osc1.frequency);
    pitchEnv.connect(osc2.frequency);
    pitchEnv.connect(osc3.frequency);

    // LFO for subtle vibrato
    const lfo = new Tone.LFO(5, 0, 10); // 5Hz vibrato
    lfo.connect(osc1.detune);
    lfo.connect(osc2.detune);
    lfo.start();

    // Envelope for smooth fade
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.1,
      decay: 0.6,
      sustain: 0.3,
      release: 1.0
    });

    const gain = new Tone.Gain(0.3);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(env);
    env.connect(gain);
    gain.connect(this.echoDelay);

    osc1.start();
    osc2.start();
    osc3.start();

    pitchEnv.triggerAttackRelease(endFreq, '1.2s');
    env.triggerAttackRelease('1.8s');

    // PERFORMANCE: Cleanup after sound completes
    const timeoutId = setTimeout(() => {
      try {
        lfo.dispose();
        osc1.dispose();
        osc2.dispose();
        osc3.dispose();
        filter.dispose();
        pitchEnv.dispose();
        env.dispose();
        gain.dispose();
        this.temporaryNodes.delete('ramp');
      } catch (error) {
        // Ignore
      }
    }, 2500);

    this.temporaryNodes.set('ramp', { nodes: [lfo, osc1, osc2, osc3, filter, pitchEnv, env, gain], timeoutId });
  }

  private playSpiralEffect(): void {
    // PERFORMANCE: Check active nodes limit to prevent audio glitch
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // SPIRALING ARPEGGIO - completely random base frequency each time
    const baseFreq = this.randomScaleFreq(440); // A4 base, random variation

    // PERFORMANCE: Reduced from 5 to 3 oscillators (was 20+ nodes, now 12+)
    const oscillators: (Tone.Oscillator | Tone.Gain | Tone.Panner | Tone.FeedbackDelay)[] = [];
    const frequencies = [1, 1.5, 2]; // Reduced harmonic ratios (was 5)

    frequencies.forEach((ratio, i) => {
      const osc = new Tone.Oscillator(baseFreq * ratio, 'sine');
      const gain = new Tone.Gain(0.3); // Slightly louder to compensate for fewer oscillators
      const panner = new Tone.Panner(-0.6 + (i * 0.6)); // Spread across stereo field

      // Slight delay for echo effect
      const delay = new Tone.FeedbackDelay('8n', 0.3);
      delay.wet.value = 0.2; // Less wet for cleaner sound

      osc.connect(delay);
      delay.connect(gain);
      gain.connect(panner);

      osc.start();
      oscillators.push(osc, gain, panner, delay);
    });

    const masterGain = new Tone.Gain(0.35);

    oscillators.forEach((o) => {
      if (o instanceof Tone.Panner) {
        o.connect(masterGain);
      }
    });

    masterGain.connect(this.echoDelay);

    // PERFORMANCE: Faster cleanup (2s instead of 3s)
    const timeoutId = setTimeout(() => {
      try {
        oscillators.forEach(o => o.dispose());
        masterGain.dispose();
        this.temporaryNodes.delete('funnel');
      } catch (error) {
        // Ignore
      }
    }, 2000);

    this.temporaryNodes.set('funnel', { nodes: [masterGain], timeoutId });
  }

  private playSeesawTilt(): void {
    // PERFORMANCE: Check active nodes limit to prevent audio glitch
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    // PLAYFUL XYLOPHONE - completely random pitch each time
    const baseFreq = this.randomScaleFreq(392); // G4 base, random variation

    // Bright, percussive layers
    const osc1 = new Tone.Oscillator(baseFreq, 'sine');
    const osc2 = new Tone.Oscillator(baseFreq * 3, 'sine');
    const osc3 = new Tone.Oscillator(baseFreq * 5, 'triangle');

    // PERFORMANCE: Shorter envelope for faster cleanup (still percussive)
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.001,    // Instant attack
      decay: 0.5,       // Reduced from 0.8
      sustain: 0.05,    // Reduced from 0.1
      release: 0.8      // Reduced from 1.5
    });

    // Bright filter
    const filter = new Tone.Filter({
      frequency: 5000,
      type: 'highpass',
      Q: 2
    });

    const gain = new Tone.Gain(0.5);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(env);
    env.connect(gain);
    gain.connect(this.echoDelay);

    osc1.start();
    osc2.start();
    osc3.start();

    env.triggerAttackRelease('1s'); // Reduced from 2s

    // PERFORMANCE: Faster cleanup (1.5s instead of 3s)
    const timeoutId = setTimeout(() => {
      try {
        osc1.dispose();
        osc2.dispose();
        osc3.dispose();
        filter.dispose();
        env.dispose();
        gain.dispose();
        this.temporaryNodes.delete('seesaw');
      } catch (error) {
        // Ignore
      }
    }, 1500);

    this.temporaryNodes.set('seesaw', { nodes: [osc1, osc2, osc3, filter, env, gain], timeoutId });
  }

  private playDefaultCollision(): void {
    // PERFORMANCE: Check active nodes limit to prevent audio glitch
    const activeCount = this.temporaryNodes.size;
    if (activeCount >= 24) {
      return; // Skip if too many sounds active
    }

    const randomFreq = this.randomScaleFreq(528); // C5 base, random variation
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.5 } // Shorter envelope
    }).toDestination();

    synth.triggerAttackRelease(randomFreq, '0.8s'); // Reduced from 1.5s

    // PERFORMANCE: Faster cleanup (1s instead of 2s)
    const timeoutId = setTimeout(() => {
      try {
        synth.dispose();
        this.temporaryNodes.delete('default');
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 1000);

    this.temporaryNodes.set('default', { nodes: [synth], timeoutId });
  }

  updateNodeParam(nodeId: string, param: string, value: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    try {
      const typedNode = node as NodeWithParameters;

      if (typedNode[param] !== undefined) {
        const nodeParam = typedNode[param];

        if (nodeParam?.value !== undefined) {
          nodeParam.value = value;
        } else if (typeof nodeParam === 'object' && nodeParam?.set) {
          nodeParam.set(value);
        }
      }
    } catch (error) {
      throw new Error(`Failed to update parameter ${param} for node ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  setMasterVolume(volume: number): void {
    try {
      // Clamp volume between -60dB and 0dB for safety
      const clampedVolume = Math.max(-60, Math.min(0, volume));
      this.masterVolume.volume.value = clampedVolume;
    } catch (error) {
      throw new Error(`Failed to set master volume: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume.volume.value;
  }

  activateHealthFrequency(): void {
    // Health frequency functionality kept for compatibility
    // No-op in current implementation
  }

  stopHealthFrequency(): void {
    // Health frequency functionality kept for compatibility
    // No-op in current implementation
  }

  async exportAudio(): Promise<Blob> {
    // Audio export functionality
    return new Blob([], { type: 'audio/wav' });
  }

  destroy(): void {
    try {
      // Dispose echo delay
      if (this.echoDelay) {
        this.echoDelay.dispose();
      }

      // Reset harmonic system
      this.harmonyIndex = 0;
      this.collisionHistory = [];

      // Clear all temporary nodes and timeouts
      this.temporaryNodes.forEach((tempNodes: TemporaryNodes) => {
        if (tempNodes.timeoutId) {
          clearTimeout(tempNodes.timeoutId);
        }
        tempNodes.nodes.forEach(node => {
          try {
            if (node instanceof Tone.Oscillator) {
              node.stop();
            }
            if (node instanceof Tone.LFO) {
              node.stop();
            }
            node.dispose();
          } catch (error) {
            // Silently handle disposal errors
          }
        });
      });
      this.temporaryNodes.clear();

      // Stop and dispose all persistent nodes
      this.nodes.forEach(node => {
        try {
          if (node instanceof Tone.Oscillator) {
            node.stop();
          }
          if (node instanceof Tone.LFO) {
            node.stop();
          }
          node.dispose();
        } catch (error) {
          // Silently handle disposal errors
        }
      });

      this.nodes.clear();
      this.connections = [];

      // Dispose master effects
      this.masterVolume.dispose();
      this.ambientReverb.dispose();
      this.ambientChorus.dispose();
      this.glitchProcessor.dispose();
      this.granularDelay.dispose();

      this.isStarted = false;
    } catch (error) {
      throw new Error(`Failed to destroy AudioEngine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getConnections(): AudioConnection[] {
    return [...this.connections];
  }

  getNodeTypes(): string[] {
    return ['osc', 'filter', 'lfo', 'reverb', 'delay', 'bitcrusher', 'chorus'];
  }

  // Add method to create glitch effects
  createGlitchEffect(intensity: number = 0.3): void {
    try {
      this.glitchProcessor.bits.value = Math.floor(16 - (intensity * 12));
    } catch (error) {
      throw new Error(`Failed to create glitch effect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Add method to control ambient space
  setAmbientSpace(decay: number = 8): void {
    try {
      // Note: Tone.js Reverb doesn't have roomSize parameter
      this.ambientReverb.decay = decay;
    } catch (error) {
      throw new Error(`Failed to set ambient space: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Add minimal house rhythmic modulation
  createMinimalHousePattern(): void {
    // Minimal house pattern implementation
    // No-op in current implementation
  }

  // Cleanup method for manual cleanup of temporary nodes
  cleanupTemporaryNodes(key: string): void {
    const tempNodes = this.temporaryNodes.get(key);
    if (tempNodes) {
      if (tempNodes.timeoutId) {
        clearTimeout(tempNodes.timeoutId);
      }
      tempNodes.nodes.forEach(node => {
        try {
          if (node instanceof Tone.Oscillator) {
            node.stop();
          }
          if (node instanceof Tone.LFO) {
            node.stop();
          }
          node.dispose();
        } catch (error) {
          // Silently handle disposal errors
        }
      });
      this.temporaryNodes.delete(key);
    }
  }
}
