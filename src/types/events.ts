// Physics collision event types.
// Rescued from the deleted 2D physics engine (Phase 1 demolition) and
// extended to the 3D shape in Phase 3 — this is now THE collision event type
// used everywhere (App handler, Physics3DCanvas, audio engine). The old
// `Collision3DEvent` from the deleted synth bridge is gone.

export interface CollisionEvent {
  nodeId: string;
  velocity: number;
  position: { x: number; y: number; z: number };
  timestamp: number;
}
