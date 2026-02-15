import { PhysicsEngine, CollisionEvent } from './physics';
import { AudioEngine } from './audio';
import { PatchNode } from '../types/db.types';

export interface SynthBridgeConfig {
  canvasElement: HTMLCanvasElement;
  onCollision?: (event: CollisionEvent) => void;
}

export class SynthBridge {
  private physicsEngine: PhysicsEngine;
  private audioEngine: AudioEngine;
  private isInitialized = false;

  constructor(config: SynthBridgeConfig) {
    this.audioEngine = new AudioEngine();
    
    // Create physics engine with collision handler
    this.physicsEngine = new PhysicsEngine(
      config.canvasElement,
      (event) => this.handleCollision(event, config.onCollision)
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.audioEngine.start();
    this.isInitialized = true;
  }

  private handleCollision(event: CollisionEvent, callback?: (event: CollisionEvent) => void): void {
    // Trigger audio response
    this.audioEngine.triggerCollision(event);
    
    // Call external callback if provided
    callback?.(event);
  }

  addNode(node: PatchNode): boolean {
    try {
      // Add to physics world
      const physicsBody = this.physicsEngine.addNode(node);
      
      // Create audio node if it's a synth module
      if (['osc', 'filter', 'lfo', 'reverb', 'delay'].includes(node.type)) {
        const audioNode = this.audioEngine.createNode(node);
        
        if (!audioNode) {
          console.warn(`Failed to create audio node for type: ${node.type}`);
        }
      }

      return !!physicsBody;
    } catch (error) {
      console.error('Failed to add node:', error);
      return false;
    }
  }

  removeNode(nodeId: string): void {
    this.physicsEngine.removeNode(nodeId);
    this.audioEngine.removeNode(nodeId);
  }

  updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    this.physicsEngine.updateNodePosition(nodeId, position);
  }

  updateNodeParam(nodeId: string, param: string, value: any): void {
    this.audioEngine.updateNodeParam(nodeId, param, value);
  }

  connectNodes(fromId: string, toId: string, param?: string): boolean {
    return this.audioEngine.connect(fromId, toId, param);
  }

  disconnectNodes(fromId: string, toId: string): void {
    this.audioEngine.disconnect(fromId, toId);
  }

  addMarble(position: { x: number; y: number }): string {
    return this.physicsEngine.addMarble(position);
  }

  applyForce(nodeId: string, force: { x: number; y: number }): void {
    this.physicsEngine.applyForce(nodeId, force);
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

  loadPatch(nodes: PatchNode[]): void {
    // Clear existing nodes
    this.clearAll();

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

  clearAll(): void {
    // This would clear all nodes from both engines
    // Implementation depends on having a list of current nodes
  }

  resize(width: number, height: number): void {
    this.physicsEngine.resize(width, height);
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
      'gear', 
      'bumper',
      ...this.audioEngine.getNodeTypes()
    ];
  }

  destroy(): void {
    this.physicsEngine.destroy();
    this.audioEngine.destroy();
    this.isInitialized = false;
  }
}