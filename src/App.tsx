import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
  Typography,
  Snackbar,
  Card,
  CardContent
} from '@mui/material';
import { Physics3DCanvas } from './components/Physics3DCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './pages/Landing';
import { PatchNode } from './types/db.types';
import { CollisionEvent } from './engines/physics';

// Divine Monochrome Theme - Sacred minimalist design
const divineTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFFFFF',
      light: '#FFFFFF',
      dark: '#CCCCCC',
      contrastText: '#000000'
    },
    secondary: {
      main: '#888888',
      light: '#AAAAAA',
      dark: '#666666',
      contrastText: '#000000'
    },
    background: {
      default: '#000000',
      paper: '#0A0A0A',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      disabled: '#666666'
    },
    divider: '#333333',
  },
  typography: {
    fontFamily: '"Cinzel", "Trajan", "Times New Roman", serif',
    h1: { fontWeight: 300, letterSpacing: '0.2em' },
    h2: { fontWeight: 300, letterSpacing: '0.15em' },
    h3: { fontWeight: 400, letterSpacing: '0.1em' },
    h4: { fontWeight: 400, letterSpacing: '0.1em' },
    h5: { fontWeight: 400, letterSpacing: '0.05em' },
    h6: { fontWeight: 500, letterSpacing: '0.05em' },
    body1: { fontWeight: 300, letterSpacing: '0.02em' },
    body2: { fontWeight: 300, letterSpacing: '0.02em' },
    button: { fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase' }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#333333 #000000",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            backgroundColor: "#000000",
            width: 6,
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 3,
            backgroundColor: "#333333",
            minHeight: 24,
          },
        },
        '@font-face': {
          fontFamily: 'Cinzel',
          src: `url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&display=swap')`
        }
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderWidth: 1,
          '&:hover': {
            borderWidth: 1
          }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)'
          }
        }
      }
    }
  },
});

const moduleTypes = [
  { type: 'marble', name: 'Origin', description: 'Drop marble', symbol: 'marble' },
  { type: 'ramp', name: 'Slope', description: 'Guiding path', symbol: 'ramp' },
  { type: 'bumper', name: 'Base', description: 'Foundation', symbol: 'bumper' },
  { type: 'chime', name: 'Hex', description: 'Resonance', symbol: 'chime' },
  { type: 'spinner', name: 'Spiral', description: 'Evolution', symbol: 'spinner' },
  { type: 'funnel', name: 'Portal', description: 'Transcendence', symbol: 'funnel' },
  { type: 'seesaw', name: 'Balance', description: 'Equilibrium', symbol: 'seesaw' },
  { type: 'bell', name: 'Axis', description: 'Cosmic pillar', symbol: 'bell' },
];

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [nodes, setNodes] = useState<PatchNode[]>([]);
  const [selectedModuleType, setSelectedModuleType] = useState<string>('marble');
  const [notification, setNotification] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);

  // Add initial demo modules when starting
  useEffect(() => {
    if (!showLanding && nodes.length === 0) {
      const demoModules: PatchNode[] = [
        {
          id: 'ramp-demo-1',
          type: 'ramp',
          position: { x: -5, y: 8 },
          params: { angle: 30 }
        },
        {
          id: 'bumper-demo-1',
          type: 'bumper',
          position: { x: 0, y: 5 },
          params: { pitch: 'C4' }
        },
        {
          id: 'chime-demo-1',
          type: 'chime',
          position: { x: 3, y: 3 },
          params: { note: 'E4' }
        },
        {
          id: 'bell-demo-1',
          type: 'bell',
          position: { x: 6, y: 1 },
          params: { frequency: 528 }
        }
      ];
      setNodes(demoModules);

      setNotification({
        message: 'Click to drop marbles and create sacred music',
        severity: 'info'
      });
    }
  }, [showLanding, nodes.length]);

  // Handle adding new modules
  const handleModuleAdd = useCallback((position: { x: number; y: number; z?: number }) => {
    if (selectedModuleType === 'marble') return; // Marbles are handled directly by PhysicsCanvas

    const newModule: PatchNode = {
      id: `${selectedModuleType}-${Date.now()}`,
      type: selectedModuleType as any,
      position: { x: position.x, y: position.y + (position.z || 0) },
      params: getDefaultParams(selectedModuleType),
      size: getDefaultSize(selectedModuleType)
    };

    setNodes(prev => [...prev, newModule]);

    setNotification({
      message: `Module added`,
      severity: 'success'
    });
  }, [selectedModuleType]);

  // Handle collision events
  const handleCollision = useCallback((_event: CollisionEvent) => {
    // Collision feedback can be handled here for UI updates
  }, []);

  // Handle module type selection
  const handleSelectionChange = useCallback((moduleType: string) => {
    setSelectedModuleType(moduleType);
    setNotification({
      message: `Selected: ${moduleType.toUpperCase()}`,
      severity: 'info'
    });
  }, []);

  // Clear all modules
  const handleClearAll = useCallback(() => {
    setNodes([]);
    setNotification({
      message: 'All modules cleared',
      severity: 'info'
    });
  }, []);

  if (showLanding) {
    return (
      <ThemeProvider theme={divineTheme}>
        <CssBaseline />
        <Landing onEnter={() => setShowLanding(false)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={divineTheme}>
      <CssBaseline />
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)'
      }}>
        {/* Main 3D Canvas */}
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <ErrorBoundary
            onError={() => {
              // Error logged by ErrorBoundary component
            }}
          >
            <Physics3DCanvas
              nodes={nodes}
              onNodeAdd={handleModuleAdd}
              onCollision={handleCollision}
              onModuleTypeChange={handleSelectionChange}
              selectedNodeType={selectedModuleType}
            />
          </ErrorBoundary>

          {/* Floating Instructions */}
          <Card sx={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            maxWidth: 280,
            background: '#000000',
            backdropFilter: 'blur(10px)',
            border: '1px solid #333333'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                mb: 1,
                color: '#FFFFFF'
              }}>
                SACRED KEYS
              </Typography>
              <Typography variant="body2" sx={{
                fontSize: '0.7rem',
                color: '#CCCCCC',
                lineHeight: 1.8
              }}>
                1-8: Select modules<br/>
                Space: Drop marble<br/>
                M: Mute/Unmute<br/>
                D: Cycle echo (off/short/long)<br/>
                C: Clear all<br/>
                H: Toggle help<br/>
                ESC: Return to origin
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Notifications */}
        <Snackbar
          open={!!notification}
          autoHideDuration={3000}
          onClose={() => setNotification(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Box sx={{
            background: '#000000',
            border: '1px solid #333333',
            color: '#FFFFFF',
            padding: '12px 24px',
            borderRadius: 1,
            fontSize: '0.875rem',
            letterSpacing: '0.05em'
          }}>
            {notification?.message}
          </Box>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

function getDefaultParams(moduleType: string): Record<string, any> {
  switch (moduleType) {
    case 'ramp':
      return { angle: 15, material: 'wood' };
    case 'bumper':
      return { pitch: 'C4', resonance: 0.8 };
    case 'chime':
      return { note: 'A4', decay: 2.0 };
    case 'spinner':
      return { speed: 1.0, notes: ['C4', 'E4', 'G4'] };
    case 'funnel':
      return { effect: 'spiral', intensity: 0.7 };
    case 'seesaw':
      return { balance: 0.5, sensitivity: 1.0 };
    case 'bell':
      return { frequency: 440, harmonics: 3 };
    default:
      return {};
  }
}

function getDefaultSize(moduleType: string): { width: number; height: number } {
  switch (moduleType) {
    case 'ramp':
      return { width: 8, height: 2 };
    case 'bumper':
      return { width: 3, height: 3 };
    case 'chime':
      return { width: 2, height: 6 };
    case 'spinner':
      return { width: 4, height: 4 };
    case 'funnel':
      return { width: 5, height: 5 };
    case 'seesaw':
      return { width: 6, height: 2 };
    case 'bell':
      return { width: 3, height: 4 };
    default:
      return { width: 2, height: 2 };
  }
}

export default App;
