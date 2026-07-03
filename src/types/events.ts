// Physics collision event types.
// Rescued from the deleted 2D `engines/physics.ts` (Phase 1 demolition).

export interface CollisionEvent {
  nodeId: string;
  velocity: number;
  position: { x: number; y: number };
  timestamp: number;
}
