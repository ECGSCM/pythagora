// Shared canvas hooks: a stable-callback hook and an imperative hit-flash
// driver. (SceneLabel lives in ./SceneLabel so this file exports only hooks —
// keeps react-refresh happy.)

import { useRef, useCallback, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../stores/gameStore';
import { HIT_FLASH } from '../../config/world';

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
 */
export function useHitFlash(
  nodeId: string,
  baseColor: string,
  flashColor: string,
  durationMs: number,
) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const hitAt = useGameStore((s) => s.moduleHits[nodeId]);
  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const active = hitAt !== undefined && Date.now() - hitAt < durationMs;
    mat.color.set(active ? flashColor : baseColor);
    mat.emissive.set(active ? flashColor : baseColor);
    mat.emissiveIntensity = active ? HIT_FLASH.emissiveActive : HIT_FLASH.emissiveIdle;
  });
  return matRef;
}
