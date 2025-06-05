import { Engine, Render, World, Bodies, Body, Events, Vector } from 'matter-js';
import { PatchNode } from '../types/db.types';

export interface PhysicsWorld {
  engine: Engine;
  render: Render;
  world: World;
  bodies: Map<string, Body>;
}

export interface CollisionEvent {
  nodeId: string;
  velocity: number;
  position: { x: number; y: number };
  timestamp: number;
}

export class PhysicsEngine {
  private world: PhysicsWorld | null = null;
  private onCollision?: (event: CollisionEvent) => void;

  constructor(canvasElement: HTMLCanvasElement, onCollision?: (event: CollisionEvent) => void) {
    this.onCollision = onCollision;
    this.initWorld(canvasElement);
  }

  private initWorld(canvasElement: HTMLCanvasElement) {
    // Create engine
    const engine = Engine.create();
    engine.world.gravity.y = 0.8; // Gravity for marble physics

    // Create renderer
    const render = Render.create({
      canvas: canvasElement,
      engine: engine,
      options: {
        width: canvasElement.width || 800,
        height: canvasElement.height || 600,
        background: 'transparent',
        wireframes: false,
        showVelocity: false,
        showAngleIndicator: false,
        showDebug: false
      }
    });

    this.world = {
      engine,
      render,
      world: engine.world,
      bodies: new Map()
    };

    // Set up collision detection
    Events.on(engine, 'collisionStart', (event: any) => {
      this.handleCollisions(event.pairs);
    });

    // Start the engine
    Engine.run(engine);
    Render.run(render);
  }

  private handleCollisions(pairs: any[]) {
    if (!this.onCollision || !this.world) return;

    pairs.forEach(pair => {
      const { bodyA, bodyB } = pair;
      
      // Find which body is the marble and which is the target
      const marble = bodyA.label === 'marble' ? bodyA : bodyB.label === 'marble' ? bodyB : null;
      const target = bodyA.label !== 'marble' ? bodyA : bodyB;

      if (marble && target && target.nodeId) {
        const velocity = Vector.magnitude(marble.velocity);
        
        if (this.onCollision) {
          this.onCollision({
            nodeId: target.nodeId,
            velocity,
            position: { x: target.position.x, y: target.position.y },
            timestamp: Date.now()
          });
        }
      }
    });
  }

  addNode(node: PatchNode): Body | null {
    if (!this.world) return null;

    let body: Body;

    switch (node.type) {
      case 'marble':
        body = Bodies.circle(node.position.x, node.position.y, 10, {
          label: 'marble',
          restitution: 0.8,
          frictionAir: 0.01,
          render: {
            fillStyle: '#FF6B6B'
          }
        });
        break;

      case 'bumper':
        body = Bodies.circle(node.position.x, node.position.y, 20, {
          isStatic: true,
          label: 'bumper',
          restitution: 1.5,
          render: {
            fillStyle: '#4ECDC4'
          }
        });
        break;

      case 'gear':
        body = Bodies.polygon(node.position.x, node.position.y, 8, 25, {
          isStatic: true,
          label: 'gear',
          render: {
            fillStyle: '#45B7D1'
          }
        });
        break;

      default:
        // For synth modules (osc, filter, etc.), create rectangular bodies
        const width = node.size?.width || 60;
        const height = node.size?.height || 40;
        body = Bodies.rectangle(node.position.x, node.position.y, width, height, {
          isStatic: true,
          label: node.type,
          render: {
            fillStyle: '#96CEB4'
          }
        });
    }

    // Store node reference
    (body as any).nodeId = node.id;
    
    // Add to world
    World.add(this.world.world, body);
    this.world.bodies.set(node.id, body);

    return body;
  }

  removeNode(nodeId: string): void {
    if (!this.world) return;

    const body = this.world.bodies.get(nodeId);
    if (body) {
      World.remove(this.world.world, body);
      this.world.bodies.delete(nodeId);
    }
  }

  updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    if (!this.world) return;

    const body = this.world.bodies.get(nodeId);
    if (body) {
      Body.setPosition(body, { x: position.x, y: position.y });
    }
  }

  addMarble(position: { x: number; y: number }): string {
    const marbleId = `marble-${Date.now()}`;
    const marbleNode: PatchNode = {
      id: marbleId,
      type: 'marble',
      position,
      params: {}
    };

    this.addNode(marbleNode);
    return marbleId;
  }

  applyForce(nodeId: string, force: { x: number; y: number }): void {
    if (!this.world) return;

    const body = this.world.bodies.get(nodeId);
    if (body) {
      Body.applyForce(body, body.position, force);
    }
  }

  resize(width: number, height: number): void {
    if (!this.world) return;

    this.world.render.canvas.width = width;
    this.world.render.canvas.height = height;
    this.world.render.options.width = width;
    this.world.render.options.height = height;
  }

  destroy(): void {
    if (!this.world) return;

    Render.stop(this.world.render);
    Engine.clear(this.world.engine);
    this.world.render.canvas.remove();
    this.world = null;
  }
}