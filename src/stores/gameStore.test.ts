import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { CollisionEvent } from '../types/events';

function hit(nodeId = 'bumper-1'): CollisionEvent {
  return {
    nodeId,
    velocity: 5,
    position: { x: 0, y: 0, z: 0 },
    timestamp: Date.now(),
  };
}

// Fire N collisions back-to-back (no time advance), building a combo.
function combo(n: number, nodeId = 'bumper-1') {
  const { registerCollision } = useGameStore.getState();
  for (let i = 0; i < n; i++) registerCollision(hit(nodeId));
}

describe('gameStore.registerCollision', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments combo count and session stats on each hit', () => {
    combo(1);
    const s = useGameStore.getState();
    expect(s.combo.count).toBe(1);
    expect(s.combo.multiplier).toBe(1);
    expect(s.sessionStats.totalCollisions).toBe(1);
    expect(s.sessionStats.maxCombo).toBe(1);
    expect(s.sessionStats.totalScore).toBe(10);
    // Module flash timestamp recorded.
    expect(s.moduleHits['bumper-1']).toBe(0);
  });

  it('lifts maxCombo to 1 on the first isolated hit at a realistic clock', () => {
    // With a realistic wall clock the first hit takes the reset branch
    // (lastCollisionTime starts at 0, so the gap exceeds the combo timeout).
    // At system time 0 that branch is never reached, which masked a bug where
    // the reset branch never updated maxCombo.
    vi.setSystemTime(1_700_000_000_000);
    useGameStore.getState().registerCollision(hit());
    const s = useGameStore.getState();
    expect(s.combo.count).toBe(1);
    expect(s.sessionStats.totalCollisions).toBe(1);
    expect(s.sessionStats.maxCombo).toBe(1);
    // A stale perfect-run banner must not survive the reset branch.
    expect(s.perfectRun).toEqual({ active: false, flawlessHits: 0 });
  });

  it('raises the multiplier through its tiers as the combo grows', () => {
    combo(5);
    expect(useGameStore.getState().combo.multiplier).toBe(2); // >= 5
    combo(5); // 10 total
    expect(useGameStore.getState().combo.multiplier).toBe(3); // >= 10
    combo(5); // 15 total
    expect(useGameStore.getState().combo.multiplier).toBe(4); // >= 15
    combo(5); // 20 total
    expect(useGameStore.getState().combo.multiplier).toBe(5); // >= 20
  });

  it('accumulates score using the active multiplier', () => {
    combo(4); // 4 hits at 1x = 40
    expect(useGameStore.getState().sessionStats.totalScore).toBe(40);
    combo(1); // 5th hit at 2x = +20 -> 60
    expect(useGameStore.getState().sessionStats.totalScore).toBe(60);
  });

  it('unlocks features at the combo thresholds', () => {
    combo(5);
    expect(useGameStore.getState().unlocks.enhancedParticles).toBe(true);
    expect(useGameStore.getState().unlocks.goldenMarble).toBe(false);

    combo(5); // 10
    expect(useGameStore.getState().unlocks.goldenMarble).toBe(true);

    combo(5); // 15
    expect(useGameStore.getState().unlocks.rainbowRipples).toBe(true);
    expect(useGameStore.getState().perfectRun.active).toBe(true);
    expect(useGameStore.getState().perfectRun.flawlessHits).toBe(15);

    combo(5); // 20
    expect(useGameStore.getState().unlocks.goldenMode).toBe(true);
  });

  it('shows the combo banner when the multiplier increases, then hides it', () => {
    // The multiplier tiers (5/10/15/20) coincide exactly with the unlock
    // thresholds, so the unlock branch runs on the same hit and overwrites the
    // "Nx COMBO!" text with the empty color-dimension flash — matching the old
    // Scene.handleCollision ordering.
    combo(5); // crosses into 2x AND unlocks enhancedParticles
    expect(useGameStore.getState().comboDisplay.show).toBe(true);
    expect(useGameStore.getState().comboDisplay.text).toBe('');
    // The multiplier banner's 1000ms timer hides it first.
    vi.advanceTimersByTime(1000);
    expect(useGameStore.getState().comboDisplay.show).toBe(false);
  });

  it('hides the perfect-run indicator after its timeout', () => {
    combo(15);
    expect(useGameStore.getState().perfectRun.active).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(useGameStore.getState().perfectRun.active).toBe(false);
  });

  it('resets the combo after the timeout window of silence', () => {
    combo(3);
    expect(useGameStore.getState().combo.count).toBe(3);
    vi.advanceTimersByTime(2000); // fires the re-armed combo-reset timer
    expect(useGameStore.getState().combo.count).toBe(0);
    expect(useGameStore.getState().combo.multiplier).toBe(1);
  });

  it('restarts the combo at 1 when a hit lands after the timeout gap', () => {
    combo(3);
    vi.setSystemTime(3000); // gap > comboTimeoutMs, without running timers
    useGameStore.getState().registerCollision(hit());
    const s = useGameStore.getState();
    expect(s.combo.count).toBe(1);
    expect(s.combo.multiplier).toBe(1);
    expect(s.sessionStats.totalCollisions).toBe(4);
  });
});

describe('gameStore completion + reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marbleCompleted enables the celebration and auto-clears it', () => {
    useGameStore.getState().marbleCompleted();
    let s = useGameStore.getState();
    expect(s.completionCelebration.enabled).toBe(true);
    expect(s.completionCelebration.marblesCompleted).toBe(1);
    vi.advanceTimersByTime(2000);
    s = useGameStore.getState();
    expect(s.completionCelebration.enabled).toBe(false);
    expect(s.completionCelebration.marblesCompleted).toBe(1);
  });

  it('reset returns every slice to its initial value', () => {
    combo(12);
    useGameStore.getState().marbleCompleted();
    useGameStore.getState().reset();

    const s = useGameStore.getState();
    expect(s.combo).toEqual({ count: 0, multiplier: 1, lastCollisionTime: 0 });
    expect(s.unlocks).toEqual({
      enhancedParticles: false,
      goldenMarble: false,
      rainbowRipples: false,
      goldenMode: false,
    });
    expect(s.sessionStats).toEqual({ totalCollisions: 0, maxCombo: 0, totalScore: 0 });
    expect(s.perfectRun).toEqual({ active: false, flawlessHits: 0 });
    expect(s.completionCelebration).toEqual({ enabled: false, marblesCompleted: 0 });
    expect(s.moduleHits).toEqual({});
  });

  it('reset does not touch the selected module type (a UI preference, not gameplay state)', () => {
    useGameStore.getState().setSelectedModuleType('bumper');
    useGameStore.getState().reset();
    expect(useGameStore.getState().selectedModuleType).toBe('bumper');
  });
});

describe('gameStore.selectedModuleType (§7C selection race fix)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setSelectedModuleType('marble');
  });

  it('defaults to marble', () => {
    expect(useGameStore.getState().selectedModuleType).toBe('marble');
  });

  it('setSelectedModuleType commits synchronously, so a getState() read right after sees the new value', () => {
    useGameStore.getState().setSelectedModuleType('spinner');
    // No await/tick advance — this is the exact "press 5, then click in the
    // same tick" scenario Scene's pointer handler must see correctly.
    expect(useGameStore.getState().selectedModuleType).toBe('spinner');
  });
});

describe('gameStore.clearModuleHits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empties the moduleHits record', () => {
    useGameStore.getState().registerCollision(hit('bumper-1'));
    expect(useGameStore.getState().moduleHits).not.toEqual({});
    useGameStore.getState().clearModuleHits();
    expect(useGameStore.getState().moduleHits).toEqual({});
  });
});

describe('gameStore.registerCollision moduleHits cap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops the oldest half once the record passes 64 distinct modules', () => {
    for (let i = 0; i < 70; i++) {
      useGameStore.getState().registerCollision(hit(`module-${i}`));
    }
    const { moduleHits } = useGameStore.getState();
    const keys = Object.keys(moduleHits);
    // 70 hits -> cap trips once size exceeds 64, dropping the oldest half
    // repeatedly; the record must never be allowed to grow unbounded, and the
    // most-recently-hit module must always survive.
    expect(keys.length).toBeLessThanOrEqual(64);
    expect(moduleHits['module-69']).toBeDefined();
    expect(moduleHits['module-0']).toBeUndefined();
  });
});
