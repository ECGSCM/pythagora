import React, { useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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
import { VolumeUp, VolumeOff } from '@mui/icons-material';
import * as THREE from 'three';

interface Physics3DCanvasProps {
  nodes: PatchNode[];
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  onCollision?: (event: any) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  selectedNodeType?: string;
}

// Enhanced Marble Component with trail effect
const Marble = React.memo(({ position, onCollide }: any) => {
  const [ref] = useSphere(() => ({
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

  useFrame(() => {
    const mesh = ref.current;
    if (mesh) {
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.02;
    }
  });

  return (
    <Sphere ref={ref as any} args={[0.3, 32, 32]} castShadow>
      <meshStandardMaterial
        color="#FF4757"
        metalness={0.9}
        roughness={0.1}
        emissive="#FF4757"
        emissiveIntensity={0.3}
      />
    </Sphere>
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
const Scene = React.memo(({ nodes, onCollision, selectedNodeType, onNodeAdd }: any) => {
  const [marbles, setMarbles] = useState<any[]>([]);

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
      <PerspectiveCamera makeDefault position={[15, 12, 15]} />
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
          onCollide={onCollision}
        />
      ))}

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
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'm' || event.key === 'M') {
      handleMute();
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
