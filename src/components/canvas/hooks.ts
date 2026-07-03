// Shared canvas hooks: a stable-callback hook and an imperative hit-flash
// driver. (SceneLabel lives in ./SceneLabel so this file exports only hooks —
// keeps react-refresh happy.)

import { useRef, useCallback, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../stores/gameStore';
import { HIT_FLASH, BREATH } from '../../config/world';

const TWO_PI = Math.PI * 2;

/**
 * Pure shared breathing clock (§3.3): a 0..1 sine with a 5s period. Consumers
 * call it from their own `useFrame` with `state.clock.elapsedTime`, so the
 * whole world pulses off one wall clock (no state, no per-frame allocation).
 */
export function breathValue(t: number, phaseOffset = 0): number {
  return 0.5 + 0.5 * Math.sin((t / BREATH.periodSec) * TWO_PI + phaseOffset);
}

/** Map the 0..1 breath onto the resting emissive band (0.06..0.14). */
export function breathEmissive(t: number, phaseOffset = 0): number {
  return BREATH.emissiveMin + breathValue(t, phaseOffset) * (BREATH.emissiveMax - BREATH.emissiveMin);
}

/**
 * A ref-readable breath value updated once per frame. `breathValue` is usually
 * simpler (consumers read it directly in their own frame loop), but this exists
 * for callers that want the shared 0..1 signal without wiring the clock
 * themselves.
 */
export function useBreath(phaseOffset = 0): React.RefObject<number> {
  const ref = useRef(0);
  useFrame((state) => {
    ref.current = breathValue(state.clock.elapsedTime, phaseOffset);
  });
  return ref;
}

/**
 * Drives resting emissive breathing on a standard material (§3.3), for modules
 * that don't flash on hit. Returns a material ref to attach.
 */
export function useEmissiveBreath(phaseOffset = 0) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const mat = matRef.current;
    if (mat) mat.emissiveIntensity = breathEmissive(state.clock.elapsedTime, phaseOffset);
  });
  return matRef;
}

/**
 * Returns a stable function that always calls the latest version of the
 * handler. Physics body factories (useSphere/useBox/...) register their event
 * callbacks exactly once at mount, so passing a raw closure freezes whatever
 * state it captured — the root cause of the broken combo system
 * (REFACTORING_PLAN.md P4). Routing calls through a ref keeps the body's
 * callback pointing at fresh state without re-creating the body.
 */
export function useLiveCallback<Args extends unknown[]>(
  handler: (...args: Args) => void,
): (...args: Args) => void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args: Args) => handlerRef.current(...args), []);
}

/**
 * Drives a hit-flash on a material imperatively from the frame loop, based on
 * the timestamp of the module's most recent marble hit (read from the store by
 * node id). Avoids per-hit React re-renders of unrelated modules and works no
 * matter how the hit was delivered.
 *
 * Hit = light (§3.1): a hit spikes emissiveIntensity to a bloom-blowing peak and
 * decays exponentially (τ ≈ 100ms → ~300ms glow) back into the resting breath
 * (§3.3), so the light shares the sound's decay shape. The color swaps to
 * moonlight for the module's configured flash duration, then settles back.
 */
export function useHitFlash(
  nodeId: string,
  baseColor: string,
  flashColor: string,
  durationMs: number,
  breathPhase = 0,
) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const hitAt = useGameStore((s) => s.moduleHits[nodeId]);
  useFrame((state) => {
    const mat = matRef.current;
    if (!mat) return;
    const rest = breathEmissive(state.clock.elapsedTime, breathPhase);
    let emissive = rest;
    let colored = false;
    if (hitAt !== undefined) {
      const dt = Date.now() - hitAt;
      // Exponential bloom spike decaying into the resting breath.
      emissive = rest + HIT_FLASH.emissivePeak * Math.exp(-dt / HIT_FLASH.emissiveDecayMs);
      colored = dt < durationMs;
    }
    mat.emissiveIntensity = emissive;
    mat.color.set(colored ? flashColor : baseColor);
    mat.emissive.set(colored ? flashColor : baseColor);
  });
  return matRef;
}
