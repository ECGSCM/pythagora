import React from 'react';
import type { PatchNode } from '../../types/patch';
import { Ramp } from './modules/Ramp';
import { Bumper } from './modules/Bumper';
import { Chime } from './modules/Chime';
import { Spinner } from './modules/Spinner';
import { Funnel } from './modules/Funnel';
import { Seesaw } from './modules/Seesaw';
import { Bell } from './modules/Bell';
import type { Vec3 } from './types';

function renderModule(node: PatchNode) {
  const position: Vec3 = [node.position.x, node.position.y, 0];
  switch (node.type) {
    case 'ramp':
      return <Ramp key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'bumper':
      return <Bumper key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'chime':
      return <Chime key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'spinner':
      return <Spinner key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'funnel':
      return <Funnel key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'seesaw':
      return <Seesaw key={node.id} position={position} nodeId={node.id} params={node.params} />;
    case 'bell':
      return <Bell key={node.id} position={position} nodeId={node.id} params={node.params} />;
    default:
      return null;
  }
}

// Maps the patch nodes to module components. Memoized on `nodes`, so
// ripple/marble state changes in Scene never re-render the modules; each module
// self-subscribes to its own hit timestamp for the flash.
export const Modules = React.memo(({ nodes }: { nodes: PatchNode[] }) => <>{nodes.map(renderModule)}</>);
Modules.displayName = 'Modules';
