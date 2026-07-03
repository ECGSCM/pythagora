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
import type { PatchNode } from '../types/patch';
import { GAMEPLAY, calculateMultiplier } from '../config/world';

/** A moduleHits record past this many keys gets trimmed (see registerCollision). */
const MODULE_HITS_CAP = 64;

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

/** The harmony key change that drives the Aurora pulse (§3.4). */
export interface ModulationState {
  index: number;
  name: string;
  at: number; // Date.now() when the key stepped
}

interface GameState {
  combo: ComboState;
  comboDisplay: ComboDisplayState;
  unlocks: UnlocksState;
  sessionStats: SessionStats;
  perfectRun: PerfectRunState;
  completionCelebration: CompletionCelebrationState;
  /** Most recent harmony modulation (null until the first key step). */
  modulation: ModulationState | null;
  /** Timestamp of the most recent marble hit per module id — drives hit flash. */
  moduleHits: Record<string, number>;
  /**
   * Single source of truth for the currently-selected placement type
   * (keyboard 1-8 / ModuleSelector). Scene's pointer-down handler reads this
   * via `useGameStore.getState()` at click time — not from a React prop — so
   * a same-tick "press 5, then click" can never place the stale selection
   * (COMMERCIAL_GRADE_PLAN.md §7C "selection race").
   */
  selectedModuleType: PatchNode['type'];

  /** Port of Scene.handleCollision's combo/unlock/stats/perfect-run update. */
  registerCollision: (event: CollisionEvent) => void;
  /** The harmony key stepped — fire the Aurora pulse. */
  setModulation: (index: number, name: string) => void;
  /** A marble finished its run: bump the completion celebration. */
  marbleCompleted: () => void;
  /** The celebration animation finished (or was dismissed). */
  clearCelebration: () => void;
  /** Reset all gameplay state (and cancel the pending combo-reset timer). */
  reset: () => void;
  /** Change the selected placement type (keyboard shortcut or ModuleSelector click). */
  setSelectedModuleType: (type: PatchNode['type']) => void;
  /**
   * Drop all module-hit flash timestamps. Called on Clear All (and would be
   * called on any future per-node removal) so the record doesn't keep
   * flash entries for modules that no longer exist in the scene.
   */
  clearModuleHits: () => void;
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

// Session epoch: incremented by reset(). Every anonymous display-hide timeout
// (comboDisplay, perfectRun, unlock flash, celebration) captures the epoch when
// it is armed and no-ops if the epoch has since changed, so a timer armed in one
// session can't fire its state change into the NEXT session after ESC → reset →
// re-enter.
let sessionEpoch = 0;

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
    modulation: null,
    moduleHits: {},
    selectedModuleType: 'marble',

    setModulation: (index, name) => {
      set({ modulation: { index, name, at: Date.now() } });
    },

    registerCollision: (event) => {
      const { combo, unlocks, sessionStats, perfectRun, moduleHits } = get();
      const epoch = sessionEpoch;

      const now = Date.now();
      const timeSinceLastCollision = now - combo.lastCollisionTime;

      // Accumulate every slice change into a single update object so one
      // collision fires exactly one store notification (the old code fanned
      // out up to 8 set() calls per hit). Behaviour is unchanged — only the
      // notification count differs.
      // Flash the struck module (P11).
      const nextHits: Record<string, number> = { ...moduleHits, [event.nodeId]: event.timestamp };
      // Unbounded growth guard (diagnosis #4): a long session hits one entry
      // per distinct module ever struck. Object.keys on a plain object with
      // string keys preserves insertion order, so once the record passes the
      // cap, dropping the oldest half keeps it bounded while still retaining
      // every module that could plausibly still be mid-flash.
      if (Object.keys(nextHits).length > MODULE_HITS_CAP) {
        const keys = Object.keys(nextHits);
        const dropCount = Math.floor(keys.length / 2);
        for (let i = 0; i < dropCount; i++) delete nextHits[keys[i]];
      }

      const updates: Partial<GameState> = { moduleHits: nextHits };

      if (timeSinceLastCollision < GAMEPLAY.comboTimeoutMs) {
        // Continue combo.
        const newCombo = combo.count + 1;
        const newMultiplier = calculateMultiplier(newCombo);
        updates.combo = { ...combo, count: newCombo, multiplier: newMultiplier, lastCollisionTime: now };

        // Update session stats.
        updates.sessionStats = {
          totalCollisions: sessionStats.totalCollisions + 1,
          maxCombo: Math.max(sessionStats.maxCombo, newCombo),
          totalScore: sessionStats.totalScore + GAMEPLAY.scorePerHit * newMultiplier,
        };

        // Show combo display if the multiplier increased.
        if (newMultiplier > combo.multiplier) {
          updates.comboDisplay = { show: true, text: `${newMultiplier}x COMBO!`, scale: 1.5 };
          setTimeout(() => {
            if (sessionEpoch !== epoch) return;
            set({ comboDisplay: { ...get().comboDisplay, show: false, scale: 1 } });
          }, GAMEPLAY.comboDisplayHideMs);
        }

        // Check for perfect run (high combo without misses).
        if (newCombo >= GAMEPLAY.perfectRunThreshold && !perfectRun.active) {
          updates.perfectRun = { active: true, flawlessHits: newCombo };
          setTimeout(() => {
            if (sessionEpoch !== epoch) return;
            set({ perfectRun: { active: false, flawlessHits: 0 } });
          }, GAMEPLAY.perfectRunHideMs);
        }

        // Update flawless hits counter (uses the pre-update perfectRun.active,
        // matching the old async-setState semantics).
        if (perfectRun.active) {
          updates.perfectRun = { ...perfectRun, flawlessHits: newCombo };
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
        updates.unlocks = newUnlocks;

        if (unlockTriggered) {
          // Trigger the color-dimension visual effect instead of text.
          updates.comboDisplay = { show: true, text: '', scale: 0 };
          setTimeout(() => {
            if (sessionEpoch !== epoch) return;
            set({ comboDisplay: { ...get().comboDisplay, show: false, scale: 1 } });
          }, GAMEPLAY.unlockDisplayHideMs);
        }
      } else {
        // Reset combo. The first hit of every session lands here (lastCollision
        // starts at 0), so maxCombo must be lifted to at least 1 and any stale
        // perfect-run banner cleared — otherwise it could outlive a broken chain.
        updates.combo = { ...combo, count: 1, multiplier: 1, lastCollisionTime: now };
        updates.sessionStats = {
          ...sessionStats,
          totalCollisions: sessionStats.totalCollisions + 1,
          maxCombo: Math.max(sessionStats.maxCombo, 1),
          totalScore: sessionStats.totalScore + GAMEPLAY.scorePerHit,
        };
        updates.perfectRun = { active: false, flawlessHits: 0 };
      }

      set(updates);
      armComboResetTimer();
    },

    marbleCompleted: () => {
      const epoch = sessionEpoch;
      set({
        completionCelebration: {
          enabled: true,
          marblesCompleted: get().completionCelebration.marblesCompleted + 1,
        },
      });
      setTimeout(() => {
        if (sessionEpoch !== epoch) return;
        set({ completionCelebration: { ...get().completionCelebration, enabled: false } });
      }, GAMEPLAY.celebrationHideMs);
    },

    clearCelebration: () => {
      set({ completionCelebration: { ...get().completionCelebration, enabled: false } });
    },

    reset: () => {
      // Advance the epoch so any display-hide timers armed in the prior session
      // no-op when they fire (see sessionEpoch note above).
      sessionEpoch += 1;
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
        modulation: null,
        moduleHits: {},
        // selectedModuleType deliberately survives reset(): it's a UI
        // preference (what's currently armed for placement), not gameplay
        // state, and the old App-level `useState` never reset it either when
        // re-entering from the landing page.
      });
    },

    setSelectedModuleType: (type) => set({ selectedModuleType: type }),

    clearModuleHits: () => set({ moduleHits: {} }),
  };
});
