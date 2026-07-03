// Shared prop/type definitions for the canvas module + marble components.

import type { PatchNode } from '../../types/patch';
import type { CollisionEvent } from '../../types/events';
import type { Vec3 } from '../../config/world';

export type { Vec3 };
export type ModuleParams = PatchNode['params'];
export type CollisionHandler = (event: CollisionEvent) => void;

/** A live marble tracked in Scene state (maps 1:1 to a mounted <Marble>). */
export interface MarbleState {
  id: string;
  position: Vec3;
}

/** Common props for the static playfield modules. */
export interface StaticModuleProps {
  position: Vec3;
  nodeId: string;
  params: ModuleParams;
}
