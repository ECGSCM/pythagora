// Physics collision event types.
// Rescued from the deleted 2D physics engine (Phase 1 demolition) and
// extended to the 3D shape in Phase 3 — this is now THE collision event type
// used everywhere (App handler, Physics3DCanvas, audio engine). The old
// `Collision3DEvent` from the deleted synth bridge is gone.

import type { PatchNode } from './patch';

export interface CollisionEvent {
  nodeId: string;
  velocity: number;
  position: { x: number; y: number; z: number };
  timestamp: number;
  /**
   * The struck module's patch type, when the physics body carried it in
   * userData. Lets the audio engine dispatch by exact type instead of a
   * nodeId substring scan (which is order-dependent — e.g. a nodeId containing
   * both "bell" and another token). Optional so events without it still work.
   */
  moduleType?: PatchNode['type'];
}
