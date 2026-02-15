import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, IconButton, Tooltip, Fab } from '@mui/material';
import { Add as AddIcon, VolumeUp, VolumeOff } from '@mui/icons-material';
import { SynthBridge } from '../engines/synthBridge';
import { CollisionEvent } from '../engines/physics';
import { PatchNode } from '../types/db.types';

interface PhysicsCanvasProps {
  nodes: PatchNode[];
  onNodeAdd?: (position: { x: number; y: number }) => void;
  onCollision?: (event: CollisionEvent) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  selectedNodeType?: string;
  isPlaying?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
}

export const PhysicsCanvas: React.FC<PhysicsCanvasProps> = React.memo(({
  nodes,
  onNodeAdd,
  onCollision,
  onSelectionChange: _onSelectionChange,
  selectedNodeType = 'marble',
  isPlaying = false,
  onPlayStateChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthBridgeRef = useRef<SynthBridge | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [initError, setInitError] = useState<string | null>(null);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    const newPlayState = !isPlaying;
    onPlayStateChange?.(newPlayState);
  }, [isPlaying, onPlayStateChange]);

  // Handle mute/unmute
  const handleMute = useCallback(() => {
    if (!synthBridgeRef.current) return;

    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    const volume = newMutedState ? -60 : -12; // -60dB is effectively muted
    synthBridgeRef.current.setMasterVolume(volume);
  }, [isMuted]);

  // Initialize SynthBridge
  useEffect(() => {
    if (!canvasRef.current) return;

    // Ensure canvas has dimensions before initializing
    const canvas = canvasRef.current;
    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }

    if (synthBridgeRef.current) return;

    const initializeBridge = async () => {
      try {
        const bridge = new SynthBridge({
          canvasElement: canvas,
          onCollision: (event) => {
            onCollision?.(event);
          }
        });

        await bridge.initialize();
        synthBridgeRef.current = bridge;
        setIsInitialized(true);
      } catch (error) {
        setInitError(error instanceof Error ? error.message : 'Failed to initialize audio system');
      }
    };

    initializeBridge();

    return () => {
      if (synthBridgeRef.current) {
        synthBridgeRef.current.destroy();
        synthBridgeRef.current = null;
      }
    };
  }, [onCollision, canvasSize]);

  // Handle nodes changes
  useEffect(() => {
    if (!synthBridgeRef.current || !isInitialized) return;

    // Load the patch with all nodes
    synthBridgeRef.current.loadPatch(nodes);
  }, [nodes, isInitialized]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;

      const container = canvasRef.current.parentElement;
      if (container) {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;

        setCanvasSize({ width: newWidth, height: newHeight });

        if (synthBridgeRef.current) {
          synthBridgeRef.current.resize(newWidth, newHeight);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial resize

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle canvas click for adding nodes/marbles
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !synthBridgeRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (selectedNodeType === 'marble') {
      // Add marble directly to physics world
      synthBridgeRef.current.addMarble({ x, y });
    } else {
      // Call parent to add a new node
      onNodeAdd?.({ x, y });
    }
  }, [selectedNodeType, onNodeAdd]);

  // Handle keyboard events for accessibility
  const handleCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCanvasClick(event as any);
    }
  }, [handleCanvasClick]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'm' || event.key === 'M') {
      handleMute();
    }
    if (event.key === ' ' || event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      handlePlayPause();
    }
  }, [handleMute, handlePlayPause]);

  // Add marble randomly (for demo purposes)
  const addRandomMarble = useCallback(() => {
    if (!synthBridgeRef.current) return;

    const x = Math.random() * canvasSize.width;
    const y = 50; // Drop from top

    synthBridgeRef.current.addMarble({ x, y });
  }, [canvasSize]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
        borderRadius: 1
      }}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="2D physics canvas for audio synthesis"
      tabIndex={0}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onClick={handleCanvasClick}
        onKeyDown={handleCanvasKeyDown}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: selectedNodeType === 'marble' ? 'crosshair' : 'pointer'
        }}
        role="button"
        aria-label={`Click to add ${selectedNodeType === 'marble' ? 'marble' : 'node'}`}
        tabIndex={0}
      />

      {/* Control buttons */}
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 1
        }}
        role="toolbar"
        aria-label="Playback and audio controls"
      >
        <Tooltip title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
          <IconButton
            onClick={handleMute}
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: isMuted ? '#ff4444' : 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.2)'
              }
            }}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeOff /> : <VolumeUp />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Add marble button */}
      <Tooltip title="Drop Marble">
        <Fab
          size="medium"
          onClick={addRandomMarble}
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            backgroundColor: '#FF6B6B',
            color: 'white',
            '&:hover': {
              backgroundColor: '#ff5252'
            }
          }}
          aria-label="Add random marble"
        >
          <AddIcon />
        </Fab>
      </Tooltip>

      {/* Initialization overlay */}
      {!isInitialized && !initError && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            fontSize: '1.2rem'
          }}
          role="status"
          aria-live="polite"
        >
          Initializing Physics & Audio...
        </Box>
      )}

      {/* Error overlay */}
      {initError && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            color: '#ff4444',
            fontSize: '1rem',
            padding: 2
          }}
          role="alert"
          aria-live="assertive"
        >
          {initError}
        </Box>
      )}
    </Box>
  );
});
PhysicsCanvas.displayName = 'PhysicsCanvas';
