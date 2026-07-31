import React, { useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Physics } from '@react-three/cannon';
import { PerformanceMonitor } from '@react-three/drei';
import { Box as MUIBox, Typography } from '@mui/material';
import { AudioEngine } from '../audio/engine';
import type { PatchNode } from '../types/patch';
import { PHYSICS, GAMEPLAY } from '../config/world';
import { PRESENCE, POSTFX, QUALITY_TIERS } from '../config/experience';
import { useGameStore } from '../stores/gameStore';
import { Scene } from './canvas/Scene';
import { QualityController } from './canvas/QualityController';
import { ControlsOverlay } from './ui/ControlsOverlay';
import { ModuleSelector } from './ui/ModuleSelector';
import { useLiveCallback } from './canvas/hooks';
import type { SessionSummary } from '../types/session';

type EchoMode = 'off' | 'short' | 'long';

// Adaptive quality (§7D): PerformanceMonitor samples real FPS and steps the
// store's qualityTier down/up. These handlers are pure store calls with no
// closure over component state, so they live at module scope (stable
// references, no re-creation per render) rather than as useCallback in the
// component below.
//
// Bounds [40, 55]: below 40fps for most of a sampling window steps the tier
// down; above 55fps steps it up. iterations=10 * ms=250 (both defaults) means
// a decision needs ~2.5s of sustained samples — PerformanceMonitor's own
// debounce, so no hand-rolled timer is needed here.
//
// Deliberately NO `flipflops`/`onFallback` (drei's default is Infinity, i.e.
// the fallback can never latch). `api.flipped` counts BOTH inclines and
// declines, and `flipped > flipflops` sets `api.fallback = true`, which also
// stops all further sampling. With a constant upper bound of 55, a machine
// comfortably holding 60fps fires onIncline on EVERY ~2.5s window, so a
// finite flipflops count was reached after a few seconds of a perfectly
// healthy session — the old flipflops={3} + onFallback(setQualityTier('low'))
// killed bloom/grain/dpr ~10s in and never recovered, because sampling had
// stopped. Adaptive quality is now stepping only: onDecline/onIncline move the
// tier one step at a time and remain fully reversible.
const handlePerfDecline = () => useGameStore.getState().stepQualityTierDown();
const handlePerfIncline = () => useGameStore.getState().stepQualityTierUp();
const perfMonitorBounds = (): [number, number] => [40, 55];

interface Physics3DCanvasProps {
  nodes: PatchNode[];
  onNodeAdd?: (position: { x: number; y: number; z: number }) => void;
  onModuleTypeChange?: (moduleType: PatchNode['type']) => void;
  selectedNodeType?: PatchNode['type'];
  onClearAll?: () => void;
  /** Monotonic "clear all" counter owned by App: bumped by handleClearAll at
   * the same time the module list is emptied. Threaded down to <Scene>, which
   * also owns live marbles / evictions / ripples, so C really does clear the
   * whole board and not just the modules (README: "Clear all placed modules
   * and marbles"). */
  clearToken?: number;
  onToggleHelp?: () => void;
  onExit?: (summary: SessionSummary) => void;
  /** Presence (§4.1): a single hook instance lives in App and is threaded down
   * here so the help card (owned by App) and this shell's own overlays fade
   * in lockstep off one shared idle timer. */
  present: boolean;
}

// Canvas shell: owns the R3F Canvas + Physics provider, the audio engine
// lifecycle, window-level keyboard handling, and the overlay UI. All scene
// composition lives in <Scene>; all gameplay state lives in the zustand store.
export const Physics3DCanvas: React.FC<Physics3DCanvasProps> = React.memo(
  ({
    nodes,
    onNodeAdd,
    onModuleTypeChange,
    selectedNodeType = 'marble',
    onClearAll,
    clearToken = 0,
    onToggleHelp,
    onExit,
    present,
  }) => {
    const [engine, setEngine] = useState<AudioEngine | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [echoMode, setEchoMode] = useState<EchoMode>('off');
    const [divineLightActive, setDivineLightActive] = useState(false);
    const [binauralActive, setBinauralActive] = useState(false);
    // Follow camera (§3.5). Local shell state (mirrors divineLight/binaural),
    // passed down to Scene; OrbitControls is disabled while it's on.
    const [followCamera, setFollowCamera] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);

    // Marble drop trigger — incremented on Space, consumed in Scene's frame loop.
    const [marbleDropTrigger, setMarbleDropTrigger] = useState(0);

    useEffect(() => {
      // Track the engine in a local so cleanup disposes the instance this effect
      // actually created (the old cleanup read the state from the mount render —
      // always null — so dispose() was unreachable and the whole audio engine
      // leaked on remount; REFACTORING_PLAN.md A1). Construction is synchronous
      // and needs no user gesture, so readiness is gated on construction, not on
      // Tone.start() (which can only succeed after a gesture). The engine kicks
      // its own resume on the first collision, so audio comes up on interaction.
      let engineInstance: AudioEngine | null = null;
      let cancelled = false;

      queueMicrotask(() => {
        if (cancelled) return;
        try {
          engineInstance = new AudioEngine();
          // Best-effort early start; resolves regardless of gesture state and
          // never rejects, so it can't block readiness (A11).
          void engineInstance.resume();
          setEngine(engineInstance);
          setIsInitialized(true);
        } catch (error) {
          setInitError(error instanceof Error ? error.message : 'Failed to initialize audio system');
        }
      });

      return () => {
        cancelled = true;
        engineInstance?.dispose();
        setEngine(null);
      };
    }, []);

    // Adaptive quality initial hint (§7D): PerformanceMonitor needs a few
    // seconds of real samples before its first onDecline can fire, so a
    // mobile device would otherwise render several seconds at full 'high'
    // tier (heavy bloom + 200-star field) before dropping — a visible initial
    // stutter. Narrow viewport width is a reliable enough proxy (same signal
    // PostFX used to gate its own mobile branch pre-§7D) to start at 'medium'
    // immediately instead. One-shot, at Physics3DCanvas mount: after this,
    // only the PerformanceMonitor below moves the tier.
    useEffect(() => {
      if (typeof window !== 'undefined' && window.innerWidth < POSTFX.mobileMaxWidth) {
        useGameStore.getState().setQualityTier('medium');
      }
    }, []);

    const handleMute = () => {
      const next = !isMuted;
      setIsMuted(next);
      // True mute via Tone.Destination; the -12dB master volume is left intact
      // (REFACTORING_PLAN.md A3/A4).
      engine?.setMuted(next);
    };

    const handleEchoModeChange = (mode: EchoMode) => {
      setEchoMode(mode);
      engine?.setEchoMode(mode);
    };

    const handleModuleSelect = (moduleType: PatchNode['type']) => {
      onModuleTypeChange?.(moduleType);
    };

    const handleDivineLightToggle = () => {
      setDivineLightActive((prev) => !prev);
    };

    const handleBinauralToggle = () => {
      const next = !binauralActive;
      setBinauralActive(next);
      engine?.setBinaural(next);
    };

    const handleFollowToggle = () => {
      setFollowCamera((prev) => !prev);
    };

    // Stable across renders (only changes when the engine instance itself
    // does) so ControlsOverlay's pulse effect isn't torn down and rebuilt on
    // every unrelated state change here (echo mode, follow camera, ...).
    const getOutputLevel = useCallback(() => engine?.getOutputLevel() ?? 0, [engine]);

    // Aurora pulse (§3.4): the harmony engine steps the key every 8 collisions;
    // mirror that into the store so AuroraPulse can fire. Registered outside
    // render so it re-binds only when the engine instance changes.
    useEffect(() => {
      if (!engine) return;
      engine.setModulationListener((index, name) => {
        useGameStore.getState().setModulation(index, name);
      });
    }, [engine]);

    // Shimmer drone layer follows combo (§2.1): subscribe to the store OUTSIDE
    // React render so a combo tick never re-renders the canvas — the engine is
    // poked imperatively only when the threshold is crossed. The shimmer and the
    // goldenMarble unlock are one synchronized event, so the threshold is the
    // single game-layer value GAMEPLAY.unlockThresholds.goldenMarble (the audio
    // package must not depend on game config — the engine API stays a bool).
    const shimmerThreshold = GAMEPLAY.unlockThresholds.goldenMarble;
    useEffect(() => {
      if (!engine) return;
      let prevActive = useGameStore.getState().combo.count >= shimmerThreshold;
      engine.setShimmer(prevActive);
      const unsubscribe = useGameStore.subscribe((state) => {
        const active = state.combo.count >= shimmerThreshold;
        if (active !== prevActive) {
          prevActive = active;
          engine.setShimmer(active);
        }
      });
      return unsubscribe;
    }, [engine, shimmerThreshold]);

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
        const modes: EchoMode[] = ['off', 'short', 'long'];
        const nextIndex = (modes.indexOf(echoMode) + 1) % modes.length;
        handleEchoModeChange(modes[nextIndex]);
      } else if (key === 'l') {
        handleDivineLightToggle();
      } else if (key === 'b') {
        handleBinauralToggle();
      } else if (key === 'f') {
        handleFollowToggle();
      } else if (event.code === 'Space') {
        // A focused button (MUI IconButton, etc.) treats Space as its native
        // activation key — preventDefault() here would suppress that and drop
        // a marble instead, breaking keyboard activation of every overlay
        // button. Let the browser handle it and skip the marble drop.
        const onInteractive = !!target?.closest('button, a[href], select, [role="button"]');
        if (onInteractive) return;
        event.preventDefault();
        // Space always drops a marble, regardless of the selected module type.
        setMarbleDropTrigger((prev) => prev + 1);
      } else if (key === 'c') {
        onClearAll?.();
      } else if (key === 'h') {
        onToggleHelp?.();
      } else if (key === 'escape') {
        // Session summary snapshot (§4.2): captured at the moment of exit
        // from the store's imperative getState() + the engine's current
        // harmony key, so App can hand it to the Landing page.
        const { totalCollisions, maxCombo } = useGameStore.getState().sessionStats;
        onExit?.({
          collisions: totalCollisions,
          maxCombo,
          keyName: engine?.getCurrentKeyName() ?? 'C',
        });
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
          background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)',
        }}
        role="region"
        aria-label="3D physics canvas for audio synthesis"
      >
        <Canvas
          shadows={false}
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false, // nothing uses the stencil buffer
            depth: true,
          }}
          dpr={QUALITY_TIERS.high.dpr}
          frameloop="always"
        >
          {/* Adaptive quality (§7D): PerformanceMonitor samples real FPS and
              steps qualityTier down/up (see the module-scope handlers above);
              QualityController reacts to the tier by pushing a new dpr through
              r3f's setDpr. Neither needs to wrap Physics/Scene functionally —
              PerformanceMonitor's own sampling runs off useFrame regardless of
              where in the tree it sits — but both must be Canvas descendants. */}
          <PerformanceMonitor
            bounds={perfMonitorBounds}
            onIncline={handlePerfIncline}
            onDecline={handlePerfDecline}
          >
            <QualityController />
            <Suspense fallback={null}>
              <Physics
                gravity={PHYSICS.gravity}
                iterations={PHYSICS.iterations}
                stepSize={PHYSICS.stepSize}
                maxSubSteps={PHYSICS.maxSubSteps}
                broadphase={PHYSICS.broadphase}
                defaultContactMaterial={PHYSICS.defaultContactMaterial}
                allowSleep={PHYSICS.allowSleep}
                size={PHYSICS.size}
              >
                <Scene
                  nodes={nodes}
                  onCollision={(event) => {
                    // The engine resumes its own context internally on first hit.
                    engine?.triggerCollision(event);
                  }}
                  onNodeAdd={onNodeAdd}
                  divineLightActive={divineLightActive}
                  marbleDropTrigger={marbleDropTrigger}
                  clearToken={clearToken}
                  followCamera={followCamera}
                />
              </Physics>
            </Suspense>
          </PerformanceMonitor>
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
              color: 'white',
            }}
            role="status"
            aria-live="polite"
          >
            <Typography variant="h6" gutterBottom>
              Initializing 3D Physics &amp; Audio...
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
              borderRadius: 2,
            }}
            role="alert"
            aria-live="assertive"
          >
            <Typography variant="h6" gutterBottom>
              Initialization Error
            </Typography>
            <Typography variant="body2">{initError}</Typography>
          </MUIBox>
        )}

        {/* Presence (§4.1): overlay chrome fades to invisible after 30s of no
            pointer/keyboard/touch activity, and back in quickly on the next
            touch. Keyboard shortcuts keep working throughout — nothing here
            unmounts, only fades — see usePresence.ts. */}
        <MUIBox
          sx={{
            opacity: present ? 1 : 0,
            transition: `opacity ${present ? PRESENCE.fadeInSec : PRESENCE.fadeOutSec}s`,
            pointerEvents: present ? 'auto' : 'none',
          }}
        >
          <ControlsOverlay
            isMuted={isMuted}
            echoMode={echoMode}
            divineLightActive={divineLightActive}
            binauralActive={binauralActive}
            followCamera={followCamera}
            present={present}
            getLevel={getOutputLevel}
            onMute={handleMute}
            onEchoModeChange={handleEchoModeChange}
            onDivineLightToggle={handleDivineLightToggle}
            onBinauralToggle={handleBinauralToggle}
            onFollowToggle={handleFollowToggle}
          />
        </MUIBox>

        <MUIBox
          sx={{
            opacity: present ? 1 : 0,
            transition: `opacity ${present ? PRESENCE.fadeInSec : PRESENCE.fadeOutSec}s`,
            pointerEvents: present ? 'auto' : 'none',
          }}
        >
          <ModuleSelector selectedNodeType={selectedNodeType} onSelect={handleModuleSelect} />
        </MUIBox>
      </MUIBox>
    );
  },
  (prevProps, nextProps) =>
    // Custom comparison to prevent unnecessary re-renders. `present` MUST be
    // compared too — it's App's single usePresence() instance threaded down
    // as a prop, and it changes independently of nodes/selectedNodeType; if
    // it were left out here, a present-state transition from App would be
    // silently dropped by memo and the overlay would never fade. Same for
    // `clearToken`: App bumps it alongside `setNodes([])`, and if it were left
    // out here the nodes-identity change would re-render this shell with the
    // STALE token, so <Scene> would never see the bump and the marbles would
    // survive a "Clear all".
    prevProps.nodes === nextProps.nodes &&
    prevProps.selectedNodeType === nextProps.selectedNodeType &&
    prevProps.clearToken === nextProps.clearToken &&
    prevProps.present === nextProps.present,
);
Physics3DCanvas.displayName = 'Physics3DCanvas';
