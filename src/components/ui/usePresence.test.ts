import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresence } from './usePresence';
import { PRESENCE } from '../../config/experience';

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts present', () => {
    const { result } = renderHook(() => usePresence());
    expect(result.current).toBe(true);
  });

  it('goes idle after PRESENCE.idleMs with no activity', () => {
    const { result } = renderHook(() => usePresence());
    act(() => {
      vi.advanceTimersByTime(PRESENCE.idleMs);
    });
    expect(result.current).toBe(false);
  });

  it('returns to present on pointer activity, and re-arms the idle timer', () => {
    const { result } = renderHook(() => usePresence());
    act(() => {
      vi.advanceTimersByTime(PRESENCE.idleMs);
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current).toBe(true);

    // Half the idle window: still present.
    act(() => {
      vi.advanceTimersByTime(PRESENCE.idleMs / 2);
    });
    expect(result.current).toBe(true);

    // Full idle window from the last activity: idle again.
    act(() => {
      vi.advanceTimersByTime(PRESENCE.idleMs / 2);
    });
    expect(result.current).toBe(false);
  });

  it('keydown activity also resets presence', () => {
    const { result } = renderHook(() => usePresence());
    act(() => {
      vi.advanceTimersByTime(PRESENCE.idleMs);
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });
    expect(result.current).toBe(true);
  });

  it('cleans up its listeners and timer on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePresence());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    removeSpy.mockRestore();
  });
});
