// Harmonic Resonance Chain — the Circle-of-Fifths progression ported from
// audio.ts (59-73, 320-410). This module is pure and has NO Tone.js
// dependency: it just decides which chord (frequencies + linear voice gains)
// should sound next. Wiring it into the collision path is Phase 5 work; see
// the integration point in engine.ts.

// Circle of Fifths progression (ascending in perfect fifths). Ported verbatim.
export const CIRCLE_OF_FIFTHS: readonly number[] = [
  261.63, // C4
  392.0, // G4
  293.66, // D4
  440.0, // A4
  329.63, // E4
  493.88, // B4
  369.99, // F#4
  554.37, // C#5
  415.3, // G#4
  622.25, // D#5
  466.16, // A#4
  349.23, // F4
  261.63, // Back to C4
];

export const MAX_HARMONY_HISTORY = 10;

// dB/linear-gain confusion (A8) is fixed here: chord voice levels are plain
// linear gains in 0..1, never decibels.
export const CHORD_ROOT_GAIN = 0.5;
export const CHORD_UPPER_GAIN = 0.35;

export interface ChordVoice {
  frequency: number;
  /** Linear gain 0..1 (NOT decibels). */
  gain: number;
}

export interface Chord {
  root: number;
  third: number; // major third (5/4)
  fifth: number; // perfect fifth (3/2)
  voices: ChordVoice[];
}

export interface CollisionRecord {
  nodeId: string;
  timestamp: number;
  frequency: number;
}

export class HarmonyEngine {
  private harmonyIndex = 0;
  private collisionHistory: CollisionRecord[] = [];

  /**
   * Build a major triad (root, major third, perfect fifth) from a root
   * frequency, with linear voice gains.
   */
  calculateHarmony(rootFreq: number): Chord {
    const third = rootFreq * 1.25;
    const fifth = rootFreq * 1.5;
    return {
      root: rootFreq,
      third,
      fifth,
      voices: [
        { frequency: rootFreq, gain: CHORD_ROOT_GAIN },
        { frequency: third, gain: CHORD_UPPER_GAIN },
        { frequency: fifth, gain: CHORD_UPPER_GAIN },
      ],
    };
  }

  /** Peek the current chord without advancing. */
  getCurrentHarmony(): Chord {
    return this.calculateHarmony(CIRCLE_OF_FIFTHS[this.harmonyIndex]);
  }

  /** Advance one step along the Circle of Fifths and return the new chord. */
  getNextHarmony(): Chord {
    const chord = this.calculateHarmony(CIRCLE_OF_FIFTHS[this.harmonyIndex]);
    this.harmonyIndex = (this.harmonyIndex + 1) % CIRCLE_OF_FIFTHS.length;
    return chord;
  }

  /**
   * Record a collision and advance the progression. Returns the chord that
   * should sound for this collision.
   */
  advanceHarmony(nodeId: string, timestamp: number = Date.now()): Chord {
    this.collisionHistory.push({
      nodeId,
      timestamp,
      frequency: CIRCLE_OF_FIFTHS[this.harmonyIndex],
    });
    if (this.collisionHistory.length > MAX_HARMONY_HISTORY) {
      this.collisionHistory.shift();
    }
    return this.getNextHarmony();
  }

  getCollisionHistory(): CollisionRecord[] {
    return [...this.collisionHistory];
  }

  /** Reset progression and history to the beginning. */
  reset(): void {
    this.harmonyIndex = 0;
    this.collisionHistory = [];
  }
}
