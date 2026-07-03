import React, { useRef, useEffect, useState, useCallback, useLayoutEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  Box,
  Sphere,
  Cylinder,
  Text,
  ContactShadows,
  PerspectiveCamera,
  MeshReflectorMaterial,
  Plane
} from '@react-three/drei';
import { Physics, useSphere, useBox, useCylinder, useCompoundBody, usePlane, useHingeConstraint } from '@react-three/cannon';
import { SynthBridge3D, type Collision3DEvent } from '../engines/synthBridge3D';
import { PatchNode } from '../types/patch';
import { Box as MUIBox, IconButton, Tooltip, Typography } from '@mui/material';
import * as THREE from 'three';

// Shared module/geometry types used throughout this file.
type Vec3 = [number, number, number];
type ModuleParams = PatchNode['params'];
type CollisionHandler = (event: Collision3DEvent) => void;

interface SessionStats {
  totalCollisions: number;
  maxCombo: number;
  totalScore: number;
}

interface UnlocksState {
  enhancedParticles: boolean;
  goldenMarble: boolean;
  rainbowRipples: boolean;
  goldenMode: boolean;
}

interface MarbleState {
  id: string;
  position: Vec3;
}

// Fixed ambient dust positions around the play area.
const ATMOSPHERE_PARTICLE_POSITIONS: Vec3[] = [
  [-9, 8, -12],
  [11, 14, 6],
  [-4, 17, 9],
  [7, 6, -8]
];

interface Physics3DCanvasProps {
  nodes: PatchNode[];
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  onCollision?: CollisionHandler;
  onModuleTypeChange?: (moduleType: PatchNode['type']) => void;
  selectedNodeType?: PatchNode['type'];
  onClearAll?: () => void;
  onToggleHelp?: () => void;
  onExit?: () => void;
}

/**
 * Returns a stable function that always calls the latest version of the
 * handler. Physics body factories (useSphere/useBox/...) register their
 * event callbacks exactly once at mount, so passing a raw closure freezes
 * whatever state it captured — the root cause of the broken combo system
 * (REFACTORING_PLAN.md P4). Routing calls through a ref keeps the body's
 * callback pointing at fresh state without re-creating the body.
 */
function useLiveCallback<Args extends unknown[]>(handler: (...args: Args) => void): (...args: Args) => void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args: Args) => handlerRef.current(...args), []);
}

/**
 * drei's Text suspends while troika fetches font data from a CDN
 * (cdn.jsdelivr.net). If that host is unreachable — offline PWA use, blocked
 * networks — the promise never settles and every ancestor Suspense hangs,
 * which used to black-screen the entire scene. Each label gets its own
 * Suspense island so the worst case is just a missing label.
 */
const SceneLabel = (props: React.ComponentProps<typeof Text>) => (
  <Suspense fallback={null}>
    <Text {...props} />
  </Suspense>
);

/**
 * Drives a hit-flash on a material imperatively from the frame loop, based on
 * the timestamp of the module's most recent marble hit. Avoids per-hit React
 * re-renders and works no matter how the hit was delivered.
 */
function useHitFlash(hitAt: number | undefined, baseColor: string, flashColor: string, durationMs: number) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const active = hitAt !== undefined && Date.now() - hitAt < durationMs;
    mat.color.set(active ? flashColor : baseColor);
    mat.emissive.set(active ? flashColor : baseColor);
    mat.emissiveIntensity = active ? 0.35 : 0.1;
  });
  return matRef;
}

// Ripple Effect Component for collisions
interface RippleProps {
  position: [number, number, number];
  color?: string;
  onComplete?: () => void;
}

const Ripple = React.memo(({ position, color = "#FF4757", onComplete }: RippleProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [life, setLife] = useState(1);
  const rippleDuration = 1.0;
  const completedRef = useRef(false);

  useFrame((_state, delta) => {
    const decay = delta / rippleDuration;
    setLife(prev => Math.max(0, prev - decay));

    if (meshRef.current) {
      const scale = 1 + (1 - life) * 3;
      meshRef.current.scale.set(scale, scale, scale);
    }

    if (life <= 0 && !completedRef.current && onComplete) {
      completedRef.current = true;
      setTimeout(() => onComplete(), 0);
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.1, 0.3, 16]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={life * 0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
});

Ripple.displayName = 'Ripple';

// Combo Display Component
interface ComboDisplayProps {
  show: boolean;
  text: string;
  scale: number;
  comboCount: number;
  multiplier: number;
}

const ComboDisplay = React.memo(({ show, text, scale, comboCount, multiplier }: ComboDisplayProps) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (meshRef.current && show) {
      // Animate scale pulse
      meshRef.current.scale.setScalar(scale);
      // Rotate slightly
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  if (!show && comboCount === 0) return null;

  // Color based on multiplier
  const colors = ['#FF4757', '#FFA502', '#FFDD59', '#00D2D3', '#5F27CD'];
  const color = colors[Math.min(multiplier - 1, 4)];

  return (
    <group ref={meshRef} position={[0, 8, 0]}>
      {show && (
        <SceneLabel
          fontSize={1.5}
          color={color}
          anchorX="center"
          anchorY="middle"
          position={[0, 0, 0]}
        >
          {text}
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.9}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </SceneLabel>
      )}
    </group>
  );
});

ComboDisplay.displayName = 'ComboDisplay';

// Camera Flow Component - Smooth camera follow with floating motion
const CameraFlow = React.memo(({ marbles }: { marbles: MarbleState[] }) => {
  const { camera } = useThree();
  const [offset] = useState(new THREE.Vector3(0, 8, 12)); // Camera offset from target

  useFrame((state, delta) => {
    if (!camera || marbles.length === 0) return;

    // Find the most recently added marble (last in array)
    const activeMarble = marbles[marbles.length - 1];
    if (!activeMarble) return;

    // Get marble position (we'll use the initial position since we don't have live tracking)
    const marblePos = new THREE.Vector3(
      activeMarble.position[0],
      activeMarble.position[1],
      activeMarble.position[2]
    );

    // Add gentle floating motion (sine wave)
    const time = state.clock.elapsedTime;
    const floatOffset = new THREE.Vector3(
      Math.sin(time * 0.3) * 2,
      Math.cos(time * 0.2) * 1,
      Math.sin(time * 0.25) * 2
    );

    // Calculate target camera position
    const target = marblePos.clone().add(offset).add(floatOffset);

    // Smooth camera movement (lerp)
    const smoothFactor = 2 * delta; // Adjust for smoothness
    camera.position.lerp(target, smoothFactor);

    // Make camera look at marble
    const lookAtTarget = marblePos.clone().add(new THREE.Vector3(0, 2, 0));
    camera.lookAt(lookAtTarget);
  });

  return null; // This component doesn't render anything, it manipulates the camera directly
});

CameraFlow.displayName = 'CameraFlow';

// Completion Celebration Component
const CompletionCelebration = React.memo(({ enabled, onComplete }: {
  enabled: boolean;
  onComplete: () => void;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [progress, setProgress] = useState(0);

  useFrame((_state, delta) => {
    if (!enabled || !groupRef.current) return;

    // Animate completion celebration
    setProgress(prev => {
      const newProgress = prev + delta * 0.5; // 2 second animation
      if (newProgress >= 1) {
        onComplete();
        return 1;
      }
      return newProgress;
    });

    // Scale effect
    const scale = 1 + Math.sin(progress * Math.PI) * 0.5;
    groupRef.current.scale.setScalar(scale);

    // Rotate effect
    groupRef.current.rotation.y += delta * 2;
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef} position={[0, 6, 0]}>
      {/* Golden ring expanding */}
      <mesh>
        <torusGeometry args={[3, 0.2, 16, 100]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={1}
          transparent
          opacity={1 - progress * 0.5}
        />
      </mesh>

      {/* "COMPLETE!" text */}
      <SceneLabel
        fontSize={2}
        color="#FFD700"
        anchorX="center"
        anchorY="middle"
        position={[0, 1, 0]}
      >
        COMPLETE!
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={0.8}
        />
      </SceneLabel>
    </group>
  );
});

CompletionCelebration.displayName = 'CompletionCelebration';

// Perfect Run Indicator
const PerfectRunIndicator = React.memo(({ active, flawlessHits }: {
  active: boolean;
  flawlessHits: number;
}) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (!active || !meshRef.current) return;

    // Gentle rotation
    meshRef.current.rotation.y += delta * 0.5;
  });

  if (!active) return null;

  return (
    <group ref={meshRef} position={[0, 10, 0]}>
      {/* Perfect run crown/star */}
      <mesh>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={1}
          metalness={1}
          roughness={0}
        />
      </mesh>

      {/* Text */}
      <SceneLabel
        fontSize={1.2}
        color="#FFD700"
        anchorX="center"
        anchorY="middle"
        position={[0, 1, 0]}
      >
        "PERFECT RUN!"
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={0.8}
        />
      </SceneLabel>

      <SceneLabel
        fontSize={0.6}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
        position={[0, -0.5, 0]}
      >
        {`${flawlessHits} flawless hits`}
        <meshStandardMaterial
          color="#FFFFFF"
          transparent
          opacity={0.8}
        />
      </SceneLabel>
    </group>
  );
});

PerfectRunIndicator.displayName = 'PerfectRunIndicator';

// Particle Trail Component
interface Particle {
  position: [number, number, number];
  life: number; // 0 to 1
  velocity: [number, number, number];
}

const ParticleTrail = React.memo(({ marblePosition, color }: { marblePosition: THREE.Vector3, color: string }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const maxParticles = 30;
  const particleLifetime = 1.5; // seconds

  useFrame((_state, delta) => {
    if (!marblePosition) return;

    // Add new particle at marble position with slight random offset
    const newParticle: Particle = {
      position: [
        marblePosition.x + (Math.random() - 0.5) * 0.1,
        marblePosition.y + (Math.random() - 0.5) * 0.1,
        marblePosition.z + (Math.random() - 0.5) * 0.1
      ],
      life: 1,
      velocity: [
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
      ]
    };

    setParticles(prev => {
      const updated = [...prev, newParticle]
        .map(p => ({
          ...p,
          life: p.life - (delta / particleLifetime),
          position: [
            p.position[0] + p.velocity[0],
            p.position[1] + p.velocity[1],
            p.position[2] + p.velocity[2]
          ] as [number, number, number]
        }))
        .filter(p => p.life > 0)
        .slice(-maxParticles);
      return updated;
    });
  });

  const particlesRef = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  // Update particle geometry
  useFrame(() => {
    if (particlesRef.current && geometryRef.current && particles.length > 0) {
      const positions = geometryRef.current.attributes.position.array as Float32Array;

      particles.forEach((p, i) => {
        positions[i * 3] = p.position[0];
        positions[i * 3 + 1] = p.position[1];
        positions[i * 3 + 2] = p.position[2];
      });

      geometryRef.current.attributes.position.needsUpdate = true;
      geometryRef.current.setDrawRange(0, particles.length);
    }
  });

  // Create geometry with max particle positions
  const positions = new Float32Array(maxParticles * 3);

  return (
    <points ref={particlesRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={maxParticles}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color={color}
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
});

ParticleTrail.displayName = 'ParticleTrail';

interface MarbleProps {
  id: string;
  position: Vec3;
  onCollide: CollisionHandler;
  /** Called once when the marble finishes its run (comes to rest or falls out of the world). */
  onSettle: (id: string) => void;
  unlocks: UnlocksState;
}

// How long a marble must sit still before it counts as "journey complete".
const MARBLE_REST_SECONDS = 2.5;
const MARBLE_REST_SPEED = 0.15;
const MARBLE_FALL_LIMIT_Y = -8;

// Enhanced Marble Component with trail effect
const Marble = React.memo(({ id, position, onCollide, onSettle, unlocks }: MarbleProps) => {
  const liveOnCollide = useLiveCallback(onCollide);
  const liveOnSettle = useLiveCallback(onSettle);

  const [ref, api] = useSphere<THREE.Mesh>(() => ({
    mass: 1,
    position,
    args: [0.3],
    material: {
      restitution: 0.7,
      friction: 0.3
    },
    onCollide: (e) => {
      const nodeId = (e.body?.userData as { nodeId?: string } | undefined)?.nodeId;
      if (nodeId) {
        // cannon-es reports contactPoint as an [x, y, z] tuple.
        const cp = e.contact?.contactPoint as number[] | undefined;
        const collisionEvent: Collision3DEvent = {
          nodeId,
          velocity: Math.abs(e.contact?.impactVelocity ?? 5),
          position: cp ? { x: cp[0], y: cp[1], z: cp[2] } : { x: 0, y: 0, z: 0 },
          timestamp: Date.now()
        };
        liveOnCollide(collisionEvent);
      }
    }
  }));

  // Live physics state, lifted out of React render (position drives the
  // trail + settle detection; velocity drives settle detection only).
  const marblePosition = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const marbleSpeed = useRef(0);
  const restTime = useRef(0);
  const settled = useRef(false);

  useEffect(() => {
    const unsubPos = api.position.subscribe((pos) => {
      marblePosition.current.set(pos[0], pos[1], pos[2]);
    });
    const unsubVel = api.velocity.subscribe((vel) => {
      marbleSpeed.current = Math.hypot(vel[0], vel[1], vel[2]);
    });
    return () => {
      unsubPos();
      unsubVel();
    };
  }, [api.position, api.velocity]);

  useFrame((_state, delta) => {
    const mesh = ref.current;
    if (mesh) {
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.02;
    }

    if (settled.current) return;

    // A marble's run ends when it falls out of the world or rests anywhere
    // (ground or module) long enough. Scene removes it and celebrates.
    if (marblePosition.current.y < MARBLE_FALL_LIMIT_Y) {
      settled.current = true;
      liveOnSettle(id);
      return;
    }
    if (marbleSpeed.current < MARBLE_REST_SPEED) {
      restTime.current += delta;
      if (restTime.current >= MARBLE_REST_SECONDS) {
        settled.current = true;
        liveOnSettle(id);
      }
    } else {
      restTime.current = 0;
    }
  });

  return (
    <group>
      {/* Local glow light for the marble */}
      <pointLight
        position={[0, 0, 0]}
        intensity={unlocks?.goldenMarble ? 0.8 : 0.5}
        color="#FFFFFF"
        distance={2}
        decay={2}
      />
      <Sphere ref={ref} args={[0.3, 32, 32]} castShadow>
        <meshStandardMaterial
          color={unlocks?.goldenMarble ? "#E0E0E0" : "#8A8A8A"}
          metalness={0.9}
          roughness={unlocks?.goldenMarble ? 0.05 : 0.1}
          emissive={unlocks?.goldenMarble ? "#E0E0E0" : "#8A8A8A"}
          emissiveIntensity={unlocks?.goldenMarble ? 0.4 : 0.2}
        />
      </Sphere>
    </group>
  );
});
Marble.displayName = 'Marble';

interface StaticModuleProps {
  position: Vec3;
  nodeId: string;
  params: ModuleParams;
  /** Timestamp of the most recent marble hit on this module (drives flash visuals). */
  hitAt?: number;
}

// Ramp Component - For guiding marbles
const Ramp = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const angleRad = (Number(params.angle ?? 15)) * Math.PI / 180;

  // The tilt must live on the physics body, not just the mesh — otherwise
  // the collider stays flat and marbles never roll (REFACTORING_PLAN.md P1).
  // The body's transform drives the group, so the mesh inherits the tilt.
  const [ref] = useBox<THREE.Group>(() => ({
    position,
    rotation: [0, 0, angleRad],
    args: [4, 0.2, 2],
    type: 'Static',
    material: { friction: 0.05, restitution: 0.2 },
    userData: { nodeId }
  }));

  return (
    <group ref={ref}>
      <Box args={[4, 0.2, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#3A3A3A"
          roughness={0.9}
          metalness={0.1}
        />
      </Box>
    </group>
  );
});
Ramp.displayName = 'Ramp';

// Enhanced Bumper Component
const Bumper = React.memo(({ position, nodeId, params, hitAt }: StaticModuleProps) => {
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: [1.2, 1.2, 0.6],
    type: 'Static',
    material: { restitution: 0.9, friction: 0.2 },
    userData: { nodeId }
  }));

  const matRef = useHitFlash(hitAt, '#3A3A3A', '#FFFFFF', 200);

  return (
    <group ref={ref}>
      <Cylinder args={[1.2, 1.2, 0.6]} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color="#3A3A3A"
          metalness={0.8}
          roughness={0.2}
          emissive="#3A3A3A"
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel
        position={[0, 0, 0.4]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ◉ {params.pitch || 'C4'}
      </SceneLabel>
    </group>
  );
});
Bumper.displayName = 'Bumper';

// Chime Component - Vertical tubes that create melodic sounds
const Chime = React.memo(({ position, nodeId, params, hitAt }: StaticModuleProps) => {
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: [0.15, 0.15, 3],
    type: 'Static',
    userData: { nodeId }
  }));

  const matRef = useHitFlash(hitAt, '#4A4A4A', '#E0E0E0', 500);

  return (
    <group ref={ref}>
      <Cylinder args={[0.15, 0.15, 3]} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color="#4A4A4A"
          metalness={0.9}
          roughness={0.1}
          emissive="#4A4A4A"
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel
        position={[0, 0, 1.7]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
      >
        ✧ {params.note || 'A4'}
      </SceneLabel>
    </group>
  );
});
Chime.displayName = 'Chime';

// Spinner Component - a kinematic paddle wheel facing the camera. The old
// version only spun the mesh while its collider stood still and its bespoke
// collision listener referenced a non-existent `ref.api` — marbles were never
// deflected (REFACTORING_PLAN.md P2). Now the physics body itself rotates
// (hub disc + two paddle bars crossing it), so marbles get struck and sound
// triggers through the normal marble-side collision path.
const Spinner = React.memo(({ position, nodeId, params }: StaticModuleProps) => {
  const speed = Number(params.speed ?? 1.0);

  // Body-local frame: the body is pre-rotated 90° about X, so local +Y points
  // at the camera (world +Z) and the wheel's face lies in the world X/Y plane.
  const [ref, api] = useCompoundBody<THREE.Group>(() => ({
    type: 'Kinematic',
    position,
    rotation: [Math.PI / 2, 0, 0],
    shapes: [
      // Hub disc (cylinder axis = local Y = world Z)
      { type: 'Cylinder', args: [0.6, 0.6, 0.4, 12], position: [0, 0, 0] },
      // Paddle bars crossing the hub, extending past it to radius 1.9
      { type: 'Box', args: [3.8, 0.35, 0.5], position: [0, 0, 0] },
      { type: 'Box', args: [0.5, 0.35, 3.8], position: [0, 0, 0] }
    ],
    userData: { nodeId }
  }));

  // Constant spin about the world Z axis; the physics transform drives the
  // group, so the visuals rotate with the collider.
  useEffect(() => {
    api.angularVelocity.set(0, 0, speed * 1.5);
  }, [api.angularVelocity, speed]);

  return (
    <group ref={ref}>
      <Cylinder args={[0.6, 0.6, 0.4, 24]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#5A5A5A"
          metalness={0.6}
          roughness={0.4}
          emissive="#5A5A5A"
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <RoundedBoxMesh args={[3.8, 0.35, 0.5]} />
      <RoundedBoxMesh args={[0.5, 0.35, 3.8]} />
    </group>
  );
});
Spinner.displayName = 'Spinner';

// Shared paddle-bar mesh for the Spinner.
const RoundedBoxMesh = ({ args }: { args: Vec3 }) => (
  <Box args={args} castShadow receiveShadow>
    <meshStandardMaterial
      color="#6A6A6A"
      metalness={0.7}
      roughness={0.3}
      emissive="#5A5A5A"
      emissiveIntensity={0.1}
    />
  </Box>
);

// Funnel Component - Spiral sound effect
const Funnel = React.memo(({ position, nodeId }: StaticModuleProps) => {
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: [2, 0.3, 2],
    type: 'Static',
    userData: { nodeId }
  }));

  return (
    <group ref={ref}>
      <Cylinder args={[2, 0.3, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#4A4A4A"
          metalness={0.7}
          roughness={0.3}
          emissive="#4A4A4A"
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel
        position={[0, 0, 1.1]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ◈
      </SceneLabel>
    </group>
  );
});
Funnel.displayName = 'Funnel';

// Seesaw Component - a real see-saw: a dynamic plank hinged onto a static
// pivot post, tilting under marble weight (the old version was a static box
// with no mechanism at all — REFACTORING_PLAN.md P3). The hinge axis is the
// world Z axis, matching the z=0 gameplay plane.
const Seesaw = React.memo(({ position, nodeId }: StaticModuleProps) => {
  const [plankRef] = useBox<THREE.Group>(() => ({
    mass: 2,
    position,
    args: [3, 0.2, 0.8],
    angularDamping: 0.6,
    linearDamping: 0.05,
    material: { friction: 0.4, restitution: 0.3 },
    userData: { nodeId }
  }));

  const [baseRef] = useCylinder<THREE.Mesh>(() => ({
    type: 'Static',
    position: [position[0], position[1] - 0.6, position[2]],
    args: [0.18, 0.4, 1.2, 12]
  }));

  // Pin the plank's center to the top of the post; free rotation about Z.
  // Connected bodies don't collide with each other (cannon default), so the
  // plank swings cleanly on the post.
  useHingeConstraint(plankRef, baseRef, {
    pivotA: [0, 0, 0],
    axisA: [0, 0, 1],
    pivotB: [0, 0.6, 0],
    axisB: [0, 0, 1]
  });

  return (
    <>
      <group ref={plankRef}>
        <Box args={[3, 0.2, 0.8]} castShadow receiveShadow>
          <meshStandardMaterial
            color="#6A6A6A"
            metalness={0.5}
            roughness={0.5}
            emissive="#6A6A6A"
            emissiveIntensity={0.1}
          />
        </Box>
      </group>
      <Cylinder ref={baseRef} args={[0.18, 0.4, 1.2, 12]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#4A4A4A"
          metalness={0.5}
          roughness={0.6}
        />
      </Cylinder>
    </>
  );
});
Seesaw.displayName = 'Seesaw';

// Bell Component - Harmonic bell sounds
const Bell = React.memo(({ position, nodeId, hitAt }: StaticModuleProps) => {
  const [ref] = useCylinder<THREE.Group>(() => ({
    position,
    args: [1, 1.5, 2],
    type: 'Static',
    userData: { nodeId }
  }));

  const matRef = useHitFlash(hitAt, '#7A7A7A', '#D0D0D0', 1000);

  return (
    <group ref={ref}>
      <Cylinder args={[1, 1.5, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          ref={matRef}
          color="#7A7A7A"
          metalness={0.9}
          roughness={0.1}
          emissive="#7A7A7A"
          emissiveIntensity={0.1}
        />
      </Cylinder>
      <SceneLabel
        position={[0, 0, 1.2]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ❖
      </SceneLabel>
    </group>
  );
});
Bell.displayName = 'Bell';

// Ground Component
const Ground = React.memo(() => {
  const [ref] = usePlane<THREE.Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -2, 0],
    type: 'Static'
  }));

  return (
    <Plane ref={ref} args={[50, 50]} receiveShadow>
      <MeshReflectorMaterial
        mirror={0.15}
        blur={[256, 256]}
        resolution={256}
        mixBlur={0.7}
        mixStrength={0.7}
        color="#0A0A0F"
        metalness={0.3}
        roughness={0.3}
      />
    </Plane>
  );
});
Ground.displayName = 'Ground';

interface SceneProps {
  nodes: PatchNode[];
  onCollision?: CollisionHandler;
  selectedNodeType?: PatchNode['type'];
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  onStatsUpdate?: (stats: SessionStats) => void;
  divineLightActive: boolean;
  marbleDropTrigger: number;
}

// 3D Scene Component
const Scene = React.memo(({ nodes, onCollision, selectedNodeType, onNodeAdd, onStatsUpdate, divineLightActive, marbleDropTrigger }: SceneProps) => {
  const [marbles, setMarbles] = useState<MarbleState[]>([]);
  const [ripples, setRipples] = useState<Array<{ id: string; position: Vec3; color: string }>>([]);

  // Combo System State
  const [comboCount, setComboCount] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [lastCollisionTime, setLastCollisionTime] = useState(0);
  const [comboDisplay, setComboDisplay] = useState({ show: false, text: '', scale: 1 });
  // `comboDisplay` itself is never rendered — the <ComboDisplay> component
  // exists but isn't mounted anywhere yet. Phase 5 asset — wired up later
  // (REFACTORING_PLAN.md §0.5/§0.6).
  void comboDisplay;
  const comboTimeoutMs = 2000; // 2 seconds to maintain combo

  // Unlock System State
  const [unlocks, setUnlocks] = useState({
    enhancedParticles: false, // 5 combo
    goldenMarble: false, // 10 combo
    rainbowRipples: false, // 15 combo
    goldenMode: false // 20 combo
  });

  // Session Stats (tracked but not displayed in 3D scene)
  const [sessionStats, setSessionStats] = useState({
    totalCollisions: 0,
    maxCombo: 0,
    totalScore: 0
  });

  // Pythagora Switch Completion System
  const [completionCelebration, setCompletionCelebration] = useState({
    enabled: false,
    marblesCompleted: 0
  });

  // Timestamp of the last marble hit per module id — drives hit-flash visuals.
  const [moduleHits, setModuleHits] = useState<Record<string, number>>({});
  const [perfectRun, setPerfectRun] = useState({
    active: false,
    flawlessHits: 0
  });

  const maxMarbles = 10;

  const addMarble = (position: Vec3) => {
    const newMarble: MarbleState = {
      id: `marble-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      position
    };
    // Cap enforced at spawn time; settled marbles are removed by onSettle.
    setMarbles(prev => [...prev, newMarble].slice(-maxMarbles));
  };

  // Handle Space key marble drops — drop onto the z=0 gameplay plane,
  // regardless of which module type is selected for placement. Processed in
  // the frame loop (not an effect) so state updates happen outside render.
  const processedDropTrigger = useRef(0);
  useFrame(() => {
    if (marbleDropTrigger > processedDropTrigger.current) {
      processedDropTrigger.current = marbleDropTrigger;
      const x = (Math.random() - 0.5) * 10;
      addMarble([x, 12, 0]);
    }
  });

  // Calculate multiplier based on combo count
  const calculateMultiplier = (combo: number): number => {
    if (combo >= 20) return 5;
    if (combo >= 15) return 4;
    if (combo >= 10) return 3;
    if (combo >= 5) return 2;
    return 1;
  };

  // Handle mouse clicks on the vertical z=0 placement plane: the click's
  // x/y are the world position — marbles spawn right where you click,
  // modules are placed right where you click (REFACTORING_PLAN.md P7).
  // The oblique camera maps clicks near the viewport edges to extreme plane
  // coordinates (even below the ground), so clamp into the play area.
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const x = THREE.MathUtils.clamp(e.point.x, -16, 16);
    const y = THREE.MathUtils.clamp(e.point.y, 0, 24);

    if (selectedNodeType === 'marble') {
      addMarble([x, Math.max(y, 0.5), 0]);
    } else {
      onNodeAdd?.({ x, y, z: 0 });
    }
  };

  // Per-module collision gate: sustained contact fires cannon collide events
  // every physics step; without a cooldown a resting marble machine-guns
  // sound/combo/ripples (REFACTORING_PLAN.md P5).
  const collisionGateRef = useRef<Map<string, number>>(new Map());
  const COLLISION_COOLDOWN_MS = 120;
  const MIN_IMPACT_VELOCITY = 1.2;

  // Handle collisions and create ripple effects
  const handleCollision = (event: Collision3DEvent) => {
    if (event.velocity < MIN_IMPACT_VELOCITY) return;
    const lastHit = collisionGateRef.current.get(event.nodeId) ?? 0;
    if (event.timestamp - lastHit < COLLISION_COOLDOWN_MS) return;
    collisionGateRef.current.set(event.nodeId, event.timestamp);

    // Flash the struck module (P11).
    setModuleHits(prev => ({ ...prev, [event.nodeId]: event.timestamp }));

    const now = Date.now();
    const timeSinceLastCollision = now - lastCollisionTime;

    // Check if combo should continue or reset
    if (timeSinceLastCollision < comboTimeoutMs) {
      // Continue combo
      const newCombo = comboCount + 1;
      const newMultiplier = calculateMultiplier(newCombo);
      setComboCount(newCombo);
      setComboMultiplier(newMultiplier);

      // Update session stats
      setSessionStats(prev => ({
        totalCollisions: prev.totalCollisions + 1,
        maxCombo: Math.max(prev.maxCombo, newCombo),
        totalScore: prev.totalScore + (10 * newMultiplier)
      }));

      // Show combo display if multiplier increased
      if (newMultiplier > comboMultiplier) {
        const multiplierText = `${newMultiplier}x COMBO!`;
        setComboDisplay({ show: true, text: multiplierText, scale: 1.5 });

        // Hide combo display after animation
        setTimeout(() => {
          setComboDisplay(prev => ({ ...prev, show: false, scale: 1 }));
        }, 1000);
      }

      // Check for perfect run (high combo without misses)
      if (newCombo >= 15 && !perfectRun.active) {
        setPerfectRun({
          active: true,
          flawlessHits: newCombo
        });

        // Hide perfect run indicator after 3 seconds
        setTimeout(() => {
          setPerfectRun({
            active: false,
            flawlessHits: 0
          });
        }, 3000);
      }

      // Update flawless hits counter
      if (perfectRun.active) {
        setPerfectRun(prev => ({
          ...prev,
          flawlessHits: newCombo
        }));
      }

      // Check for unlocks
      setUnlocks(prev => {
        const newUnlocks = { ...prev };
        let unlockTriggered = false;

        if (newCombo >= 5 && !prev.enhancedParticles) {
          newUnlocks.enhancedParticles = true;
          unlockTriggered = true;
        }
        if (newCombo >= 10 && !prev.goldenMarble) {
          newUnlocks.goldenMarble = true;
          unlockTriggered = true;
        }
        if (newCombo >= 15 && !prev.rainbowRipples) {
          newUnlocks.rainbowRipples = true;
          unlockTriggered = true;
        }
        if (newCombo >= 20 && !prev.goldenMode) {
          newUnlocks.goldenMode = true;
          unlockTriggered = true;
        }

        if (unlockTriggered) {
          // Trigger color dimension visual effect instead of text
          setComboDisplay({ show: true, text: '', scale: 0 });
          setTimeout(() => {
            setComboDisplay(prev => ({ ...prev, show: false, scale: 1 }));
          }, 2000);
        }

        return newUnlocks;
      });
    } else {
      // Reset combo
      setComboCount(1);
      setComboMultiplier(1);

      // Update session stats (reset combo)
      setSessionStats(prev => ({
        ...prev,
        totalCollisions: prev.totalCollisions + 1,
        totalScore: prev.totalScore + 10
      }));
    }

    setLastCollisionTime(now);

    // Trigger audio callback
    onCollision?.(event);

    // Create ripple at collision point with color based on multiplier/unlocks
    const rippleId = `ripple-${Date.now()}-${Math.random()}`;
    let rippleColor: string;

    if (unlocks.goldenMode && comboMultiplier >= 5) {
      // Golden mode: gold ripples
      rippleColor = '#FFD700';
    } else if (unlocks.rainbowRipples && comboMultiplier >= 4) {
      // Rainbow effect: cycle through colors
      const rainbowColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];
      rippleColor = rainbowColors[comboCount % rainbowColors.length];
    } else {
      // Standard colors based on multiplier
      const rippleColors = ['#FF4757', '#FFA502', '#FFDD59', '#00D2D3', '#5F27CD'];
      rippleColor = rippleColors[Math.min(comboMultiplier - 1, 4)];
    }

    // Limit ripples to prevent performance issues (max 5)
    setRipples(prev => {
      const newRipple: { id: string; position: [number, number, number]; color: string } = {
        id: rippleId,
        position: [event.position.x, event.position.y + 0.1, event.position.z] as [number, number, number],
        color: rippleColor
      };
      const newRipples = [...prev, newRipple];
      // Keep only the 5 most recent ripples
      return newRipples.slice(-5);
    });
  };

  // Remove ripple when animation completes
  const handleRippleComplete = (rippleId: string) => {
    setRipples(prev => prev.filter(r => r.id !== rippleId));
  };

  // Check for combo timeout
  useEffect(() => {
    if (lastCollisionTime > 0) {
      const timeoutId = setTimeout(() => {
        const timeSinceLastCollision = Date.now() - lastCollisionTime;
        if (timeSinceLastCollision >= comboTimeoutMs && comboCount > 0) {
          setComboCount(0);
          setComboMultiplier(1);
        }
      }, comboTimeoutMs);

      return () => clearTimeout(timeoutId);
    }
  }, [lastCollisionTime, comboCount, comboTimeoutMs]);

  // Notify parent of stats updates
  useEffect(() => {
    onStatsUpdate?.(sessionStats);
  }, [sessionStats, onStatsUpdate]);

  // A marble reports itself done (came to rest / fell out of the world) —
  // remove it and celebrate the completed run. This replaces the old 500ms
  // polling loop, which compared against the static spawn position and so
  // never actually detected completion (REFACTORING_PLAN.md P6).
  const handleMarbleSettle = (id: string) => {
    setMarbles(prev => {
      if (!prev.some(m => m.id === id)) return prev;
      return prev.filter(m => m.id !== id);
    });

    setCompletionCelebration(prev => ({
      enabled: true,
      marblesCompleted: prev.marblesCompleted + 1
    }));
    setTimeout(() => {
      setCompletionCelebration(prev => ({ ...prev, enabled: false }));
    }, 2000);
  };

  // Module renderer
  const renderModule = (node: PatchNode) => {
    const position: Vec3 = [
      node.position.x,
      node.position.y,
      0
    ];

    const hitAt = moduleHits[node.id];

    switch (node.type) {
      case 'ramp':
        return <Ramp key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'bumper':
        return <Bumper key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'chime':
        return <Chime key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'spinner':
        return <Spinner key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'funnel':
        return <Funnel key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'seesaw':
        return <Seesaw key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      case 'bell':
        return <Bell key={node.id} position={position} nodeId={node.id} params={node.params} hitAt={hitAt} />;
      default:
        return null;
    }
  };

  return (
    <>
      <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={60} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 2, 0]}
      />

      {/* Optimized Lighting - reduced for performance */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.0}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={40}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

      {/* Environment - removed for performance, using simple lighting instead */}

      {/* Divine Light - colorful lights from above when active */}
      {divineLightActive && (
        <>
          <spotLight
            position={[0, 30, 0]}
            angle={1.5}
            penumbra={0.2}
            intensity={20.0}
            color="#FFD700" // Golden light
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <pointLight
            position={[-12, 25, -12]}
            intensity={8.0}
            color="#FF6B6B" // Divine red
            distance={80}
          />
          <pointLight
            position={[12, 25, 12]}
            intensity={8.0}
            color="#4ECDC4" // Divine cyan
            distance={80}
          />
          <pointLight
            position={[-12, 25, 12]}
            intensity={8.0}
            color="#A855F7" // Divine purple
            distance={80}
          />
          <pointLight
            position={[12, 25, -12]}
            intensity={8.0}
            color="#F472B6" // Divine pink
            distance={80}
          />
          <pointLight
            position={[0, 20, 0]}
            intensity={5.0}
            color="#FFD700" // Center golden fill
            distance={60}
          />
          <ambientLight intensity={3.0} color="#FFD700" />
        </>
      )}

      {/* Interactive Ground */}
      <Ground />

      {/* Contact Shadows - simplified for performance */}
      <ContactShadows
        position={[0, -1.9, 0]}
        opacity={0.3}
        scale={20}
        blur={1.5}
        far={8}
        width={1024}
        height={1024}
      />

      {/* Invisible interaction plane — vertical, on the z=0 gameplay plane,
          so clicks map directly to world x/y (REFACTORING_PLAN.md P7). */}
      <Plane
        args={[70, 44]}
        position={[0, 12, 0]}
        onPointerDown={handlePointerDown}
        visible={false}
      />

      {/* Render all modules */}
      {nodes.map(renderModule)}

      {/* Render marbles */}
      {marbles.map((marble) => (
        <Marble
          key={marble.id}
          id={marble.id}
          position={marble.position}
          onCollide={handleCollision}
          onSettle={handleMarbleSettle}
          unlocks={unlocks}
        />
      ))}

      {/* Render active ripples */}
      {ripples.map((ripple) => (
        <Ripple
          key={ripple.id}
          position={ripple.position}
          color={ripple.color}
          onComplete={() => handleRippleComplete(ripple.id)}
        />
      ))}

      {/* Completion Celebration */}
      <CompletionCelebration
        enabled={completionCelebration.enabled}
        onComplete={() => setCompletionCelebration(prev => ({ ...prev, enabled: false }))}
      />

      {/* Atmosphere particles — fixed positions (random-in-render made them
          teleport on every re-render; REFACTORING_PLAN.md §0.5) */}
      <group>
        {ATMOSPHERE_PARTICLE_POSITIONS.map((pos, i) => (
          <Sphere key={i} args={[0.02]} position={pos}>
            <meshStandardMaterial
              color="#00BFA6"
              emissive="#00BFA6"
              emissiveIntensity={0.5}
              transparent
              opacity={0.6}
            />
          </Sphere>
        ))}
      </group>
    </>
  );
});
Scene.displayName = 'Scene';

export const Physics3DCanvas: React.FC<Physics3DCanvasProps> = React.memo(({
  nodes,
  onNodeAdd,
  onCollision,
  onModuleTypeChange,
  selectedNodeType = 'marble',
  onClearAll,
  onToggleHelp,
  onExit
}) => {
  const [synthBridge, setSynthBridge] = useState<SynthBridge3D | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [echoMode, setEchoMode] = useState<'off' | 'short' | 'long'>('off');
  const [divineLightActive, setDivineLightActive] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Session stats for UI display
  const [displayStats, setDisplayStats] = useState<SessionStats>({
    totalCollisions: 0,
    maxCombo: 0,
    totalScore: 0
  });
  // No UI currently renders these stats. Phase 5 asset — wired up later
  // (REFACTORING_PLAN.md §0.5).
  void displayStats;

  // Marble drop trigger state
  const [marbleDropTrigger, setMarbleDropTrigger] = useState(0);

  useEffect(() => {
    // Track the bridge in a local so cleanup disposes the instance this
    // effect actually created (the old cleanup read the `synthBridge` state
    // from the mount render — always null — so dispose() was unreachable
    // and the whole audio engine leaked on remount; REFACTORING_PLAN.md A1).
    let bridge: SynthBridge3D | null = null;
    let cancelled = false;

    const initializeBridge = async () => {
      try {
        // No onCollision in the bridge config: the Scene-level handler is the
        // single dispatch point for collision events. Wiring it here as well
        // made every collision fire the App callback twice (A5).
        bridge = new SynthBridge3D();
        await bridge.initialize();
        if (cancelled) {
          bridge.dispose();
          return;
        }
        setSynthBridge(bridge);
        setIsInitialized(true);
      } catch (error) {
        if (!cancelled) {
          setInitError(error instanceof Error ? error.message : 'Failed to initialize audio system');
        }
      }
    };

    initializeBridge();

    return () => {
      cancelled = true;
      bridge?.dispose();
      setSynthBridge(null);
    };
  }, []);

  const handleMute = () => {
    setIsMuted(!isMuted);
    if (synthBridge) {
      synthBridge.setMasterVolume(isMuted ? -12 : -Infinity);
    }
  };

  const handleEchoModeChange = (mode: 'off' | 'short' | 'long') => {
    setEchoMode(mode);
    if (synthBridge) {
      synthBridge.setEchoMode(mode);
    }
  };

  const handleModuleSelect = (moduleType: PatchNode['type']) => {
    if (onModuleTypeChange) {
      onModuleTypeChange(moduleType);
    }
  };

  const handleDivineLightToggle = () => {
    setDivineLightActive(!divineLightActive);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Ignore auto-repeat (holding Space shouldn't hose the scene) and
    // anything typed into a form control.
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    const key = event.key.toLowerCase();

    if (key === 'm') {
      handleMute();
    } else if (key === 'd') {
      // Cycle through echo modes: off → short → long → off
      const modes: Array<'off' | 'short' | 'long'> = ['off', 'short', 'long'];
      const nextIndex = (modes.indexOf(echoMode) + 1) % modes.length;
      handleEchoModeChange(modes[nextIndex]);
    } else if (key === 'l') {
      handleDivineLightToggle();
    } else if (event.code === 'Space') {
      event.preventDefault();
      // Space always drops a marble, regardless of which module type is
      // selected for placement.
      setMarbleDropTrigger(prev => prev + 1);
    } else if (key === 'c') {
      onClearAll?.();
    } else if (key === 'h') {
      onToggleHelp?.();
    } else if (key === 'escape') {
      onExit?.();
    } else if (key >= '1' && key <= '8') {
      const moduleTypes = ['marble', 'ramp', 'bumper', 'chime', 'spinner', 'funnel', 'seesaw', 'bell'] as const;
      const index = parseInt(key) - 1;
      if (index >= 0 && index < moduleTypes.length) {
        handleModuleSelect(moduleTypes[index]);
      }
    }
  };

  // Window-level listener: the old React onKeyDown on the wrapper div only
  // fired when the div happened to have focus, which nothing ever gave it —
  // shortcuts were dead on page load (REFACTORING_PLAN.md P8). The ref
  // indirection keeps a single subscription reading fresh state.
  const liveKeyDown = useLiveCallback(handleKeyDown);
  useEffect(() => {
    window.addEventListener('keydown', liveKeyDown);
    return () => window.removeEventListener('keydown', liveKeyDown);
  }, [liveKeyDown]);

  return (
    <MUIBox
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)'
      }}
      role="region"
      aria-label="3D physics canvas for audio synthesis"
    >
      <Canvas
        shadows={false}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
          stencil: true,
          depth: true
        }}
        dpr={[1, 1.5]}
        camera={{ position: [15, 12, 15], fov: 60 }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <Physics
            gravity={[0, -15, 0]}
            iterations={5} // Hinge (seesaw) + kinematic (spinner) need a bit more solver headroom than plain contacts
            broadphase="Naive"
            defaultContactMaterial={{
              friction: 0.4,
              restitution: 0.7
            }}
            allowSleep={true}
            size={10} // World size for optimization
          >
            <Scene
              nodes={nodes}
              onCollision={(event) => {
                if (synthBridge) {
                  synthBridge.triggerCollision(event);
                }
                onCollision?.(event);
              }}
              selectedNodeType={selectedNodeType}
              onNodeAdd={onNodeAdd}
              onStatsUpdate={(stats) => setDisplayStats(stats)}
              divineLightActive={divineLightActive}
              marbleDropTrigger={marbleDropTrigger}
            />
          </Physics>
        </Suspense>
      </Canvas>

      {/* Loading State */}
      {!isInitialized && !initError && (
        <MUIBox
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'white'
          }}
          role="status"
          aria-live="polite"
        >
          <Typography variant="h6" gutterBottom>
            Initializing 3D Physics & Audio...
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Please wait while we set up the audio engine
          </Typography>
        </MUIBox>
      )}

      {/* Error State */}
      {initError && (
        <MUIBox
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#ff4444',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 3,
            borderRadius: 2
          }}
          role="alert"
          aria-live="assertive"
        >
          <Typography variant="h6" gutterBottom>
            Initialization Error
          </Typography>
          <Typography variant="body2">
            {initError}
          </Typography>
        </MUIBox>
      )}

      {/* Right Panel Container - Controls and Modules */}
      <MUIBox
        sx={{
          position: 'absolute',
          top: { xs: 10, sm: 20 },
          right: { xs: 10, sm: 20 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 1, sm: 2 },
          zIndex: 1000
        }}
      >
        {/* Floating Controls */}
        <MUIBox
        sx={{
          display: 'flex',
          gap: { xs: 0.25, sm: 0.5 },
          flexDirection: 'column'
        }}
        role="toolbar"
        aria-label="Audio controls"
      >
        {/* Mute Control */}
        <Tooltip title={isMuted ? "Unmute (Press M)" : "Mute (Press M)"}>
          <IconButton
            onClick={handleMute}
            sx={{
              background: '#000000',
              border: '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF'
              }
            }}
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>{isMuted ? '◉' : '◎'}</MUIBox>
          </IconButton>
        </Tooltip>

        {/* Echo Mode Controls */}
        <Tooltip title="Short Echo (200ms delay)">
          <IconButton
            onClick={() => handleEchoModeChange('short')}
            sx={{
              background: echoMode === 'short' ? '#0A0A0A' : '#000000',
              border: echoMode === 'short' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF'
              }
            }}
            aria-label="Enable short echo mode"
          >
            <MUIBox sx={{ fontSize: { xs: 12, sm: 16 } }}>∿</MUIBox>
          </IconButton>
        </Tooltip>

        <Tooltip title="Long Echo (800ms delay)">
          <IconButton
            onClick={() => handleEchoModeChange('long')}
            sx={{
              background: echoMode === 'long' ? '#0A0A0A' : '#000000',
              border: echoMode === 'long' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF'
              }
            }}
            aria-label="Enable long echo mode"
          >
            <MUIBox sx={{ fontSize: { xs: 14, sm: 18 } }}>∿∿</MUIBox>
          </IconButton>
        </Tooltip>

        <Tooltip title="Echo Off">
          <IconButton
            onClick={() => handleEchoModeChange('off')}
            sx={{
              background: echoMode === 'off' ? '#0A0A0A' : '#000000',
              border: echoMode === 'off' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF'
              }
            }}
            aria-label="Disable echo"
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>○</MUIBox>
          </IconButton>
        </Tooltip>

        {/* Divine Light Control */}
        <Tooltip title={divineLightActive ? "Disable Divine Light (Press L)" : "Enable Divine Light (Press L)"}>
          <IconButton
            onClick={handleDivineLightToggle}
            sx={{
              background: divineLightActive ? 'linear-gradient(135deg, #FFD700 0%, #FF6B6B 50%, #4ECDC4 100%)' : '#000000',
              border: divineLightActive ? '2px solid #FFD700' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: divineLightActive ? 'linear-gradient(135deg, #FFD700 0%, #FF6B6B 50%, #4ECDC4 100%)' : '#0A0A0A',
                border: '1px solid #FFFFFF'
              }
            }}
            aria-label={divineLightActive ? "Disable divine light" : "Enable divine light"}
          >
            <MUIBox sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 'bold' }}>✦</MUIBox>
          </IconButton>
        </Tooltip>
      </MUIBox>
      </MUIBox>

      {/* Module Selector - Sacred Geometry Buttons */}
      <MUIBox
        sx={{
          position: 'absolute',
          bottom: { xs: 10, sm: 20 },
          left: { xs: 10, sm: 'auto' },
          right: { xs: 10, sm: 20 },
          background: '#000000',
          border: '1px solid #333333',
          borderRadius: 0.65,
          padding: { xs: 0.8, sm: 1.3 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 0.5, sm: 0.975 },
          maxWidth: 'none',
          zIndex: 1000
        }}
        role="toolbar"
        aria-label="Module selector"
      >
        <Typography variant="caption" sx={{
          fontSize: { xs: '0.5rem', sm: '0.65rem' },
          letterSpacing: '0.15em',
          color: '#888888',
          textAlign: 'center',
          mb: { xs: 0.2, sm: 0.325 }
        }}>
          MODULES (1-8)
        </Typography>
        <MUIBox sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: { xs: 0.5, sm: 0.975 },
          justifyContent: 'center',
          minWidth: { xs: 'auto', sm: 208 }
        }}>
          {([
            { type: 'marble', symbol: '◉', name: 'ORIGIN', key: '1' },
            { type: 'ramp', symbol: '△', name: 'SLOPE', key: '2' },
            { type: 'bumper', symbol: '◉', name: 'BASE', key: '3' },
            { type: 'chime', symbol: '✧', name: 'HEX', key: '4' },
            { type: 'spinner', symbol: '∞', name: 'SPIRAL', key: '5' },
            { type: 'funnel', symbol: '◈', name: 'PORTAL', key: '6' },
            { type: 'seesaw', symbol: '∞', name: 'BALANCE', key: '7' },
            { type: 'bell', symbol: '❖', name: 'AXIS', key: '8' }
          ] as const).map((module) => (
            <Tooltip
              key={module.type}
              title={`${module.name} (Press ${module.key})`}
              arrow
            >
              <IconButton
                onClick={() => handleModuleSelect(module.type)}
                sx={{
                  background: selectedNodeType === module.type ? '#0A0A0A' : '#000000',
                  border: selectedNodeType === module.type ? '1px solid #FFFFFF' : '1px solid #333333',
                  color: '#FFFFFF',
                  width: { xs: 32, sm: 41.6 },
                  height: { xs: 32, sm: 41.6 },
                  minWidth: { xs: 32, sm: 41.6 },
                  padding: 0,
                  flexDirection: 'column',
                  gap: 0,
                  '&:hover': {
                    background: '#0A0A0A',
                    border: '1px solid #FFFFFF'
                  }
                }}
                aria-label={`Select ${module.name} module`}
                aria-pressed={selectedNodeType === module.type}
              >
                <MUIBox sx={{
                  fontSize: { xs: '0.7rem', sm: '0.91rem' },
                  lineHeight: 1,
                  fontWeight: selectedNodeType === module.type ? 600 : 400,
                  height: { xs: 12, sm: 15.6 }
                }}>
                  {module.symbol}
                </MUIBox>
                <Typography
                  sx={{
                    fontSize: { xs: '0.05rem !important', sm: '0.065rem !important' },
                    letterSpacing: '0.05em',
                    color: selectedNodeType === module.type ? '#FFFFFF' : '#888888',
                    lineHeight: 1,
                    fontWeight: selectedNodeType === module.type ? 500 : 400,
                    display: { xs: 'none', sm: 'block' }
                  }}
                >
                  {module.name}
                </Typography>
              </IconButton>
            </Tooltip>
          ))}
        </MUIBox>
      </MUIBox>
    </MUIBox>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.nodes === nextProps.nodes &&
    prevProps.selectedNodeType === nextProps.selectedNodeType
  );
});
Physics3DCanvas.displayName = 'Physics3DCanvas';
