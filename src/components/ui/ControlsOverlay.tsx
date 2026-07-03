import { Box as MUIBox, IconButton, Tooltip } from '@mui/material';
import { useEffect, useRef } from 'react';

type EchoMode = 'off' | 'short' | 'long';

// Sound-reactive mute icon (§4.4): a subtle pulse, not a VU meter. Polled at
// 150ms (well under 20fps-worth of updates) via direct DOM mutation on a ref
// so it never triggers a React re-render.
const PULSE_INTERVAL_MS = 150;
const PULSE_SCALE_MIN = 1.0;
const PULSE_SCALE_MAX = 1.06;

interface ControlsOverlayProps {
  isMuted: boolean;
  echoMode: EchoMode;
  divineLightActive: boolean;
  binauralActive: boolean;
  followCamera: boolean;
  /** Presence (§4.1): gates the mute-icon pulse — no point polling levels
   * while the overlay is faded out and un-interactable. */
  present: boolean;
  /** Normalized 0..1 output level reader (AudioEngine.getOutputLevel). */
  getLevel?: () => number;
  onMute: () => void;
  onEchoModeChange: (mode: EchoMode) => void;
  onDivineLightToggle: () => void;
  onBinauralToggle: () => void;
  onFollowToggle: () => void;
}

// Floating audio-control toolbar (mute / echo / divine light). Pure MUI, styled
// exactly as before; all behaviour is driven by props from the canvas shell.
export function ControlsOverlay({
  isMuted,
  echoMode,
  divineLightActive,
  binauralActive,
  followCamera,
  present,
  getLevel,
  onMute,
  onEchoModeChange,
  onDivineLightToggle,
  onBinauralToggle,
  onFollowToggle,
}: ControlsOverlayProps) {
  const muteIconRef = useRef<HTMLDivElement>(null);

  // While present and unmuted, gently scale the mute icon with the output
  // level. Direct style mutation (no setState) keeps this off the React
  // render path entirely — a CSS transform, no layout thrash.
  useEffect(() => {
    const node = muteIconRef.current;
    if (!present || isMuted || !getLevel) {
      if (node) node.style.transform = 'scale(1)';
      return;
    }
    const id = setInterval(() => {
      const level = Math.max(0, Math.min(1, getLevel()));
      const scale = PULSE_SCALE_MIN + level * (PULSE_SCALE_MAX - PULSE_SCALE_MIN);
      if (node) node.style.transform = `scale(${scale})`;
    }, PULSE_INTERVAL_MS);
    return () => {
      clearInterval(id);
      if (node) node.style.transform = 'scale(1)';
    };
  }, [present, isMuted, getLevel]);
  return (
    <MUIBox
      sx={{
        position: 'absolute',
        top: { xs: 10, sm: 20 },
        right: { xs: 10, sm: 20 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1, sm: 2 },
        zIndex: 1000,
      }}
    >
      <MUIBox
        sx={{
          display: 'flex',
          gap: { xs: 0.25, sm: 0.5 },
          flexDirection: 'column',
        }}
        role="toolbar"
        aria-label="Audio controls"
      >
        {/* Mute Control */}
        <Tooltip title={isMuted ? 'Unmute (Press M)' : 'Mute (Press M)'}>
          <IconButton
            onClick={onMute}
            sx={{
              background: '#000000',
              border: '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            <MUIBox ref={muteIconRef} sx={{ fontSize: { xs: 16, sm: 20 }, display: 'inline-block' }}>
              {isMuted ? '◉' : '◎'}
            </MUIBox>
          </IconButton>
        </Tooltip>

        {/* Echo Mode Controls */}
        <Tooltip title="Short Echo (200ms delay)">
          <IconButton
            onClick={() => onEchoModeChange('short')}
            sx={{
              background: echoMode === 'short' ? '#0A0A0A' : '#000000',
              border: echoMode === 'short' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label="Enable short echo mode"
          >
            <MUIBox sx={{ fontSize: { xs: 12, sm: 16 } }}>∿</MUIBox>
          </IconButton>
        </Tooltip>

        <Tooltip title="Long Echo (800ms delay)">
          <IconButton
            onClick={() => onEchoModeChange('long')}
            sx={{
              background: echoMode === 'long' ? '#0A0A0A' : '#000000',
              border: echoMode === 'long' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label="Enable long echo mode"
          >
            <MUIBox sx={{ fontSize: { xs: 14, sm: 18 } }}>∿∿</MUIBox>
          </IconButton>
        </Tooltip>

        <Tooltip title="Echo Off">
          <IconButton
            onClick={() => onEchoModeChange('off')}
            sx={{
              background: echoMode === 'off' ? '#0A0A0A' : '#000000',
              border: echoMode === 'off' ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label="Disable echo"
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>○</MUIBox>
          </IconButton>
        </Tooltip>

        {/* Divine Light Control */}
        <Tooltip title={divineLightActive ? 'Disable Divine Light (Press L)' : 'Enable Divine Light (Press L)'}>
          <IconButton
            onClick={onDivineLightToggle}
            sx={{
              background: divineLightActive
                ? 'linear-gradient(135deg, #FFD700 0%, #FF6B6B 50%, #4ECDC4 100%)'
                : '#000000',
              border: divineLightActive ? '2px solid #FFD700' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: divineLightActive
                  ? 'linear-gradient(135deg, #FFD700 0%, #FF6B6B 50%, #4ECDC4 100%)'
                  : '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label={divineLightActive ? 'Disable divine light' : 'Enable divine light'}
          >
            <MUIBox sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 'bold' }}>✦</MUIBox>
          </IconButton>
        </Tooltip>

        {/* Binaural Drift Control */}
        <Tooltip title="Binaural drift (headphones) (Press B)">
          <IconButton
            onClick={onBinauralToggle}
            sx={{
              background: binauralActive ? '#0A0A0A' : '#000000',
              border: binauralActive ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label={binauralActive ? 'Disable binaural drift' : 'Enable binaural drift'}
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>◐</MUIBox>
          </IconButton>
        </Tooltip>

        {/* Follow Camera Control */}
        <Tooltip title="Follow camera (Press F)">
          <IconButton
            onClick={onFollowToggle}
            sx={{
              background: followCamera ? '#0A0A0A' : '#000000',
              border: followCamera ? '1px solid #FFFFFF' : '1px solid #333333',
              color: '#FFFFFF',
              width: { xs: 44, sm: 48 },
              height: { xs: 44, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label={followCamera ? 'Disable follow camera' : 'Enable follow camera'}
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>◎→</MUIBox>
          </IconButton>
        </Tooltip>
      </MUIBox>
    </MUIBox>
  );
}
