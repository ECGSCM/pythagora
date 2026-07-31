import { useState, useCallback } from 'react';
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
import { PatchNode } from './types/patch';
import type { SessionSummary } from './types/session';
import { DEMO_LAYOUT, getDefaultParams } from './config/world';
import { PRESENCE } from './config/experience';
import { usePresence } from './components/ui/usePresence';
import { useGameStore } from './stores/gameStore';

// Help card visibility persistence (§4.2): once the user dismisses it with H,
// later app entries start with it hidden. Guarded against private-mode
// storage failures — a broken localStorage must never crash the app.
const HELP_SEEN_KEY = 'pythagora.helpSeen';

function readHelpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHelpSeen(): void {
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Private mode / storage disabled — the card just re-shows next visit.
  }
}

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

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [nodes, setNodes] = useState<PatchNode[]>([]);
  // Selection lives in the zustand store now, not local state (§7C "selection
  // race" fix): Scene's placement handler reads it via getState() at click
  // time, so App and Scene can never disagree about what's currently armed.
  // App just subscribes to the same slice for its own render (ModuleSelector
  // highlight, handleModuleAdd).
  const selectedModuleType = useGameStore((state) => state.selectedModuleType);
  // First visit: auto-shown. Once dismissed with H, later entries (even after
  // a full reload) start hidden — see readHelpSeen/writeHelpSeen above.
  const [showHelp, setShowHelp] = useState(() => !readHelpSeen());
  const [notification, setNotification] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  // "Clear all" token: modules live here, but live marbles / evictions /
  // ripples live inside <Scene>'s own state, so clearing has to be broadcast
  // downward. A monotonic counter (rather than a callback ref) keeps App the
  // single owner of the action and makes the signal idempotent — Scene simply
  // reacts when the value it last processed falls behind.
  const [clearToken, setClearToken] = useState(0);
  const [lastSession, setLastSession] = useState<SessionSummary | null>(null);

  // Presence (§4.1): a single hook instance, shared by the help card here and
  // by Physics3DCanvas's own overlays (threaded down as a prop) so everything
  // fades off one idle timer instead of each owning a separate one.
  const present = usePresence();

  // Transition out of the landing page. Demo modules are seeded only on the
  // first entry — returning via ESC and re-entering must not clobber the
  // user's layout. A fresh session also means fresh gameplay stats (§4.2).
  const handleEnter = useCallback(() => {
    setShowLanding(false);
    useGameStore.getState().reset();

    setNodes(prev => {
      if (prev.length > 0) return prev;
      return DEMO_LAYOUT;
    });

    setNotification({
      message: 'Click to drop marbles and create sacred music',
      severity: 'info'
    });
  }, []);

  const handleExitToLanding = useCallback((summary: SessionSummary) => {
    setLastSession(summary);
    setShowLanding(true);
  }, []);

  const handleToggleHelp = useCallback(() => {
    setShowHelp(prev => {
      const next = !prev;
      if (!next) writeHelpSeen();
      return next;
    });
  }, []);

  // Handle adding new modules. Placement happens on the vertical z=0 plane,
  // so the click's x/y map directly to the module position (the old code
  // folded the raycast z-depth into y — see REFACTORING_PLAN.md P7).
  //
  // Reads the type from the store's getState() rather than the
  // `selectedModuleType` render-time closure above: Scene calls this
  // synchronously from its r3f pointer handler, which can fire before App has
  // re-rendered off a same-tick store update — closing over the reactive hook
  // value here would reopen the exact selection race §7C fixes in Scene.
  const handleModuleAdd = useCallback((position: { x: number; y: number; z?: number }) => {
    const type = useGameStore.getState().selectedModuleType;
    if (type === 'marble') return; // Marbles are handled directly by the canvas

    const newModule: PatchNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: position.x, y: position.y },
      params: getDefaultParams(type)
    };

    setNodes(prev => [...prev, newModule]);

    setNotification({
      message: `Module added`,
      severity: 'success'
    });
  }, []);

  // Handle module type selection. Written synchronously to the store (not a
  // local setState) so keyboard 1-8 and ModuleSelector clicks both commit the
  // new selection before the next event (e.g. an immediate click) can read it.
  const handleSelectionChange = useCallback((moduleType: PatchNode['type']) => {
    useGameStore.getState().setSelectedModuleType(moduleType);
    setNotification({
      message: `Selected: ${moduleType.toUpperCase()}`,
      severity: 'info'
    });
  }, []);

  // Clear all modules AND marbles (C key / canvas callback). Also drops any
  // moduleHits flash timestamps for the removed nodes, so the record doesn't
  // keep entries for modules that no longer exist (§7C moduleHits hygiene).
  //
  // The token bump is what reaches the marbles: they're mounted components
  // owned by <Scene>, so emptying `nodes` alone used to leave a dozen orbs
  // still falling, bouncing and making sound under a toast that claimed
  // everything was cleared (README documents C as clearing modules *and*
  // marbles).
  const handleClearAll = useCallback(() => {
    setNodes([]);
    setClearToken(prev => prev + 1);
    useGameStore.getState().clearModuleHits();
    setNotification({
      message: 'All modules and marbles cleared',
      severity: 'info'
    });
  }, []);

  if (showLanding) {
    return (
      <ThemeProvider theme={divineTheme}>
        <CssBaseline />
        <Landing onEnter={handleEnter} lastSession={lastSession} />
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
              onModuleTypeChange={handleSelectionChange}
              selectedNodeType={selectedModuleType}
              onClearAll={handleClearAll}
              clearToken={clearToken}
              onToggleHelp={handleToggleHelp}
              onExit={handleExitToLanding}
              present={present}
            />
          </ErrorBoundary>

          {/* Floating Instructions (H toggles). Presence (§4.1): fades with
              the same shared idle timer as the canvas's own overlays. */}
          {showHelp && <Card sx={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            maxWidth: 280,
            // Desktop only: this card lists nothing but keyboard shortcuts, so
            // on a phone it is inapplicable AND unclosable (H is itself a key).
            // It was covering most of the play area and colliding with the
            // module palette along the bottom edge.
            display: { xs: 'none', sm: 'block' },
            background: '#000000',
            backdropFilter: 'blur(10px)',
            border: '1px solid #333333',
            opacity: present ? 1 : 0,
            transition: `opacity ${present ? PRESENCE.fadeInSec : PRESENCE.fadeOutSec}s`,
            pointerEvents: present ? 'auto' : 'none'
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
                L: Divine light<br/>
                B: Binaural mode<br/>
                F: Follow camera<br/>
                C: Clear all<br/>
                H: Toggle help<br/>
                ESC: Return to origin
              </Typography>
            </CardContent>
          </Card>}
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

export default App;
