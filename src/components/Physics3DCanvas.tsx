import React, { useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  Box,
  Sphere,
  Cylinder,
  Text,
  ContactShadows,
  PerspectiveCamera,
  MeshReflectorMaterial,
  Plane
} from '@react-three/drei';
import { Physics, useSphere, useBox, useCylinder, usePlane } from '@react-three/cannon';
import { SynthBridge3D } from '../engines/synthBridge3D';
import { PatchNode } from '../types/db.types';
import { Box as MUIBox, IconButton, Tooltip, Typography } from '@mui/material';
import { VolumeUp, VolumeOff, GraphicEq, AccessTime } from '@mui/icons-material';
import * as THREE from 'three';

interface Physics3DCanvasProps {
  nodes: PatchNode[];
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  onCollision?: (event: any) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  selectedNodeType?: string;
}

// Ripple Effect Component for collisions
interface RippleProps {
  position: [number, number, number];
  color?: string;
  onComplete?: () => void;
}

const Ripple = React.memo(({ position, color = "#FF4757", onComplete }: RippleProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [life, setLife] = useState(1); // 1 to 0
  const rippleDuration = 1.0; // seconds

  useFrame((_state, delta) => {
    const decay = delta / rippleDuration;
    setLife(prev => {
      const newLife = Math.max(0, prev - decay);
      if (newLife <= 0 && onComplete) {
        onComplete();
      }
      return newLife;
    });

    // Animate ripple expansion
    if (meshRef.current) {
      const scale = 1 + (1 - life) * 3; // Expand from 1x to 4x
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.1, 0.3, 32]} />
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
        <Text
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
        </Text>
      )}
      {comboCount > 1 && (
        <Text
          fontSize={0.8}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          position={[0, -1.5, 0]}
        >
          {`${comboCount} hits`}
          <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={0.7}
          />
        </Text>
      )}
    </group>
  );
});

ComboDisplay.displayName = 'ComboDisplay';

// Rhythm Indicator Component
const RhythmIndicator = React.memo(({ enabled, quality, suggestedDropTime }: {
  enabled: boolean;
  quality: number;
  suggestedDropTime: number;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [pulse, setPulse] = useState(0);

  useFrame(() => {
    if (!enabled) return;

    const now = Date.now();
    const timeUntilDrop = suggestedDropTime - now;

    // Pulse when approaching suggested drop time
    if (timeUntilDrop > 0 && timeUntilDrop < 500) {
      const intensity = 1 - (timeUntilDrop / 500);
      setPulse(intensity);
    } else {
      setPulse(0);
    }
  });

  if (!enabled) return null;

  // Color based on rhythm quality
  const color = quality > 0.8 ? '#00FF00' : quality > 0.5 ? '#FFFF00' : '#FF0000';

  return (
    <group position={[0, 12, 0]}>
      {/* Rhythm quality ring */}
      <mesh ref={meshRef}>
        <torusGeometry args={[2, 0.1, 16, 100]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5 + pulse * 0.5}
          transparent
          opacity={0.6 + pulse * 0.4}
        />
      </mesh>

      {/* Quality indicator text */}
      <Text
        fontSize={0.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, 0]}
      >
        {`Rhythm: ${Math.round(quality * 100)}%`}
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.8}
        />
      </Text>
    </group>
  );
});

RhythmIndicator.displayName = 'RhythmIndicator';

// Camera Flow Component - Smooth camera follow with floating motion
const CameraFlow = React.memo(({ marbles }: { marbles: any[] }) => {
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

// Breathing Guide Component - Subtle breathing animation for meditative state
const BreathingGuide = React.memo(({ enabled }: { enabled: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!enabled || !groupRef.current || !ringRef.current) return;

    // Breathing cycle: 4 seconds in, 4 seconds out
    const time = state.clock.elapsedTime;
    const cycleDuration = 8; // 8 seconds total (4 in, 4 out)
    const phase = (time % cycleDuration) / cycleDuration;

    // Breathing curve: smooth in and out
    let scale: number;
    if (phase < 0.5) {
      // Inhale (0-4 seconds)
      const inhalePhase = phase * 2; // 0-1
      scale = 1 + Math.sin(inhalePhase * Math.PI / 2) * 0.15; // Expand to 1.15x
    } else {
      // Exhale (4-8 seconds)
      const exhalePhase = (phase - 0.5) * 2; // 0-1
      scale = 1.15 - Math.sin(exhalePhase * Math.PI / 2) * 0.15; // Contract to 1x
    }

    // Apply scale to ring
    ringRef.current.scale.setScalar(scale);

    // Subtle rotation
    groupRef.current.rotation.y += 0.001;
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef} position={[0, 3, 0]}>
      {/* Breathing ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[1.5, 0.05, 16, 100]} />
        <meshStandardMaterial
          color="#4ECDC4"
          emissive="#4ECDC4"
          emissiveIntensity={0.3}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Inner ring */}
      <mesh>
        <torusGeometry args={[1, 0.03, 16, 100]} />
        <meshStandardMaterial
          color="#4ECDC4"
          emissive="#4ECDC4"
          emissiveIntensity={0.2}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
});

BreathingGuide.displayName = 'BreathingGuide';

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
      <Text
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
      </Text>
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
      <Text
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
      </Text>

      <Text
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
      </Text>
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

// Enhanced Marble Component with trail effect
const Marble = React.memo(({ position, onCollide, unlocks }: any) => {
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position,
    args: [0.3],
    material: {
      restitution: 0.7,
      friction: 0.3
    },
    onCollide: (e) => {
      if (e.body && e.body.userData?.nodeId) {
        const collisionEvent = {
          nodeId: e.body.userData.nodeId,
          velocity: e.contact?.impactVelocity || 5,
          position: e.contact?.contactPoint || { x: 0, y: 0, z: 0 },
          timestamp: Date.now()
        };
        onCollide(collisionEvent);
      }
    }
  }));

  // Track marble position for particle trail
  const marblePosition = useRef(new THREE.Vector3(position[0], position[1], position[2]));

  // Subscribe to position updates (only once)
  useEffect(() => {
    const unsubscribe = api.position.subscribe((pos: [number, number, number]) => {
      marblePosition.current.set(pos[0], pos[1], pos[2]);
    });
    return () => unsubscribe();
  }, [api.position]);

  useFrame(() => {
    const mesh = ref.current;
    if (mesh) {
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.02;
    }
  });

  return (
    <group>
      {/* Local glow light for the marble */}
      <pointLight
        position={[0, 0, 0]}
        intensity={unlocks?.goldenMarble ? 0.8 : 0.5}
        color={unlocks?.goldenMarble ? "#FFD700" : "#FF4757"}
        distance={2}
        decay={2}
      />
      <Sphere ref={ref as any} args={[0.3, 32, 32]} castShadow>
        <meshStandardMaterial
          color={unlocks?.goldenMarble ? "#FFD700" : "#FF4757"}
          metalness={0.9}
          roughness={unlocks?.goldenMarble ? 0.05 : 0.1}
          emissive={unlocks?.goldenMarble ? "#FFD700" : "#FF4757"}
          emissiveIntensity={unlocks?.goldenMarble ? 1.2 : 0.8}
        />
      </Sphere>
    </group>
  );
});
Marble.displayName = 'Marble';

// Ramp Component - For guiding marbles
const Ramp = React.memo(({ position, nodeId, params }: any) => {
  const [ref] = useBox(() => ({
    position,
    args: [4, 0.2, 2],
    type: 'Static',
    userData: { nodeId }
  }));

  return (
    <group ref={ref as any} rotation={[0, 0, (params.angle || 15) * Math.PI / 180]}>
      <Box args={[4, 0.2, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#8B4513"
          roughness={0.8}
          metalness={0.1}
        />
      </Box>
      <Text
        position={[0, 0.2, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        RAMP
      </Text>
    </group>
  );
});
Ramp.displayName = 'Ramp';

// Enhanced Bumper Component
const Bumper = React.memo(({ position, nodeId, params }: any) => {
  const [ref] = useCylinder(() => ({
    position,
    args: [1.2, 1.2, 0.6],
    type: 'Static',
    userData: { nodeId }
  }));

  const [hit, setHit] = useState(false);

  useEffect(() => {
    if (hit) {
      const timer = setTimeout(() => setHit(false), 200);
      return () => clearTimeout(timer);
    }
  }, [hit]);

  return (
    <group ref={ref as any}>
      <Cylinder args={[1.2, 1.2, 0.6]} castShadow receiveShadow>
        <meshStandardMaterial
          color={hit ? "#FFD700" : "#4ECDC4"}
          metalness={0.8}
          roughness={0.2}
          emissive={hit ? "#FFD700" : "#4ECDC4"}
          emissiveIntensity={hit ? 0.8 : 0.2}
        />
      </Cylinder>
      <Text
        position={[0, 0, 0.4]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        🥁 {params.pitch || 'C4'}
      </Text>
    </group>
  );
});
Bumper.displayName = 'Bumper';

// Chime Component - Vertical tubes that create melodic sounds
const Chime = React.memo(({ position, nodeId, params }: any) => {
  const [ref] = useCylinder(() => ({
    position,
    args: [0.15, 0.15, 3],
    type: 'Static',
    userData: { nodeId }
  }));

  const [chiming, setChiming] = useState(false);

  useEffect(() => {
    if (chiming) {
      const timer = setTimeout(() => setChiming(false), 500);
      return () => clearTimeout(timer);
    }
  }, [chiming]);

  return (
    <group ref={ref as any}>
      <Cylinder args={[0.15, 0.15, 3]} castShadow receiveShadow>
        <meshStandardMaterial
          color={chiming ? "#FF6B9D" : "#C44569"}
          metalness={0.9}
          roughness={0.1}
          emissive={chiming ? "#FF6B9D" : "#C44569"}
          emissiveIntensity={chiming ? 0.7 : 0.2}
        />
      </Cylinder>
      <Text
        position={[0, 0, 1.7]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
      >
        ♪ {params.note || 'A4'}
      </Text>
    </group>
  );
});
Chime.displayName = 'Chime';

// Spinner Component - Rotating wheel with multiple note triggers
const Spinner = React.memo(({ position, nodeId, params }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [ref] = useCylinder(() => ({
    position,
    args: [1.5, 1.5, 0.3],
    type: 'Static',
    userData: { nodeId }
  }));

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.z += (params.speed || 1.0) * 0.02;
    }
  });

  return (
    <group ref={ref as any}>
      <Cylinder ref={meshRef} args={[1.5, 1.5, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#20BF6B"
          metalness={0.6}
          roughness={0.4}
          emissive="#20BF6B"
          emissiveIntensity={0.3}
        />
      </Cylinder>
      <Text
        position={[0, 0, 0.2]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        🌀 SPIN
      </Text>
    </group>
  );
});
Spinner.displayName = 'Spinner';

// Funnel Component - Spiral sound effect
const Funnel = React.memo(({ position, nodeId }: any) => {
  const [ref] = useCylinder(() => ({
    position,
    args: [2, 0.3, 2],
    type: 'Static',
    userData: { nodeId }
  }));

  return (
    <group ref={ref as any}>
      <Cylinder args={[2, 0.3, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#5A67D8"
          metalness={0.7}
          roughness={0.3}
          emissive="#5A67D8"
          emissiveIntensity={0.2}
        />
      </Cylinder>
      <Text
        position={[0, 0, 1.1]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        🌪️ SPIRAL
      </Text>
    </group>
  );
});
Funnel.displayName = 'Funnel';

// Seesaw Component - Balance-triggered sound
const Seesaw = React.memo(({ position, nodeId }: any) => {
  const [ref] = useBox(() => ({
    position,
    args: [3, 0.2, 0.8],
    type: 'Static',
    userData: { nodeId }
  }));

  return (
    <group ref={ref as any}>
      <Box args={[3, 0.2, 0.8]} castShadow receiveShadow>
        <meshStandardMaterial
          color="#FD79A8"
          metalness={0.5}
          roughness={0.5}
          emissive="#FD79A8"
          emissiveIntensity={0.2}
        />
      </Box>
      <Text
        position={[0, 0, 0.5]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ⚖️ BALANCE
      </Text>
    </group>
  );
});
Seesaw.displayName = 'Seesaw';

// Bell Component - Harmonic bell sounds
const Bell = React.memo(({ position, nodeId }: any) => {
  const [ref] = useCylinder(() => ({
    position,
    args: [1, 1.5, 2],
    type: 'Static',
    userData: { nodeId }
  }));

  const [ringing, setRinging] = useState(false);

  useEffect(() => {
    if (ringing) {
      const timer = setTimeout(() => setRinging(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [ringing]);

  return (
    <group ref={ref as any}>
      <Cylinder args={[1, 1.5, 2]} castShadow receiveShadow>
        <meshStandardMaterial
          color={ringing ? "#F39C12" : "#E67E22"}
          metalness={0.9}
          roughness={0.1}
          emissive={ringing ? "#F39C12" : "#E67E22"}
          emissiveIntensity={ringing ? 0.8 : 0.3}
        />
      </Cylinder>
      <Text
        position={[0, 0, 1.2]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        🔔
      </Text>
    </group>
  );
});
Bell.displayName = 'Bell';

// Ground Component
const Ground = React.memo(() => {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -2, 0],
    type: 'Static'
  }));

  return (
    <Plane ref={ref as any} args={[50, 50]} receiveShadow>
      <MeshReflectorMaterial
        mirror={0.3}
        blur={[512, 512]}
        resolution={512}
        mixBlur={1}
        mixStrength={1}
        color="#1A1A2E"
        metalness={0.5}
        roughness={0.1}
      />
    </Plane>
  );
});
Ground.displayName = 'Ground';

// 3D Scene Component
const Scene = React.memo(({ nodes, onCollision, selectedNodeType, onNodeAdd, onStatsUpdate, rhythmLockEnabled }: any) => {
  const [marbles, setMarbles] = useState<any[]>([]);
  const [ripples, setRipples] = useState<Array<{ id: string; position: [number, number, number]; color: string }>>([]);

  // Combo System State
  const [comboCount, setComboCount] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [lastCollisionTime, setLastCollisionTime] = useState(0);
  const [comboDisplay, setComboDisplay] = useState({ show: false, text: '', scale: 1 });
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

  // Rhythm Lock System
  const [rhythmLock, setRhythmLock] = useState({
    enabled: false,
    beatsPerMinute: 60, // 1 second intervals
    lastBeatTime: 0,
    collisionRhythms: [] as number[], // Time intervals between collisions
    suggestedDropTime: 0,
    rhythmQuality: 0 // 0-1, how well collisions match the rhythm
  });
  const idealInterval = 60000 / rhythmLock.beatsPerMinute; // ms between beats

  // Pythagora Switch Completion System
  const [completionCelebration, setCompletionCelebration] = useState({
    enabled: false,
    marblesCompleted: 0
  });
  const [perfectRun, setPerfectRun] = useState({
    active: false,
    flawlessHits: 0
  });

  // Calculate multiplier based on combo count
  const calculateMultiplier = (combo: number): number => {
    if (combo >= 20) return 5;
    if (combo >= 15) return 4;
    if (combo >= 10) return 3;
    if (combo >= 5) return 2;
    return 1;
  };

  // Handle mouse clicks to add modules/marbles
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    const point = e.point;

    if (selectedNodeType === 'marble') {
      const newMarble = {
        id: `marble-${Date.now()}`,
        position: [point.x, 8, point.z]
      };
      setMarbles(prev => [...prev, newMarble]);
    } else {
      onNodeAdd?.({ x: point.x, y: point.y + 2, z: point.z });
    }
  };

  // Handle collisions and create ripple effects
  const handleCollision = (event: any) => {
    const now = Date.now();
    const timeSinceLastCollision = now - lastCollisionTime;

    // Track rhythm if enabled
    if (rhythmLock.enabled && lastCollisionTime > 0) {
      setRhythmLock(prev => {
        const newRhythms = [...prev.collisionRhythms, timeSinceLastCollision].slice(-10); // Keep last 10 intervals

        // Calculate rhythm quality (how close to ideal interval)
        const avgInterval = newRhythms.reduce((a, b) => a + b, 0) / newRhythms.length;
        const quality = 1 - Math.min(1, Math.abs(avgInterval - idealInterval) / idealInterval);

        // Calculate next suggested drop time
        const nextBeat = now + idealInterval;

        return {
          ...prev,
          lastBeatTime: now,
          collisionRhythms: newRhythms,
          suggestedDropTime: nextBeat,
          rhythmQuality: quality
        };
      });
    }

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
          // Show unlock notification
          const unlockText = 'UNLOCKED!';
          setComboDisplay({ show: true, text: unlockText, scale: 2 });
          setTimeout(() => {
            setComboDisplay(prev => ({ ...prev, show: false, scale: 1 }));
          }, 1500);
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

  // Sync rhythm lock enabled state
  useEffect(() => {
    setRhythmLock(prev => ({ ...prev, enabled: rhythmLockEnabled }));
  }, [rhythmLockEnabled]);

  // Track marble completions and cleanup (prevent memory overflow)
  useEffect(() => {
    const completionThreshold = -5; // Y position below ground
    const maxMarbles = 10; // Maximum active marbles to prevent memory issues

    const checkCompletions = () => {
      // Find marbles to remove (completed or too many)
      setMarbles(prev => {
        // Mark completed marbles
        const updated = prev.map(marble => {
          if (marble.position[1] < completionThreshold && !marble.completed) {
            // Marble has completed its journey
            setCompletionCelebration(prev => {
              const newCount = prev.marblesCompleted + 1;
              return {
                enabled: true,
                marblesCompleted: newCount
              };
            });

            // Reset celebration after animation
            setTimeout(() => {
              setCompletionCelebration(prev => ({ ...prev, enabled: false }));
            }, 2000);

            return { ...marble, completed: true };
          }
          return marble;
        });

        // Remove completed marbles AND limit total count
        const activeMarbles = updated.filter(m => !m.completed);

        // If too many marbles, remove oldest
        if (activeMarbles.length > maxMarbles) {
          return activeMarbles.slice(-maxMarbles);
        }

        // Also remove completed marbles
        return activeMarbles;
      });
    };

    const intervalId = setInterval(checkCompletions, 500);
    return () => clearInterval(intervalId);
  }, [marbles]);

  // Module renderer
  const renderModule = (node: PatchNode) => {
    const position = [
      node.position.x,
      node.position.y,
      0
    ];

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

      {/* Enhanced Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <pointLight position={[-10, 10, -10]} intensity={0.5} color="#4ECDC4" />
      <pointLight position={[10, 5, 10]} intensity={0.5} color="#FF6B6B" />

      {/* Environment */}
      <Environment preset="night" />

      {/* Interactive Ground */}
      <Ground />

      {/* Contact Shadows */}
      <ContactShadows
        position={[0, -1.9, 0]}
        opacity={0.6}
        scale={30}
        blur={2}
        far={10}
      />

      {/* Invisible interaction plane */}
      <Plane
        args={[50, 50]}
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        visible={false}
      />

      {/* Render all modules */}
      {nodes.map(renderModule)}

      {/* Render marbles */}
      {marbles.map((marble) => (
        <Marble
          key={marble.id}
          position={marble.position}
          onCollide={handleCollision}
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

      {/* Combo Display */}
      <ComboDisplay
        show={comboDisplay.show}
        text={comboDisplay.text}
        scale={comboDisplay.scale}
        comboCount={comboCount}
        multiplier={comboMultiplier}
      />

      {/* Rhythm Indicator */}
      <RhythmIndicator
        enabled={rhythmLock.enabled}
        quality={rhythmLock.rhythmQuality}
        suggestedDropTime={rhythmLock.suggestedDropTime}
      />

      {/* Breathing Guide */}
      <BreathingGuide enabled={rhythmLock.enabled} />

      {/* Completion Celebration */}
      <CompletionCelebration
        enabled={completionCelebration.enabled}
        onComplete={() => setCompletionCelebration(prev => ({ ...prev, enabled: false }))}
      />

      {/* Perfect Run Indicator */}
      <PerfectRunIndicator
        active={perfectRun.active}
        flawlessHits={perfectRun.flawlessHits}
      />

      {/* Atmosphere particles */}
      <group>
        {Array.from({ length: 20 }, (_, i) => (
          <Sphere key={i} args={[0.02]} position={[
            (Math.random() - 0.5) * 30,
            Math.random() * 15 + 5,
            (Math.random() - 0.5) * 30
          ]}>
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

      {/* Global ambient glow light */}
      <pointLight position={[0, 10, 0]} intensity={0.3} color="#FF6B6B" distance={20} />
    </>
  );
});
Scene.displayName = 'Scene';

export const Physics3DCanvas: React.FC<Physics3DCanvasProps> = React.memo(({
  nodes,
  onNodeAdd,
  onCollision,
  selectedNodeType = 'marble'
}) => {
  const [synthBridge, setSynthBridge] = useState<SynthBridge3D | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [droneEnabled, setDroneEnabled] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Session stats for UI display
  const [displayStats, setDisplayStats] = useState({
    totalCollisions: 0,
    maxCombo: 0,
    totalScore: 0
  });

  // Rhythm lock state for UI control
  const [rhythmLockEnabled, setRhythmLockEnabled] = useState(false);

  useEffect(() => {
    const initializeBridge = async () => {
      try {
        const bridge = new SynthBridge3D({
          onCollision: (event) => {
            onCollision?.(event);
          }
        });
        await bridge.initialize();
        setSynthBridge(bridge);
        setIsInitialized(true);
      } catch (error) {
        setInitError(error instanceof Error ? error.message : 'Failed to initialize audio system');
      }
    };

    initializeBridge();

    return () => {
      if (synthBridge) {
        synthBridge.dispose();
      }
    };
  }, []);

  const handleMute = () => {
    setIsMuted(!isMuted);
    if (synthBridge) {
      synthBridge.setMasterVolume(isMuted ? -12 : -Infinity);
    }
  };

  const handleDroneToggle = () => {
    const newDroneState = !droneEnabled;
    setDroneEnabled(newDroneState);
    if (synthBridge) {
      synthBridge.setDroneEnabled(newDroneState);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'm' || event.key === 'M') {
      handleMute();
    } else if (event.key === 'd' || event.key === 'D') {
      handleDroneToggle();
    } else if (event.key === 'r' || event.key === 'R') {
      setRhythmLockEnabled(!rhythmLockEnabled);
    }
  };

  return (
    <MUIBox
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)'
      }}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="3D physics canvas for audio synthesis"
      tabIndex={0}
    >
      <Canvas
        shadows
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance"
        }}
        camera={{ position: [15, 12, 15], fov: 60 }}
      >
        <Suspense fallback={null}>
          <Physics
            gravity={[0, -15, 0]}
            defaultContactMaterial={{
              friction: 0.4,
              restitution: 0.7
            }}
          >
            <Scene
              nodes={nodes}
              onCollision={(event: any) => {
                if (synthBridge) {
                  synthBridge.triggerCollision(event);
                }
                onCollision?.(event);
              }}
              selectedNodeType={selectedNodeType}
              onNodeAdd={onNodeAdd}
              onStatsUpdate={(stats: any) => setDisplayStats(stats)}
              rhythmLockEnabled={rhythmLockEnabled}
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

      {/* Floating Controls */}
      <MUIBox
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 1
        }}
        role="toolbar"
        aria-label="Audio controls"
      >
        <Tooltip title={isMuted ? "Unmute (Press M)" : "Mute (Press M)"}>
          <IconButton
            onClick={handleMute}
            sx={{
              background: 'rgba(26, 26, 46, 0.9)',
              color: 'white',
              '&:hover': { background: 'rgba(26, 26, 46, 1)' }
            }}
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          >
            {isMuted ? <VolumeOff /> : <VolumeUp />}
          </IconButton>
        </Tooltip>
        <Tooltip title={droneEnabled ? "Disable Drone (Press D)" : "Enable Drone (Press D)"}>
          <IconButton
            onClick={handleDroneToggle}
            sx={{
              background: droneEnabled ? 'rgba(0, 191, 166, 0.9)' : 'rgba(26, 26, 46, 0.9)',
              color: 'white',
              '&:hover': { background: droneEnabled ? 'rgba(0, 191, 166, 1)' : 'rgba(26, 26, 46, 1)' }
            }}
            aria-label={droneEnabled ? "Disable ambient drone" : "Enable ambient drone"}
          >
            <GraphicEq />
          </IconButton>
        </Tooltip>
        <Tooltip title={rhythmLockEnabled ? "Disable Rhythm Lock (Press R)" : "Enable Rhythm Lock (Press R)"}>
          <IconButton
            onClick={() => setRhythmLockEnabled(!rhythmLockEnabled)}
            sx={{
              background: rhythmLockEnabled ? 'rgba(156, 39, 176, 0.9)' : 'rgba(26, 26, 46, 0.9)',
              color: 'white',
              '&:hover': { background: rhythmLockEnabled ? 'rgba(156, 39, 176, 1)' : 'rgba(26, 26, 46, 1)' }
            }}
            aria-label={rhythmLockEnabled ? "Disable rhythm lock" : "Enable rhythm lock"}
          >
            <AccessTime />
          </IconButton>
        </Tooltip>
      </MUIBox>

      {/* Session Stats Display */}
      <MUIBox
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(26, 26, 46, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 2,
          padding: 2,
          color: 'white',
          minWidth: 150
        }}
        role="status"
        aria-live="polite"
      >
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.7, mb: 0.5 }}>
          Session Stats
        </Typography>
        <MUIBox sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <MUIBox sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              Score:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#FFD700' }}>
              {displayStats.totalScore}
            </Typography>
          </MUIBox>
          <MUIBox sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              Hits:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
              {displayStats.totalCollisions}
            </Typography>
          </MUIBox>
          <MUIBox sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
              Max Combo:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00BFA6' }}>
              {displayStats.maxCombo}
            </Typography>
          </MUIBox>
        </MUIBox>
      </MUIBox>

      {/* Selected Module Type Indicator */}
      <MUIBox
        sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: 'rgba(26, 26, 46, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 2,
          padding: 2,
          color: 'white'
        }}
        role="status"
        aria-live="polite"
      >
        <MUIBox sx={{ fontSize: '0.875rem', opacity: 0.7 }}>
          Selected:
        </MUIBox>
        <MUIBox sx={{ fontWeight: 'bold', color: '#00BFA6' }}>
          {selectedNodeType === 'marble' ? '🔴 Marble' :
           selectedNodeType === 'ramp' ? '📐 Ramp' :
           selectedNodeType === 'bumper' ? '🥁 Bumper' :
           selectedNodeType === 'chime' ? '🎵 Chime' :
           selectedNodeType === 'spinner' ? '🌀 Spinner' :
           selectedNodeType === 'funnel' ? '🌪️ Funnel' :
           selectedNodeType === 'seesaw' ? '⚖️ Seesaw' :
           selectedNodeType === 'bell' ? '🔔 Bell' : selectedNodeType}
        </MUIBox>
      </MUIBox>
    </MUIBox>
  );
});
Physics3DCanvas.displayName = 'Physics3DCanvas';
