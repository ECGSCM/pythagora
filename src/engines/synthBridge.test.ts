import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthBridge } from './synthBridge';
import { PatchNode } from '../types/db.types';

describe('SynthBridge', () => {
  let mockCanvas: HTMLCanvasElement;
  let synthBridge: SynthBridge;
  let mockCollisionCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCanvas = document.createElement('canvas');
    mockCollisionCallback = vi.fn();
    
    synthBridge = new SynthBridge({
      canvasElement: mockCanvas,
      onCollision: mockCollisionCallback
    });
  });

  describe('initialization', () => {
    it('should create a SynthBridge instance', () => {
      expect(synthBridge).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(synthBridge.initialize()).resolves.not.toThrow();
    });
  });

  describe('node management', () => {
    it('should add a marble node successfully', () => {
      const marbleNode: PatchNode = {
        id: 'marble-1',
        type: 'marble',
        position: { x: 100, y: 100 },
        params: {}
      };

      const result = synthBridge.addNode(marbleNode);
      expect(result).toBe(true);
    });

    it('should add an oscillator node successfully', () => {
      const oscNode: PatchNode = {
        id: 'osc-1',
        type: 'osc',
        position: { x: 200, y: 200 },
        params: { frequency: 440, waveform: 'sine', volume: -20 }
      };

      const result = synthBridge.addNode(oscNode);
      expect(result).toBe(true);
    });

    it('should add a filter node successfully', () => {
      const filterNode: PatchNode = {
        id: 'filter-1',
        type: 'filter',
        position: { x: 300, y: 300 },
        params: { cutoff: 1000, type: 'lowpass', resonance: 1 }
      };

      const result = synthBridge.addNode(filterNode);
      expect(result).toBe(true);
    });

    it('should remove a node successfully', () => {
      const testNode: PatchNode = {
        id: 'test-node',
        type: 'osc',
        position: { x: 100, y: 100 },
        params: {}
      };

      synthBridge.addNode(testNode);
      
      // Should not throw
      expect(() => synthBridge.removeNode('test-node')).not.toThrow();
    });

    it('should update node position', () => {
      const testNode: PatchNode = {
        id: 'test-node',
        type: 'marble',
        position: { x: 100, y: 100 },
        params: {}
      };

      synthBridge.addNode(testNode);
      
      // Should not throw
      expect(() => synthBridge.updateNodePosition('test-node', { x: 150, y: 150 })).not.toThrow();
    });

    it('should update node parameters', () => {
      const testNode: PatchNode = {
        id: 'test-node',
        type: 'osc',
        position: { x: 100, y: 100 },
        params: { frequency: 440 }
      };

      synthBridge.addNode(testNode);
      
      // Should not throw
      expect(() => synthBridge.updateNodeParam('test-node', 'frequency', 880)).not.toThrow();
    });
  });

  describe('marble physics', () => {
    it('should add a marble at specified position', () => {
      const position = { x: 250, y: 150 };
      const marbleId = synthBridge.addMarble(position);
      
      expect(marbleId).toMatch(/^marble-\d+$/);
    });

    it('should apply force to a body', () => {
      const position = { x: 100, y: 100 };
      const marbleId = synthBridge.addMarble(position);
      const force = { x: 0.1, y: 0.1 };
      
      // Should not throw
      expect(() => synthBridge.applyForce(marbleId, force)).not.toThrow();
    });
  });

  describe('audio connections', () => {
    it('should connect two audio nodes', () => {
      const osc: PatchNode = {
        id: 'osc-1',
        type: 'osc',
        position: { x: 100, y: 100 },
        params: {}
      };

      const filter: PatchNode = {
        id: 'filter-1',
        type: 'filter',
        position: { x: 200, y: 200 },
        params: {}
      };

      synthBridge.addNode(osc);
      synthBridge.addNode(filter);

      const connected = synthBridge.connectNodes('osc-1', 'filter-1');
      expect(connected).toBe(true);
    });

    it('should disconnect two audio nodes', () => {
      const osc: PatchNode = {
        id: 'osc-1',
        type: 'osc',
        position: { x: 100, y: 100 },
        params: {}
      };

      const filter: PatchNode = {
        id: 'filter-1',
        type: 'filter',
        position: { x: 200, y: 200 },
        params: {}
      };

      synthBridge.addNode(osc);
      synthBridge.addNode(filter);
      synthBridge.connectNodes('osc-1', 'filter-1');

      // Should not throw
      expect(() => synthBridge.disconnectNodes('osc-1', 'filter-1')).not.toThrow();
    });
  });

  describe('audio controls', () => {
    it('should set master volume', () => {
      const volume = -18;
      
      expect(() => synthBridge.setMasterVolume(volume)).not.toThrow();
    });

    it('should get master volume', () => {
      const volume = synthBridge.getMasterVolume();
      expect(typeof volume).toBe('number');
    });

    it('should activate health frequency', () => {
      const preset = {
        id: 'test-freq',
        frequency: 528,
        name: 'Test Frequency',
        description: 'Test frequency for unit testing'
      };

      expect(() => synthBridge.activateHealthFrequency(preset)).not.toThrow();
    });

    it('should stop health frequency', () => {
      expect(() => synthBridge.stopHealthFrequency()).not.toThrow();
      expect(() => synthBridge.stopHealthFrequency('test-freq')).not.toThrow();
    });
  });

  describe('patch loading', () => {
    it('should load a patch with multiple nodes', () => {
      const nodes: PatchNode[] = [
        {
          id: 'osc-1',
          type: 'osc',
          position: { x: 100, y: 100 },
          params: { frequency: 440 }
        },
        {
          id: 'filter-1',
          type: 'filter',
          position: { x: 200, y: 200 },
          params: { cutoff: 1000 },
          connections: ['osc-1']
        }
      ];

      expect(() => synthBridge.loadPatch(nodes)).not.toThrow();
    });
  });

  describe('utility methods', () => {
    it('should return available node types', () => {
      const nodeTypes = synthBridge.getAvailableNodeTypes();
      expect(nodeTypes).toContain('marble');
      expect(nodeTypes).toContain('osc');
      expect(nodeTypes).toContain('filter');
      expect(nodeTypes).toContain('reverb');
      expect(nodeTypes).toContain('delay');
    });

    it('should resize canvas', () => {
      expect(() => synthBridge.resize(1200, 800)).not.toThrow();
    });

    it('should export audio', async () => {
      const audioBlob = await synthBridge.exportAudio();
      expect(audioBlob).toBeInstanceOf(Blob);
    });

    it('should get connections', () => {
      const connections = synthBridge.getConnections();
      expect(Array.isArray(connections)).toBe(true);
    });

    it('should destroy without errors', () => {
      expect(() => synthBridge.destroy()).not.toThrow();
    });
  });
});