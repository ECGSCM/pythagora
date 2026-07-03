import { describe, it, expect } from 'vitest';
import { layerForInstrument, type DroneLayerName } from './drone';
import type { InstrumentName } from './instruments';

// Only the pure register mapping is tested here (§2.1) — the rest of the drone
// is Tone.js-bound and exercised in the browser smoke, not in unit tests.
describe('layerForInstrument', () => {
  const cases: Array<[InstrumentName, DroneLayerName]> = [
    ['bumper', 'ground'],
    ['seesaw', 'ground'],
    ['ramp', 'pad'],
    ['funnel', 'pad'],
    ['spinner', 'pad'],
    ['chime', 'air'],
    ['bell', 'air'],
    ['impact', 'air'],
  ];

  it.each(cases)('maps %s -> %s', (instrument, layer) => {
    expect(layerForInstrument(instrument)).toBe(layer);
  });

  it('covers every instrument name', () => {
    const names = cases.map(([n]) => n);
    expect(new Set(names).size).toBe(8);
  });
});
