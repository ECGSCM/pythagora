import React from 'react';
import {
  Box,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  Chip
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Science as ScienceIcon,
  MusicNote as MusicIcon,
  Psychology as PsychologyIcon
} from '@mui/icons-material';

interface LandingProps {
  onEnter: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            🧩 Pythagora-Synth
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
            Physics-Based Musical Marble Run
          </Typography>
          <Typography variant="body1" sx={{ mb: 6, fontSize: '1.2rem', maxWidth: 600, mx: 'auto' }}>
            Create amazing music by building 3D Pythagora switch contraptions. 
            Drop marbles and watch them trigger beautiful sounds as they interact with your modules!
          </Typography>
          
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={onEnter}
            sx={{
              px: 4,
              py: 2,
              fontSize: '1.2rem',
              background: 'linear-gradient(45deg, #00BFA6 30%, #4ECDC4 90%)',
              '&:hover': {
                background: 'linear-gradient(45deg, #00A693 30%, #45B7B8 90%)',
                transform: 'scale(1.05)'
              },
              transition: 'all 0.3s'
            }}
          >
            Start Creating Music
          </Button>
        </Box>

        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, 
          gap: 3, 
          mt: 4 
        }}>
          <Card sx={{ 
            background: 'rgba(26, 26, 46, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <MusicIcon sx={{ fontSize: 40, color: '#00BFA6', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Interactive Music
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Physics collisions trigger synthesized sounds in real-time
              </Typography>
            </CardContent>
          </Card>
          
          <Card sx={{ 
            background: 'rgba(26, 26, 46, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <ScienceIcon sx={{ fontSize: 40, color: '#FF6B6B', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                3D Physics
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Realistic physics simulation with beautiful 3D graphics
              </Typography>
            </CardContent>
          </Card>
          
          <Card sx={{ 
            background: 'rgba(26, 26, 46, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <PsychologyIcon sx={{ fontSize: 40, color: '#FD79A8', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Creative Expression
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Build unique musical contraptions with modular components
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="h6" gutterBottom>
            Available Modules
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              '🔴 Marble',
              '📐 Ramp', 
              '🥁 Bumper',
              '🎵 Chime',
              '🌀 Spinner',
              '🌪️ Funnel',
              '⚖️ Seesaw',
              '🔔 Bell'
            ].map((module) => (
              <Chip 
                key={module} 
                label={module} 
                variant="outlined" 
                size="small"
                sx={{ color: 'white', borderColor: 'rgba(255, 255, 255, 0.3)' }}
              />
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
};