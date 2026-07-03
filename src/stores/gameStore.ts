// Gameplay state store (zustand).
//
// This centralises the combo / unlock / stats / perfect-run / celebration
// state that used to live in Scene.useState and re-render the whole scene on
// every collision (REFACTORING_PLAN.md §0.5 P1/P2). Consumers subscribe via
// selectors so a combo tick only re-renders the components that read the
// changed slice; non-React callers (the frame loop, the collision handler)
// read imperatively with `useGameStore.getState()`.
//
// The combo/unlock/stats/perfect-run transition in `registerCollision` is a
// verbatim port of the old Scene.handleCollision body — same thresholds, same
// timers, same order — so runtime behaviour is unchanged.

import { create } from 'zustand';
import type { CollisionEvent } from '../types/events';
import { GAMEPLAY, calculateMultiplier } from '../config/world';

export interface ComboState {
  count: number;
  multiplier: number;
  lastCollisionTime: number;
}

export interface ComboDisplayState {
  show: boolean;
  text: string;
  scale: number;
}

export interface UnlocksState {
  enhancedParticles: boolean; // 5 combo
  goldenMarble: boolean; // 10 combo
  rainbowRipples: boolean; // 15 combo
  goldenMode: boolean; // 20 combo
}

export interface SessionStats {
  totalCollisions: number;
  maxCombo: number;
  totalScore: number;
}

export interface PerfectRunState {
  active: boolean;
  flawlessHits: number;
}

export interface CompletionCelebrationState {
  enabled: boolean;
  marblesCompleted: number;
}

interface GameState {
  combo: ComboState;
  comboDisplay: ComboDisplayState;
  unlocks: UnlocksState;
  sessionStats: SessionStats;
  perfectRun: PerfectRunState;
  completionCelebration: CompletionCelebrationState;
  /** Timestamp of the most recent marble hit per module id — drives hit flash. */
  moduleHits: Record<string, number>;

  /** Port of Scene.handleCollision's combo/unlock/stats/perfect-run update. */
  registerCollision: (event: CollisionEvent) => void;
  /** A marble finished its run: bump the completion celebration. */
  marbleCompleted: () => void;
  /** The celebration animation finished (or was dismissed). */
  clearCelebration: () => void;
  /** Reset all gameplay state (and cancel the pending combo-reset timer). */
  reset: () => void;
}

const initialCombo = (): ComboState => ({ count: 0, multiplier: 1, lastCollisionTime: 0 });
const initialComboDisplay = (): ComboDisplayState => ({ show: false, text: '', scale: 1 });
const initialUnlocks = (): UnlocksState => ({
  enhancedParticles: false,
  goldenMarble: false,
  rainbowRipples: false,
  goldenMode: false,
});
const initialStats = (): SessionStats => ({ totalCollisions: 0, maxCombo: 0, totalScore: 0 });
const initialPerfectRun = (): PerfectRunState => ({ active: false, flawlessHits: 0 });
const initialCelebration = (): CompletionCelebrationState => ({ enabled: false, marblesCompleted: 0 });

// A single pending combo-reset timer, re-armed on every collision. Mirrors the
// old Scene useEffect that cleared/re-created its timeout on each collision.
let comboResetTimer: ReturnType<typeof setTimeout> | null = null;

export const useGameStore = create<GameState>((set, get) => {
  // Re-arm the "combo expires after N ms of silence" timer.
  const armComboResetTimer = () => {
    if (comboResetTimer) clearTimeout(comboResetTimer);
    comboResetTimer = setTimeout(() => {
      const { combo } = get();
      if (Date.now() - combo.lastCollisionTime >= GAMEPLAY.comboTimeoutMs && combo.count > 0) {
        set({ combo: { ...get().combo, count: 0, multiplier: 1 } });
      }
    }, GAMEPLAY.comboTimeoutMs);
  };

  return {
    combo: initialCombo(),
    comboDisplay: initialComboDisplay(),
    unlocks: initialUnlocks(),
    sessionStats: initialStats(),
    perfectRun: initialPerfectRun(),
    completionCelebration: initialCelebration(),
    moduleHits: {},

    registerCollision: (event) => {
      const { combo, unlocks, sessionStats, perfectRun, moduleHits } = get();

      // Flash the struck module (P11).
      set({ moduleHits: { ...moduleHits, [event.nodeId]: event.timestamp } });

      const now = Date.now();
      const timeSinceLastCollision = now - combo.lastCollisionTime;

      if (timeSinceLastCollision < GAMEPLAY.comboTimeoutMs) {
        // Continue combo.
        const newCombo = combo.count + 1;
        const newMultiplier = calculateMultiplier(newCombo);
        set({ combo: { ...get().combo, count: newCombo, multiplier: newMultiplier } });

        // Update session stats.
        set({
          sessionStats: {
            totalCollisions: sessionStats.totalCollisions + 1,
            maxCombo: Math.max(sessionStats.maxCombo, newCombo),
            totalScore: sessionStats.totalScore + GAMEPLAY.scorePerHit * newMultiplier,
          },
        });

        // Show combo display if the multiplier increased.
        if (newMultiplier > combo.multiplier) {
          set({ comboDisplay: { show: true, text: `${newMultiplier}x COMBO!`, scale: 1.5 } });
          setTimeout(() => {
            set({ comboDisplay: { ...get().comboDisplay, show: false, scale: 1 } });
          }, GAMEPLAY.comboDisplayHideMs);
        }

        // Check for perfect run (high combo without misses).
        if (newCombo >= GAMEPLAY.perfectRunThreshold && !perfectRun.active) {
          set({ perfectRun: { active: true, flawlessHits: newCombo } });
          setTimeout(() => {
            set({ perfectRun: { active: false, flawlessHits: 0 } });
          }, GAMEPLAY.perfectRunHideMs);
        }

        // Update flawless hits counter (uses the pre-update perfectRun.active,
        // matching the old async-setState semantics).
        if (perfectRun.active) {
          set({ perfectRun: { ...get().perfectRun, flawlessHits: newCombo } });
        }

        // Check for unlocks.
        const newUnlocks = { ...unlocks };
        let unlockTriggered = false;
        if (newCombo >= GAMEPLAY.unlockThresholds.enhancedParticles && !unlocks.enhancedParticles) {
          newUnlocks.enhancedParticles = true;
          unlockTriggered = true;
        }
        if (newCombo >= GAMEPLAY.unlockThresholds.goldenMarble && !unlocks.goldenMarble) {
          newUnlocks.goldenMarble = true;
          unlockTriggered = true;
        }
        if (newCombo >= GAMEPLAY.unlockThresholds.rainbowRipples && !unlocks.rainbowRipples) {
          newUnlocks.rainbowRipples = true;
          unlockTriggered = true;
        }
        if (newCombo >= GAMEPLAY.unlockThresholds.goldenMode && !unlocks.goldenMode) {
          newUnlocks.goldenMode = true;
          unlockTriggered = true;
        }
        set({ unlocks: newUnlocks });

        if (unlockTriggered) {
          // Trigger the color-dimension visual effect instead of text.
          set({ comboDisplay: { show: true, text: '', scale: 0 } });
          setTimeout(() => {
            set({ comboDisplay: { ...get().comboDisplay, show: false, scale: 1 } });
          }, GAMEPLAY.unlockDisplayHideMs);
        }
      } else {
        // Reset combo.
        set({ combo: { ...get().combo, count: 1, multiplier: 1 } });
        set({
          sessionStats: {
            ...sessionStats,
            totalCollisions: sessionStats.totalCollisions + 1,
            totalScore: sessionStats.totalScore + GAMEPLAY.scorePerHit,
          },
        });
      }

      set({ combo: { ...get().combo, lastCollisionTime: now } });
      armComboResetTimer();
    },

    marbleCompleted: () => {
      set({
        completionCelebration: {
          enabled: true,
          marblesCompleted: get().completionCelebration.marblesCompleted + 1,
        },
      });
      setTimeout(() => {
        set({ completionCelebration: { ...get().completionCelebration, enabled: false } });
      }, GAMEPLAY.celebrationHideMs);
    },

    clearCelebration: () => {
      set({ completionCelebration: { ...get().completionCelebration, enabled: false } });
    },

    reset: () => {
      if (comboResetTimer) {
        clearTimeout(comboResetTimer);
        comboResetTimer = null;
      }
      set({
        combo: initialCombo(),
        comboDisplay: initialComboDisplay(),
        unlocks: initialUnlocks(),
        sessionStats: initialStats(),
        perfectRun: initialPerfectRun(),
        completionCelebration: initialCelebration(),
        moduleHits: {},
      });
    },
  };
});
