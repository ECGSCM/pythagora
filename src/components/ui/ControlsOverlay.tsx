import { Box as MUIBox, IconButton, Tooltip } from '@mui/material';

type EchoMode = 'off' | 'short' | 'long';

interface ControlsOverlayProps {
  isMuted: boolean;
  echoMode: EchoMode;
  divineLightActive: boolean;
  onMute: () => void;
  onEchoModeChange: (mode: EchoMode) => void;
  onDivineLightToggle: () => void;
}

// Floating audio-control toolbar (mute / echo / divine light). Pure MUI, styled
// exactly as before; all behaviour is driven by props from the canvas shell.
export function ControlsOverlay({
  isMuted,
  echoMode,
  divineLightActive,
  onMute,
  onEchoModeChange,
  onDivineLightToggle,
}: ControlsOverlayProps) {
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
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
              '&:hover': {
                background: '#0A0A0A',
                border: '1px solid #FFFFFF',
              },
            }}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            <MUIBox sx={{ fontSize: { xs: 16, sm: 20 } }}>{isMuted ? '◉' : '◎'}</MUIBox>
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
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
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
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
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
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
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
              width: { xs: 36, sm: 48 },
              height: { xs: 36, sm: 48 },
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
      </MUIBox>
    </MUIBox>
  );
}
