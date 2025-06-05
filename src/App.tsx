import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
  AppBar,
  Toolbar,
  Typography,
  Button,
  ButtonGroup,
  Tooltip,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
  Share as ShareIcon,
  Home as HomeIcon
} from '@mui/icons-material';
import { Physics3DCanvas } from './components/Physics3DCanvas';
import { Landing } from './pages/Landing';
import { PatchNode } from './types/db.types';
import { CollisionEvent } from './engines/physics';

// Dark theme configuration with improved colors for Pythagora Switch
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00BFA6',
    },
    secondary: {
      main: '#FF6B6B',
    },
    background: {
      default: '#0A0A0F',
      paper: '#1A1A2E',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#6b6b6b #2b2b2b",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            backgroundColor: "#2b2b2b",
            width: 8,
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 8,
            backgroundColor: "#6b6b6b",
            minHeight: 24,
          },
        },
      },
    },
  },
});

const moduleTypes = [
  { type: 'marble', name: '🔴 Marble', description: 'Drop physics marble' },
  { type: 'ramp', name: '📐 Ramp', description: 'Guiding slope' },
  { type: 'bumper', name: '🥁 Bumper', description: 'Drum sound trigger' },
  { type: 'chime', name: '🎵 Chime', description: 'Musical note trigger' },
  { type: 'spinner', name: '🌀 Spinner', description: 'Rotating melody wheel' },
  { type: 'funnel', name: '🌪️ Funnel', description: 'Sound spiral effect' },
  { type: 'seesaw', name: '⚖️ Seesaw', description: 'Balance sound trigger' },
  { type: 'bell', name: '🔔 Bell', description: 'Harmonic bell sound' },
];

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [nodes, setNodes] = useState<PatchNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<PatchNode | null>(null);
  const [selectedModuleType, setSelectedModuleType] = useState<string>('marble');
  const [isPlaying, setIsPlaying] = useState(false);
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
        message: '🎵 Welcome to Pythagora-Synth! Click to drop marbles and create music!',
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
    setSelectedNode(newModule);
    
    setNotification({
      message: `✨ Added ${selectedModuleType} module!`,
      severity: 'success'
    });
  }, [selectedModuleType]);

  // Handle module updates
  const handleModuleUpdate = useCallback((nodeId: string, updates: Partial<PatchNode>) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    ));

    if (selectedNode?.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
    }
  }, [selectedNode]);

  // Handle module deletion
  const handleModuleDelete = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }

    setNotification({
      message: 'Module removed',
      severity: 'info'
    });
  }, [selectedNode]);

  // Handle collision events
  const handleCollision = useCallback((event: CollisionEvent) => {
    // Enhanced collision feedback
    console.log('🎵 Musical collision:', event);
  }, []);

  // Clear all modules
  const handleClearAll = useCallback(() => {
    setNodes([]);
    setSelectedNode(null);
    setNotification({
      message: 'All modules cleared',
      severity: 'info'
    });
  }, []);

  if (showLanding) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Landing onEnter={() => setShowLanding(false)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 50%, #16213E 100%)'
      }}>
        {/* Top Control Bar */}
        <AppBar position="static" sx={{ 
          background: 'rgba(26, 26, 46, 0.9)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
              🧩 Pythagora-Synth
            </Typography>
            
            {/* Module Type Selector */}
            <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
              {moduleTypes.map(({ type, name }) => (
                <Tooltip key={type} title={moduleTypes.find(m => m.type === type)?.description || ''}>
                  <Chip
                    label={name}
                    onClick={() => setSelectedModuleType(type)}
                    variant={selectedModuleType === type ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                      '&:hover': { transform: 'scale(1.05)' },
                      transition: 'all 0.2s'
                    }}
                  />
                </Tooltip>
              ))}
            </Box>

            {/* Action Buttons */}
            <ButtonGroup variant="outlined" size="small">
              <Tooltip title="Clear all modules">
                <Button onClick={handleClearAll} startIcon={<ClearIcon />}>
                  Clear
                </Button>
              </Tooltip>
              <Tooltip title="Go to landing">
                <Button onClick={() => setShowLanding(true)} startIcon={<HomeIcon />}>
                  Home
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Toolbar>
        </AppBar>

        {/* Main 3D Canvas */}
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <Physics3DCanvas
            nodes={nodes}
            onNodeAdd={handleModuleAdd}
            onCollision={handleCollision}
            onSelectionChange={(nodeId) => {
              const node = nodes.find(n => n.id === nodeId);
              setSelectedNode(node || null);
            }}
            selectedNodeType={selectedModuleType}
            isPlaying={isPlaying}
            onPlayStateChange={setIsPlaying}
          />
          
          {/* Floating Instructions */}
          <Card sx={{ 
            position: 'absolute',
            bottom: 20,
            left: 20,
            maxWidth: 300,
            background: 'rgba(26, 26, 46, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <CardContent>
              <Typography variant="body2" color="primary" gutterBottom>
                🎯 How to use:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Select a module type above<br/>
                • Click in 3D space to place it<br/>
                • Drop marbles to create music<br/>
                • Drag to orbit the camera
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Notifications */}
        <Snackbar
          open={!!notification}
          autoHideDuration={4000}
          onClose={() => setNotification(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          {notification && (
            <Alert
              onClose={() => setNotification(null)}
              severity={notification.severity}
              variant="filled"
            >
              {notification.message}
            </Alert>
          )}
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
