import * as Tone from 'tone';
import { AudioEngine } from './audio';
import { PatchNode } from '../types/patch';

export interface Collision3DEvent {
  nodeId: string;
  velocity: number;
  position: { x: number; y: number; z: number };
  timestamp: number;
}

export interface SynthBridge3DConfig {
  onCollision?: (event: Collision3DEvent) => void;
}

export class SynthBridge3D {
  private audioEngine: AudioEngine;
  private isInitialized = false;
  private onCollision?: (event: Collision3DEvent) => void;

  constructor(config?: SynthBridge3DConfig) {
    this.audioEngine = new AudioEngine();
    this.onCollision = config?.onCollision;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Start Tone.js context on user interaction
    await Tone.start();

    await this.audioEngine.start();

    this.isInitialized = true;
  }

  triggerCollision(event: Collision3DEvent): void {
    // Ensure audio context is running
    if (Tone.context.state === 'suspended') {
      Tone.start();
    }

    // Trigger audio response
    this.audioEngine.triggerCollision({
      nodeId: event.nodeId,
      velocity: event.velocity,
      position: { x: event.position.x, y: event.position.y },
      timestamp: event.timestamp
    });

    // Call external callback if provided
    this.onCollision?.(event);
  }

  addNode(node: PatchNode): boolean {
    try {
      // Create audio node for new module types
      if (['ramp', 'bumper', 'chime', 'spinner', 'funnel', 'seesaw', 'bell', 'osc', 'filter', 'lfo', 'reverb', 'delay'].includes(node.type)) {
        const audioNode = this.audioEngine.createNode(node);

        if (!audioNode) {
          return false;
        }

        // Connect oscillators to master but don't start them automatically
        if (node.type === 'osc' && audioNode instanceof Tone.Oscillator) {
          audioNode.toDestination();
          // Don't auto-start - only start on collision
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  removeNode(nodeId: string): void {
    this.audioEngine.removeNode(nodeId);
  }

  updateNodeParam(nodeId: string, param: string, value: number): void {
    this.audioEngine.updateNodeParam(nodeId, param, value);
  }

  connectNodes(fromId: string, toId: string, param?: string): boolean {
    return this.audioEngine.connect(fromId, toId, param);
  }

  disconnectNodes(fromId: string, toId: string): void {
    this.audioEngine.disconnect(fromId, toId);
  }

  setMasterVolume(volume: number): void {
    this.audioEngine.setMasterVolume(volume);
  }

  getMasterVolume(): number {
    return this.audioEngine.getMasterVolume();
  }

  activateHealthFrequency(): void {
    this.audioEngine.activateHealthFrequency();
  }

  stopHealthFrequency(): void {
    this.audioEngine.stopHealthFrequency();
  }

  // ==================== ECHO MODE CONTROL ====================

  /**
   * Set the echo mode (off, short, or long)
   */
  setEchoMode(mode: 'off' | 'short' | 'long'): void {
    this.audioEngine.setEchoMode(mode);
  }

  /**
   * Get current echo mode
   */
  getEchoMode(): 'off' | 'short' | 'long' {
    return this.audioEngine.getEchoMode();
  }

  /**
   * Cycle through echo modes: off → short → long → off
   */
  cycleEchoMode(): 'off' | 'short' | 'long' {
    return this.audioEngine.cycleEchoMode();
  }

  // ==================== HARMONY CONTROL ====================

  /**
   * Get collision history for pattern recognition
   */
  getCollisionHistory() {
    return this.audioEngine.getCollisionHistory();
  }

  /**
   * Reset harmonic progression to beginning
   */
  resetHarmony(): void {
    this.audioEngine.resetHarmony();
  }

  loadPatch(nodes: PatchNode[]): void {
    // Clear existing audio nodes
    nodes.forEach(node => {
      this.audioEngine.removeNode(node.id);
    });

    // Add all nodes
    nodes.forEach(node => {
      this.addNode(node);
    });

    // Set up connections
    nodes.forEach(node => {
      if (node.connections) {
        node.connections.forEach(targetId => {
          this.connectNodes(node.id, targetId);
        });
      }
    });
  }

  async exportAudio(): Promise<Blob> {
    return this.audioEngine.exportAudio();
  }

  getConnections() {
    return this.audioEngine.getConnections();
  }

  getAvailableNodeTypes(): string[] {
    return [
      'marble',
      'ramp',
      'bumper',
      'chime',
      'spinner',
      'funnel', 
      'seesaw',
      'bell',
      ...this.audioEngine.getNodeTypes()
    ];
  }

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    this.audioEngine.destroy();
    this.isInitialized = false;
  }
}