import React from 'react';
import { Box, SxProps, Theme } from '@mui/material';

// Sacred geometry symbol definitions
export interface SacredSymbol {
  svg: string;
  meaning: string;
  proportions: string;
}

const sacredSymbols: Record<string, SacredSymbol> = {
  // Marble: Bindu (Origin Point) - Circle with central dot
  marble: {
    svg: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>`,
    meaning: 'Origin consciousness',
    proportions: 'golden ratio circle'
  },

  // Ramp: Pyramid Triangle - Sacred slope
  ramp: {
    svg: `<polygon points="12,2 22,22 2,22" fill="none" stroke="currentColor" stroke-width="1"/>
          <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2,2"/>`,
    meaning: 'Ascension path',
    proportions: 'egyptian pyramid'
  },

  // Bumper: Foundation Square - Stable base
  bumper: {
    svg: `<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1"/>
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="0.5"/>`,
    meaning: 'Foundation stability',
    proportions: 'metatron cube face'
  },

  // Chime: Hexagram - Six-pointed star
  chime: {
    svg: `<polygon points="12,2 14,8 20,8 16,12 18,18 12,14 6,18 8,12 4,8 10,8"
                   fill="none" stroke="currentColor" stroke-width="1"/>`,
    meaning: 'Harmonic resonance',
    proportions: 'star of david'
  },

  // Spinner: Golden Spiral - Fibonacci evolution
  spinner: {
    svg: `<path d="M12,2 Q22,2 22,12 Q22,22 12,22 Q2,22 2,12 Q2,8 6,6"
                  fill="none" stroke="currentColor" stroke-width="1"/>`,
    meaning: 'Infinite evolution',
    proportions: 'fibonacci spiral'
  },

  // Funnel: Vesica Piscis - Divine intersection
  funnel: {
    svg: `<path d="M12,2 Q20,12 12,22 Q4,12 12,2" fill="none" stroke="currentColor" stroke-width="1"/>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>`,
    meaning: 'Divine portal',
    proportions: 'vesica piscis'
  },

  // Seesaw: Infinity Loop - Eternal balance
  seesaw: {
    svg: `<path d="M4,12 Q4,4 12,4 Q20,4 20,12 Q20,20 12,20 Q4,20 4,12"
                   fill="none" stroke="currentColor" stroke-width="1"/>
          <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="0.5"/>`,
    meaning: 'Eternal balance',
    proportions: 'lemniscate'
  },

  // Bell: Axis Mundi - Cosmic pillar
  bell: {
    svg: `<line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="1"/>
          <circle cx="12" cy="4" r="2" fill="currentColor"/>
          <circle cx="12" cy="20" r="3" fill="none" stroke="currentColor" stroke-width="1"/>
          <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="0.5"/>`,
    meaning: 'Cosmic axis',
    proportions: 'world pillar'
  }
};

interface SacredGeometryProps {
  symbol: keyof typeof sacredSymbols;
  size?: number;
  className?: string;
  animate?: boolean;
  sx?: SxProps<Theme>;
}

export const SacredGeometry: React.FC<SacredGeometryProps> = ({
  symbol,
  size = 24,
  className = '',
  animate = false,
  sx = {}
}) => {
  const symbolData = sacredSymbols[symbol];

  if (!symbolData) {
    console.warn(`Unknown sacred symbol: ${symbol}`);
    return null;
  }

  return (
    <Box
      className={`sacred-geometry ${className} ${animate ? 'sacred-pulse' : ''}`}
      sx={{
        width: size,
        height: size,
        color: '#FFFFFF',
        '&.sacred-pulse': {
          animation: 'sacred-pulse 3s ease-in-out infinite'
        },
        ...sx
      }}
      aria-label={symbol}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <g dangerouslySetInnerHTML={{ __html: symbolData.svg }} />
      </svg>
    </Box>
  );
};

// Unicode fallback symbols for 3D Text components
export const sacredUnicodeSymbols: Record<string, string> = {
  marble: '◉',    // Circle with dot
  ramp: '△',      // Triangle
  bumper: '◉',    // Circle with dot (foundation)
  chime: '✧',     // Six-pointed star
  spinner: '∞',   // Infinity
  funnel: '◈',    // Diamond
  seesaw: '∞',    // Infinity
  bell: '❖'      // Hexagon
};

export default SacredGeometry;
