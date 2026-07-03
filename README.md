# Pythagora Synth

A client-side, physics-based marble-run synthesizer. Drop marbles onto a 3D
board of modules — ramps, bumpers, chimes, spinners, funnels, seesaws, and
bells — and their collisions trigger synthesized sounds. There is no backend:
everything runs in the browser.

## Tech stack

- **React 19** + **Vite 7** + TypeScript (strict)
- **three.js**, **@react-three/fiber**, **@react-three/drei**, and
  **@react-three/cannon** for the 3D scene and physics simulation
- **Tone.js** for audio synthesis
- **MUI** (Material UI) for the on-screen controls, using a custom "Divine
  Monochrome" theme

## Running it

```bash
pnpm install
pnpm dev            # start the dev server
pnpm build          # type-check and build for production
pnpm preview        # preview a production build locally
pnpm lint           # eslint
pnpm test:run       # vitest, single run
```

## Controls

The canvas must have focus (click it once) for keyboard shortcuts to work.

| Key | Action |
|---|---|
| `1`–`8` | Select a module type (Origin/marble, Slope/ramp, Base/bumper, Hex/chime, Spiral/spinner, Portal/funnel, Balance/seesaw, Axis/bell) |
| `Space` | Drop a marble |
| `M` | Mute / unmute |
| `D` | Cycle echo mode (off → short → long) |
| `L` | Toggle the "Divine Light" overhead lighting effect |

The in-app help card also lists `C` (clear all), `H` (toggle help), and
`Esc` (return to the landing screen) — these are not implemented yet and are
tracked in `REFACTORING_PLAN.md` (Phase 2).

Clicking the board places the currently-selected module; clicking with
"Origin" selected drops a marble at that position instead.

## Project status

This project is mid-refactor. A large amount of dead code (an old 2D canvas
renderer, a Supabase/Stripe backend integration that was never wired to the
frontend, duplicate audio-bridge files, etc.) has been removed, and the
TypeScript config now runs in strict mode with zero lint warnings. Several
known physics and audio bugs remain (for example: ramps don't yet rotate
their physics collider to match their visual tilt, so marbles don't reliably
roll down them). See `REFACTORING_PLAN.md` for the full audit and the plan to
fix them, and `CREATIVE_ENHANCEMENT_PLAN.md` for the intended end-state
experience (ambient drone layers, harmonic progressions, combo/unlock
system, etc.) that this refactor is working towards.

## Deployment

Static build, deployed to GitHub Pages. See `DEPLOYMENT.md`.

## Project layout

```
src/
  App.tsx                       — top-level state (modules, notifications) and theme
  components/
    Physics3DCanvas.tsx         — the 3D scene, physics bodies, module components, UI overlay
    ErrorBoundary.tsx
  engines/
    audio.ts                    — Tone.js-based synthesis engine
    synthBridge3D.ts            — glue between physics collisions and the audio engine
  pages/Landing.tsx             — entry splash screen
  types/
    patch.ts                    — PatchNode (module) type
    events.ts                   — collision event type
```
