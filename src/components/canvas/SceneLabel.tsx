import React, { Suspense } from 'react';
import { Text } from '@react-three/drei';

/**
 * drei's Text suspends while troika fetches font data from a CDN
 * (cdn.jsdelivr.net). If that host is unreachable — offline PWA use, blocked
 * networks — the promise never settles and every ancestor Suspense hangs,
 * which used to black-screen the entire scene. Each label gets its own
 * Suspense island so the worst case is just a missing label.
 */
export const SceneLabel = (props: React.ComponentProps<typeof Text>) => (
  <Suspense fallback={null}>
    <Text {...props} />
  </Suspense>
);
