import React from 'react';
import { Box, Container, Button } from '@mui/material';
import type { SessionSummary } from '../types/session';
import { toRomanNumeral } from '../config/experience';

interface LandingProps {
  onEnter: () => void;
  /** Snapshot of the previous session (§4.2), null before the first visit. */
  lastSession?: SessionSummary | null;
}

export const Landing: React.FC<LandingProps> = ({ onEnter, lastSession }) => {
  return (
    <Box sx={{
      minHeight: '100vh',
      background: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Sacred Geometry Background - Flower of Life Pattern */}
      <Box sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.03,
        pointerEvents: 'none'
      }}>
        <svg width="800" height="800" viewBox="0 0 800 800">
          {/* Flower of Life - Center circle */}
          <circle cx="400" cy="400" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          {/* First ring of 6 circles */}
          <circle cx="400" cy="340" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="452" cy="370" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="452" cy="430" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="400" cy="460" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="348" cy="430" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="348" cy="370" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          {/* Second ring */}
          <circle cx="400" cy="280" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="504" cy="340" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="504" cy="460" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="400" cy="520" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="296" cy="460" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="296" cy="340" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </Box>

      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', position: 'relative', zIndex: 1, px: 2 }}>
          {/* Metatron's Cube Symbol */}
          <Box sx={{ mb: 8, display: 'flex', justifyContent: 'center' }}>
            <svg width="160" height="160" viewBox="0 0 160 160" style={{ color: '#FFFFFF' }}>
              {/* Outer circle */}
              <circle cx="80" cy="80" r="75" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              {/* Inner hexagon */}
              <polygon
                points="80,20 125,50 125,110 80,140 35,110 35,50"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.5"
              />
              {/* Center circle */}
              <circle cx="80" cy="80" r="10" fill="currentColor" opacity="0.8" />
              {/* Connecting lines to vertices */}
              <line x1="80" y1="80" x2="80" y2="20" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              <line x1="80" y1="80" x2="125" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              <line x1="80" y1="80" x2="125" y2="110" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              <line x1="80" y1="80" x2="80" y2="140" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              <line x1="80" y1="80" x2="35" y2="110" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              <line x1="80" y1="80" x2="35" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
              {/* Inner triangle (upward) */}
              <polygon
                points="80,35 115,95 45,95"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity="0.3"
              />
              {/* Inner triangle (downward) */}
              <polygon
                points="80,125 115,65 45,65"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </svg>
          </Box>

          {/* Subtitle */}
          <Box sx={{ mb: 6 }}>
            <Box
              component="h1"
              sx={{
                fontWeight: 300,
                letterSpacing: '0.3em',
                fontSize: '0.9rem',
                color: '#CCCCCC',
                mb: 1
              }}
            >
              PYTHAGORA
            </Box>
            <Box
              component="p"
              sx={{
                fontWeight: 300,
                letterSpacing: '0.15em',
                fontSize: '0.7rem',
                color: '#666666'
              }}
            >
              SACRED GEOMETRY • HARMONIC RESONANCE
            </Box>
          </Box>

          {/* Enter Button */}
          <Button
            variant="outlined"
            size="large"
            onClick={onEnter}
            sx={{
              px: 6,
              py: 2,
              background: 'transparent',
              border: '1px solid #FFFFFF',
              color: '#FFFFFF',
              letterSpacing: '0.2em',
              fontSize: '0.75rem',
              fontWeight: 400,
              '&:hover': {
                background: '#FFFFFF',
                color: '#000000',
                border: '1px solid #FFFFFF'
              }
            }}
          >
            ENTER THE SACRED
          </Button>

          {/* Session summary (§4.2): a single quiet line, only when a
              previous session exists. Deliberately understated — no numeric
              HUD anywhere else in the app, just this one closing note. */}
          {lastSession && (
            <Box
              component="p"
              sx={{
                mt: 3,
                fontWeight: 300,
                letterSpacing: '0.15em',
                fontSize: '0.65rem',
                color: '#888888',
                textTransform: 'lowercase'
              }}
            >
              {`last passage — ${lastSession.collisions} resonances · ${toRomanNumeral(lastSession.maxCombo)} chain · key of ${lastSession.keyName}`}
            </Box>
          )}

          {/* Module Symbols Showcase */}
          <Box sx={{ mt: 10, display: 'flex', justifyContent: 'center', gap: { xs: 2, md: 3 }, flexWrap: 'wrap' }}>
            {[
              { symbol: '◉', name: 'ORIGIN' },
              { symbol: '△', name: 'SLOPE' },
              { symbol: '◉', name: 'BASE' },
              { symbol: '✧', name: 'HEX' },
              { symbol: '∞', name: 'SPIRAL' },
              { symbol: '◈', name: 'PORTAL' },
              { symbol: '∞', name: 'BALANCE' },
              { symbol: '❖', name: 'AXIS' }
            ].map((module) => (
              <Box
                key={module.name}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: '60px'
                }}
              >
                <Box
                  sx={{
                    fontSize: { xs: '1.3rem', md: '1.5rem' },
                    color: '#FFFFFF',
                    opacity: 0.9,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      opacity: 1,
                      filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                    }
                  }}
                >
                  {module.symbol}
                </Box>
                <Box
                  sx={{
                    fontSize: { xs: '0.5rem', md: '0.55rem' },
                    letterSpacing: '0.15em',
                    color: '#888888',
                    fontWeight: 400
                  }}
                >
                  {module.name}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>

      {/* Ambient corner decorations */}
      <Box
        sx={{
          position: 'absolute',
          top: 40,
          left: 40,
          width: 60,
          height: 60,
          border: '1px solid #333333',
          opacity: 0.3
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 40,
          right: 40,
          width: 60,
          height: 60,
          border: '1px solid #333333',
          opacity: 0.3
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: 40,
          left: 40,
          width: 60,
          height: 60,
          border: '1px solid #333333',
          opacity: 0.3
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          width: 60,
          height: 60,
          border: '1px solid #333333',
          opacity: 0.3
        }}
      />
    </Box>
  );
};

export default Landing;
