import * as Tone from 'tone';
import { PatchNode, HealthFrequencyPreset } from '../types/db.types';
import { CollisionEvent } from './physics';

export interface AudioConnection {
  from: string;
  to: string;
  param?: string;
}

export class AudioEngine {
  private nodes: Map<string, Tone.ToneAudioNode> = new Map();
  private connections: AudioConnection[] = [];
  private isStarted = false;
  private masterVolume: Tone.Volume;
  private ambientReverb: Tone.Reverb;
  private ambientChorus: Tone.Chorus;
  private glitchProcessor: Tone.BitCrusher;
  private granularDelay: Tone.PingPongDelay;

  constructor() {
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
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    
    await Tone.start();
    this.isStarted = true;
    console.log('🎵 AudioEngine started successfully!');
  }

  createNode(patchNode: PatchNode): Tone.ToneAudioNode | null {
    let audioNode: Tone.ToneAudioNode;

    switch (patchNode.type) {
      // New Pythagora Switch Modules
      case 'ramp':
        // Ramp creates a sliding sound effect
        audioNode = new Tone.Noise('white').connect(
          new Tone.Filter({
            frequency: 800,
            type: 'lowpass',
            Q: 2
          })
        );
        break;

      case 'bumper':
        // Drum-like percussion sound
        audioNode = this.createDrumSound(patchNode.params.pitch || 'C4');
        break;

      case 'chime':
        // Bell-like melodic sound
        audioNode = this.createChimeSound(patchNode.params.note || 'A4');
        break;

      case 'spinner':
        // Rotating melody wheel
        audioNode = this.createSpinnerSound(patchNode.params.notes || ['C4', 'E4', 'G4']);
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
        audioNode = this.createBellSound(patchNode.params.frequency || 440);
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
  }

  // Create specialized sounds for new modules
  private createDrumSound(pitch: string): Tone.ToneAudioNode {
    const freq = Tone.Frequency(pitch).toFrequency();
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

  private createChimeSound(note: string): Tone.ToneAudioNode {
    const freq = Tone.Frequency(note).toFrequency();
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

  private createSpinnerSound(notes: string[]): Tone.ToneAudioNode {
    const polySynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 1 }
    });
    
    return polySynth;
  }

  private createSpiralEffect(): Tone.ToneAudioNode {
    const filter = new Tone.Filter(1000, 'bandpass');
    const lfo = new Tone.LFO(0.5, 200, 2000);
    lfo.connect(filter.frequency);
    lfo.start();
    
    return filter;
  }

  private createSeesawSound(): Tone.ToneAudioNode {
    const osc = new Tone.Oscillator(220, 'sawtooth');
    const pitchLFO = new Tone.LFO(0.2, -12, 12);
    pitchLFO.connect(osc.detune);
    pitchLFO.start();
    
    return osc;
  }

  private createBellSound(frequency: number): Tone.ToneAudioNode {
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
      // Disconnect from all connections
      this.connections = this.connections.filter(
        conn => conn.from !== nodeId && conn.to !== nodeId
      );
      
      node.dispose();
      this.nodes.delete(nodeId);
    }
  }

  connect(fromId: string, toId: string, param?: string): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) return false;

    try {
      if (param && (toNode as any)[param]) {
        fromNode.connect((toNode as any)[param]);
      } else {
        fromNode.connect(toNode);
      }

      this.connections.push({ from: fromId, to: toId, param });
      return true;
    } catch (error) {
      console.error('Audio connection failed:', error);
      return false;
    }
  }

  disconnect(fromId: string, toId: string): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (fromNode && toNode) {
      fromNode.disconnect(toNode);
      this.connections = this.connections.filter(
        conn => !(conn.from === fromId && conn.to === toId)
      );
    }
  }

  triggerCollision(event: CollisionEvent): void {
    console.log('🎵 AudioEngine: Triggering collision for node:', event.nodeId);
    
    // Ensure Tone.js context is running
    if (Tone.context.state === 'suspended') {
      Tone.start().then(() => {
        console.log('🎵 Tone.js context resumed');
      });
    }

    const velocity = Math.min(event.velocity || 5, 10);
    const normalizedVelocity = velocity / 10;
    const volume = -35 + (normalizedVelocity * 20);

    // Handle different module types
    if (event.nodeId.includes('bumper')) {
      this.playDrumHit(volume);
    } else if (event.nodeId.includes('chime')) {
      this.playChimeHit(volume);
    } else if (event.nodeId.includes('bell')) {
      this.playBellHit(volume);
    } else if (event.nodeId.includes('spinner')) {
      this.playSpinnerHit(volume);
    } else if (event.nodeId.includes('ramp')) {
      this.playRampSlide(volume);
    } else if (event.nodeId.includes('funnel')) {
      this.playSpiralEffect(volume);
    } else if (event.nodeId.includes('seesaw')) {
      this.playSeesawTilt(volume);
    } else {
      // Default collision sound
      this.playDefaultCollision(volume);
    }
  }

  private playDrumHit(volume: number): void {
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
    
    setTimeout(() => {
      drumOsc.dispose();
      noise.dispose();
      env.dispose();
    }, 500);
  }

  private playChimeHit(volume: number): void {
    const freq = 880;
    const chime = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 2, sustain: 0.1, release: 3 }
    }).toDestination();
    
    chime.triggerAttackRelease(freq, '2s');
    
    setTimeout(() => {
      chime.dispose();
    }, 3000);
  }

  private playBellHit(volume: number): void {
    const bell = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.4, sustain: 0.1, release: 3 },
      harmonicity: 5.1,
      modulationIndex: 32
    }).toDestination();
    
    bell.triggerAttackRelease(440, '3s');
    
    setTimeout(() => {
      bell.dispose();
    }, 4000);
  }

  private playSpinnerHit(volume: number): void {
    const notes = ['C4', 'E4', 'G4', 'C5'];
    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 1 }
    }).toDestination();
    
    synth.triggerAttackRelease(randomNote, '1s');
    
    setTimeout(() => {
      synth.dispose();
    }, 2000);
  }

  private playRampSlide(volume: number): void {
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
    
    setTimeout(() => {
      noise.dispose();
      filter.dispose();
      env.dispose();
    }, 3000);
  }

  private playSpiralEffect(volume: number): void {
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
    
    setTimeout(() => {
      osc.dispose();
      filter.dispose();
      lfo.dispose();
      env.dispose();
    }, 4000);
  }

  private playSeesawTilt(volume: number): void {
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
    
    setTimeout(() => {
      osc.dispose();
      pitchEnv.dispose();
      ampEnv.dispose();
    }, 3000);
  }

  private playDefaultCollision(volume: number): void {
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 1 }
    }).toDestination();
    
    synth.triggerAttackRelease(528, '1.5s');
    
    setTimeout(() => {
      synth.dispose();
    }, 2000);
  }

  updateNodeParam(nodeId: string, param: string, value: any): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    try {
      if ((node as any)[param] !== undefined) {
        if ((node as any)[param].value !== undefined) {
          (node as any)[param].value = value;
        } else {
          (node as any)[param] = value;
        }
      }
    } catch (error) {
      console.error('Failed to update node parameter:', error);
    }
  }

  setMasterVolume(volume: number): void {
    // Clamp volume between -60dB and 0dB for safety
    const clampedVolume = Math.max(-60, Math.min(0, volume));
    this.masterVolume.volume.value = clampedVolume;
    console.log('🔊 Master volume set to:', clampedVolume, 'dB');
  }

  getMasterVolume(): number {
    return this.masterVolume.volume.value;
  }

  activateHealthFrequency(preset: HealthFrequencyPreset): void {
    // Health frequency functionality kept for compatibility
    console.log('🎵 Health frequency activated:', preset.name);
  }

  stopHealthFrequency(presetId?: string): void {
    // Health frequency functionality kept for compatibility
    console.log('🎵 Health frequency stopped:', presetId);
  }

  async exportAudio(): Promise<Blob> {
    // Audio export functionality
    return new Blob([], { type: 'audio/wav' });
  }

  destroy(): void {
    // Stop and dispose all nodes
    this.nodes.forEach(node => {
      if (node instanceof Tone.Oscillator && node.state === 'started') {
        node.stop();
      }
      node.dispose();
    });

    this.nodes.clear();
    this.connections = [];
    this.masterVolume.dispose();
    this.ambientReverb.dispose();
    this.ambientChorus.dispose();
    this.glitchProcessor.dispose();
    this.granularDelay.dispose();
    
    this.isStarted = false;
  }

  getConnections(): AudioConnection[] {
    return [...this.connections];
  }

  getNodeTypes(): string[] {
    return ['osc', 'filter', 'lfo', 'reverb', 'delay', 'bitcrusher', 'chorus'];
  }
  
  // Add method to create glitch effects
  createGlitchEffect(intensity: number = 0.3): void {
    this.glitchProcessor.bits.value = Math.floor(16 - (intensity * 12));
  }
  
  // Add method to control ambient space
  setAmbientSpace(decay: number = 8): void {
    // Note: Tone.js Reverb doesn't have roomSize parameter
    this.ambientReverb.decay = decay;
  }
  
  // Add minimal house rhythmic modulation
  createMinimalHousePattern(): void {
    // Minimal house pattern implementation
  }
}