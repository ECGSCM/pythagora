import '@testing-library/jest-dom';
import { beforeAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock Tone.js for testing
vi.mock('tone', () => ({
  start: vi.fn().mockResolvedValue(undefined),
  Oscillator: vi.fn().mockImplementation(() => ({
    frequency: { value: 440 },
    type: 'sine',
    volume: { value: -20 },
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    state: 'stopped'
  })),
  Filter: vi.fn().mockImplementation(() => ({
    frequency: { value: 1000 },
    type: 'lowpass',
    Q: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn()
  })),
  LFO: vi.fn().mockImplementation(() => ({
    frequency: { value: 1 },
    type: 'sine',
    min: 0,
    max: 1,
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn()
  })),
  Reverb: vi.fn().mockImplementation(() => ({
    roomSize: { value: 0.5 },
    decay: { value: 2 },
    wet: { value: 0.3 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn()
  })),
  Delay: vi.fn().mockImplementation(() => ({
    delayTime: { value: 0.2 },
    feedback: { value: 0.3 },
    wet: { value: 0.5 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn()
  })),
  Volume: vi.fn().mockImplementation(() => ({
    volume: { value: -12 },
    toDestination: vi.fn().mockReturnThis(),
    connect: vi.fn(),
    dispose: vi.fn()
  }))
}));

// Mock Matter.js for testing
vi.mock('matter-js', () => ({
  Engine: {
    create: vi.fn().mockReturnValue({
      world: { gravity: { y: 0.8 } }
    }),
    run: vi.fn(),
    clear: vi.fn()
  },
  Render: {
    create: vi.fn().mockReturnValue({
      canvas: { width: 800, height: 600, remove: vi.fn() },
      options: { width: 800, height: 600 }
    }),
    run: vi.fn(),
    stop: vi.fn()
  },
  World: {
    add: vi.fn(),
    remove: vi.fn()
  },
  Bodies: {
    circle: vi.fn().mockReturnValue({
      id: 'mock-body',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 }
    }),
    rectangle: vi.fn().mockReturnValue({
      id: 'mock-body',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 }
    }),
    polygon: vi.fn().mockReturnValue({
      id: 'mock-body',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 }
    })
  },
  Body: {
    setPosition: vi.fn(),
    applyForce: vi.fn()
  },
  Events: {
    on: vi.fn()
  },
  Vector: {
    magnitude: vi.fn().mockReturnValue(1)
  }
}));

// Mock Canvas API
const mockCanvas = {
  getContext: vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4)
    }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  }),
  width: 800,
  height: 600,
  remove: vi.fn()
};

// Mock HTMLCanvasElement
Object.defineProperty(window, 'HTMLCanvasElement', {
  value: vi.fn().mockImplementation(() => mockCanvas),
  writable: true
});

// Mock canvas createElement
const originalCreateElement = document.createElement;
document.createElement = vi.fn().mockImplementation((tagName: string) => {
  if (tagName === 'canvas') {
    return mockCanvas;
  }
  return originalCreateElement.call(document, tagName);
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
  setTimeout(cb, 16);
  return 1;
});

global.cancelAnimationFrame = vi.fn();

// Mock Web Audio API
const mockAudioContext = {
  createOscillator: vi.fn().mockReturnValue({
    frequency: { value: 440 },
    type: 'sine',
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn()
  }),
  createGain: vi.fn().mockReturnValue({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn()
  }),
  destination: {},
  state: 'running',
  resume: vi.fn().mockResolvedValue(undefined)
};

(global as any).AudioContext = vi.fn().mockImplementation(() => mockAudioContext);
(global as any).webkitAudioContext = vi.fn().mockImplementation(() => mockAudioContext);

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue('')
  },
  writable: true
});

// Setup and cleanup
beforeAll(() => {
  // Any global setup
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});