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

export class AudioEngine {
  private nodes: Map<string, AudioNode> = new Map();
  private connections: AudioConnection[] = [];
  private isStarted = false;
  private masterVolume: Tone.Volume;
  private ambientReverb: Tone.Reverb;
  private ambientChorus: Tone.Chorus;
  private glitchProcessor: Tone.BitCrusher;
  private granularDelay: Tone.PingPongDelay;
  private temporaryNodes: Map<string, TemporaryNodes> = new Map();

  constructor() {
    try {
      this.masterVolume = new Tone.Volume(-12).toDestination(); // -12dB default for safety

      // Initialize ambient effects chain
      this.ambientReverb = new Tone.Reverb({
        decay: 8,
        wet: 0.4
      }).connect(this.masterVolume);

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

      // Don't initialize health frequencies automatically
      // this.initHealthFrequencies();
    } catch (error) {
      throw new Error(`Failed to initialize AudioEngine: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const drumOsc = new Tone.Oscillator(freq * 2, 'triangle');
    const noise = new Tone.Noise('brown');
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.2,
      sustain: 0,
      release: 0.1
    });

    const filter = new Tone.Filter(freq * 4, 'lowpass');
    const gain = new Tone.Gain(0.8);

    drumOsc.connect(filter);
    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);

    return gain;
  }

  private createChimeSound(): AudioNode {
    const freq = 440; // A4 default
    const metalOsc = new Tone.Oscillator(freq, 'sine');
    const harmonicOsc = new Tone.Oscillator(freq * 2.7, 'sine');
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.05,
      decay: 1.5,
      sustain: 0.3,
      release: 3
    });

    const reverb = new Tone.Reverb(4);
    const gain = new Tone.Gain(0.6);

    metalOsc.connect(reverb);
    harmonicOsc.connect(reverb);
    reverb.connect(env);
    env.connect(gain);

    return gain;
  }

  private createSpinnerSound(): AudioNode {
    const polySynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 1 }
    });

    return polySynth;
  }

  private createSpiralEffect(): AudioNode {
    const filter = new Tone.Filter(1000, 'bandpass');
    const lfo = new Tone.LFO(0.5, 200, 2000);
    lfo.connect(filter.frequency);
    lfo.start();

    return filter;
  }

  private createSeesawSound(): AudioNode {
    const osc = new Tone.Oscillator(220, 'sawtooth');
    const pitchLFO = new Tone.LFO(0.2, -12, 12);
    pitchLFO.connect(osc.detune);
    pitchLFO.start();

    return osc;
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

  private playDrumHit(): void {
    const drumOsc = new Tone.Oscillator(100, 'triangle').toDestination();
    const noise = new Tone.Noise('brown').toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.3,
      sustain: 0,
      release: 0.1
    }).toDestination();

    drumOsc.connect(env);
    noise.connect(env);

    drumOsc.start();
    noise.start();
    env.triggerAttackRelease('0.3s');

    // Cleanup after sound plays
    const timeoutId = setTimeout(() => {
      try {
        drumOsc.dispose();
        noise.dispose();
        env.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 500);

    this.temporaryNodes.set('drum', { nodes: [drumOsc, noise, env], timeoutId });
  }

  private playChimeHit(): void {
    const freq = 880;
    const chime = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 2, sustain: 0.1, release: 3 }
    }).toDestination();

    chime.triggerAttackRelease(freq, '2s');

    const timeoutId = setTimeout(() => {
      try {
        chime.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 3000);

    this.temporaryNodes.set('chime', { nodes: [chime], timeoutId });
  }

  private playBellHit(): void {
    const bell = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.4, sustain: 0.1, release: 3 },
      harmonicity: 5.1,
      modulationIndex: 32
    }).toDestination();

    bell.triggerAttackRelease(440, '3s');

    const timeoutId = setTimeout(() => {
      try {
        bell.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 4000);

    this.temporaryNodes.set('bell', { nodes: [bell], timeoutId });
  }

  private playSpinnerHit(): void {
    const notes = ['C4', 'E4', 'G4', 'C5'];
    const randomNote = notes[Math.floor(Math.random() * notes.length)];

    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 1 }
    }).toDestination();

    synth.triggerAttackRelease(randomNote, '1s');

    const timeoutId = setTimeout(() => {
      try {
        synth.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 2000);

    this.temporaryNodes.set('spinner', { nodes: [synth], timeoutId });
  }

  private playRampSlide(): void {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(800, 'lowpass');
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.5,
      decay: 1,
      sustain: 0.3,
      release: 0.5
    }).toDestination();

    noise.connect(filter);
    filter.connect(env);

    noise.start();
    env.triggerAttackRelease('2s');

    const timeoutId = setTimeout(() => {
      try {
        noise.dispose();
        filter.dispose();
        env.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 3000);

    this.temporaryNodes.set('ramp', { nodes: [noise, filter, env], timeoutId });
  }

  private playSpiralEffect(): void {
    const osc = new Tone.Oscillator(220, 'sine');
    const filter = new Tone.Filter(1000, 'bandpass');
    const lfo = new Tone.LFO(2, 200, 2000);
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.2,
      decay: 1.5,
      sustain: 0.4,
      release: 1
    }).toDestination();

    osc.connect(filter);
    filter.connect(env);
    lfo.connect(filter.frequency);

    osc.start();
    lfo.start();
    env.triggerAttackRelease('3s');

    const timeoutId = setTimeout(() => {
      try {
        osc.dispose();
        filter.dispose();
        lfo.dispose();
        env.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 4000);

    this.temporaryNodes.set('spiral', { nodes: [osc, filter, lfo, env], timeoutId });
  }

  private playSeesawTilt(): void {
    const osc = new Tone.Oscillator(330, 'sawtooth');
    const pitchEnv = new Tone.FrequencyEnvelope({
      attack: 0.2,
      decay: 0.5,
      sustain: 0.5,
      release: 1,
      baseFrequency: 330,
      octaves: 1
    });
    const ampEnv = new Tone.AmplitudeEnvelope({
      attack: 0.1,
      decay: 0.8,
      sustain: 0.4,
      release: 1
    }).toDestination();

    pitchEnv.connect(osc.frequency);
    osc.connect(ampEnv);

    osc.start();
    pitchEnv.triggerAttackRelease('2s');
    ampEnv.triggerAttackRelease('2s');

    const timeoutId = setTimeout(() => {
      try {
        osc.dispose();
        pitchEnv.dispose();
        ampEnv.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 3000);

    this.temporaryNodes.set('seesaw', { nodes: [osc, pitchEnv, ampEnv], timeoutId });
  }

  private playDefaultCollision(): void {
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 1 }
    }).toDestination();

    synth.triggerAttackRelease(528, '1.5s');

    const timeoutId = setTimeout(() => {
      try {
        synth.dispose();
      } catch (error) {
        // Silently handle disposal errors
      }
    }, 2000);

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
