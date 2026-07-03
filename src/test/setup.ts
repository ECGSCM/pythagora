import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Phase 1 demolition removed every test file that existed in this repo
// (they all targeted the old, now-deleted 2D physics engine). No specs
// remain right now, so this file is intentionally minimal. The Tone.js mock
// below is kept for Phase 3/6, when the audio engine gets real unit tests
// again.
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
