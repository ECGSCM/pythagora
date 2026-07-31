import { Box as MUIBox, IconButton, Tooltip, Typography } from '@mui/material';
import type { PatchNode } from '../../types/patch';

interface ModuleSelectorProps {
  selectedNodeType?: PatchNode['type'];
  onSelect: (moduleType: PatchNode['type']) => void;
}

const MODULE_BUTTONS = [
  { type: 'marble', symbol: '◉', name: 'ORIGIN', key: '1' },
  { type: 'ramp', symbol: '△', name: 'SLOPE', key: '2' },
  { type: 'bumper', symbol: '◉', name: 'BASE', key: '3' },
  { type: 'chime', symbol: '✧', name: 'HEX', key: '4' },
  { type: 'spinner', symbol: '∞', name: 'SPIRAL', key: '5' },
  { type: 'funnel', symbol: '◈', name: 'PORTAL', key: '6' },
  { type: 'seesaw', symbol: '∞', name: 'BALANCE', key: '7' },
  { type: 'bell', symbol: '❖', name: 'AXIS', key: '8' },
] as const;

// Bottom-right module palette (keys 1-8). Pure MUI, styled exactly as before.
export function ModuleSelector({ selectedNodeType, onSelect }: ModuleSelectorProps) {
  return (
    <MUIBox
      sx={{
        position: 'absolute',
        // Clear the home indicator when the page is laid out edge-to-edge
        // (installed PWA). env() resolves to 0 elsewhere, so this is a no-op
        // in a normal browser tab.
        bottom: { xs: 'calc(10px + env(safe-area-inset-bottom))', sm: 20 },
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
        zIndex: 1000,
      }}
      role="toolbar"
      aria-label="Module selector"
    >
      <Typography
        variant="caption"
        sx={{
          fontSize: { xs: '0.5rem', sm: '0.65rem' },
          letterSpacing: '0.15em',
          color: '#888888',
          textAlign: 'center',
          mb: { xs: 0.2, sm: 0.325 },
        }}
      >
        MODULES
        {/* The "(1-8)" is a keyboard hint, so it only earns its space where
            there are keys to press. */}
        <MUIBox component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {' (1-8)'}
        </MUIBox>
      </Typography>
      <MUIBox
        sx={{
          // Mobile (§4.3): a 4x2 grid of 44px touch targets. This used to be a
          // single non-wrapping row with overflow-x and a deliberately hidden
          // scrollbar — but eight 44px buttons plus gaps need 380px against a
          // ~355px content box on a 390px phone, so the eighth module (AXIS)
          // sat past the right edge with no scrollbar to hint that it was
          // reachable at all: one of the eight placeable modules was simply
          // invisible. A grid keeps every module on screen at full touch size.
          display: { xs: 'grid', sm: 'flex' },
          gridTemplateColumns: { xs: 'repeat(4, 44px)', sm: 'none' },
          flexWrap: { sm: 'wrap' },
          gap: { xs: 0.5, sm: 0.975 },
          justifyContent: 'center',
          minWidth: { xs: 'auto', sm: 208 },
        }}
      >
        {MODULE_BUTTONS.map((module) => (
          <Tooltip key={module.type} title={`${module.name} (Press ${module.key})`} arrow>
            <IconButton
              onClick={() => onSelect(module.type)}
              sx={{
                background: selectedNodeType === module.type ? '#0A0A0A' : '#000000',
                border: selectedNodeType === module.type ? '1px solid #FFFFFF' : '1px solid #333333',
                color: '#FFFFFF',
                // 44px meets the mobile touch-target minimum (§4.3); desktop
                // keeps the original tighter sizing.
                width: { xs: 44, sm: 41.6 },
                height: { xs: 44, sm: 41.6 },
                minWidth: { xs: 44, sm: 41.6 },
                flexShrink: { xs: 0, sm: 1 },
                padding: 0,
                flexDirection: 'column',
                gap: 0,
                '&:hover': {
                  background: '#0A0A0A',
                  border: '1px solid #FFFFFF',
                },
              }}
              aria-label={`Select ${module.name} module`}
              aria-pressed={selectedNodeType === module.type}
            >
              <MUIBox
                sx={{
                  fontSize: { xs: '0.7rem', sm: '0.91rem' },
                  lineHeight: 1,
                  fontWeight: selectedNodeType === module.type ? 600 : 400,
                  height: { xs: 12, sm: 15.6 },
                }}
              >
                {module.symbol}
              </MUIBox>
              <Typography
                sx={{
                  fontSize: { xs: '0.05rem !important', sm: '0.065rem !important' },
                  letterSpacing: '0.05em',
                  color: selectedNodeType === module.type ? '#FFFFFF' : '#888888',
                  lineHeight: 1,
                  fontWeight: selectedNodeType === module.type ? 500 : 400,
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                {module.name}
              </Typography>
            </IconButton>
          </Tooltip>
        ))}
      </MUIBox>
    </MUIBox>
  );
}
