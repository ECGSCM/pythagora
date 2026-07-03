// Lightweight shared registry of live marble positions.
//
// Each <Marble> mutates a single THREE.Vector3 in place every frame (fed by the
// cannon position subscription) and registers it here on mount, deleting it on
// unmount. Consumers that need a marble's CURRENT world position without a React
// re-render (CameraFlow) read straight from this map — the Vector3 objects are
// shared by reference, so reads always see the latest coordinates.

import * as THREE from 'three';

export const marblePositions = new Map<string, THREE.Vector3>();

/**
 * The most recently spawned marble's live position, or null when none are alive.
 * Map preserves insertion order, so the last value is the newest marble; the
 * scan is O(n) with n ≤ spawnCap (10) and allocates nothing.
 */
export function newestMarblePosition(): THREE.Vector3 | null {
  let last: THREE.Vector3 | null = null;
  for (const v of marblePositions.values()) last = v;
  return last;
}
