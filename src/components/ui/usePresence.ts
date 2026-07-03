// Presence system (EXPERIENCE_DESIGN.md §4.1): "the UI exists to disappear".
//
// Tracks whether the user has touched the page recently. A single idle timer
// is armed on mount and re-armed on every activity event; the hook only
// triggers a React re-render on present-state TRANSITIONS (true->false or
// false->true), never on the activity events themselves — so a mousemove
// storm doesn't thrash the overlay tree. Keyboard shortcuts keep working
// while the UI is faded because nothing here unmounts anything; callers just
// read `present` to drive opacity/pointerEvents.

import { useEffect, useRef, useState } from 'react';
import { PRESENCE } from '../../config/experience';

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Dev/QA escape hatch: `?presenceIdleMs=<n>` overrides the 30s idle timeout
 * so the fade can be exercised quickly (e.g. in Playwright smoke tests)
 * without waiting out the real timer. Invalid/absent values fall back to the
 * configured default; harmless to leave in production builds.
 */
function readIdleMsOverride(): number {
  if (typeof window === 'undefined') return PRESENCE.idleMs;
  const raw = new URLSearchParams(window.location.search).get('presenceIdleMs');
  if (raw === null) return PRESENCE.idleMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PRESENCE.idleMs;
}

export function usePresence(): boolean {
  const [present, setPresent] = useState(true);
  const presentRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const idleMs = readIdleMsOverride();

    const goIdle = () => {
      if (presentRef.current) {
        presentRef.current = false;
        setPresent(false);
      }
    };

    const markActive = () => {
      if (!presentRef.current) {
        presentRef.current = true;
        setPresent(true);
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(goIdle, idleMs);
    };

    // Arm the initial countdown immediately (mirrors "activity just happened"
    // — the user is presumably present at mount time).
    markActive();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActive, { passive: true });
    }

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActive);
      }
    };
  }, []);

  return present;
}
