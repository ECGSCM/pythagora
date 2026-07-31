# Pythagora Synth

A client-side, physics-based marble-run synthesizer. Drop marbles onto a 3D
board of modules — ramps, bumpers, chimes, spinners, funnels, seesaws, and
bells — and their collisions trigger synthesized sound and light. There is no
backend: everything runs in the browser, and the app works offline once
installed.

Design language: **"Sound is Light."** The world defaults to near-black;
sound is the only thing that makes it glow. See `docs/EXPERIENCE_DESIGN.md`
for the full aesthetic spec.

## Features

- **Physics marble run** — ramps, bumpers, chimes, spinners, funnels, seesaws
  and bells, each with real cannon-es colliders (ramps roll, spinners spin
  and fling, seesaws hinge under a marble's weight).
- **Ambient drone + circle-of-fifths key travel** — a three-layer drone
  (Ground/Pad/Air) plays continuously; every 8 collisions the harmonic key
  steps around the circle of fifths, and the drone's Pad layer crossfades to
  follow. Collision pitch is drawn from the current key's pentatonic scale.
- **Velocity-sensitive voices** — harder hits are louder *and* brighter
  (velocity drives both amplitude and a lowpass cutoff), so the physics and
  the sound share one cause.
- **Bloom "Sound is Light" visuals** — a WebGL post-processing stack (bloom,
  vignette, film grain) makes marbles glow like light and hit flashes bloom
  with the same decay curve as their sound's release.
- **A breathing world** — every module pulses on a shared ~5s breathing
  cycle, phase-offset by position, so the whole scene reads as one organism.
- **Combo / unlock system** — chained hits build a combo multiplier (shown
  as a Roman numeral in-scene) and step through four unlock tiers: 5 hits
  brighten and enlarge the marble's comet trail, 10 hits unlock the golden
  marble (and, at the same threshold, add a shimmering drone layer that
  drops out again if the combo breaks), 15 hits unlock rainbow ripples, and
  20 hits unlock golden mode. Separately, an Aurora pulse fires on every key
  change (every 8 collisions) regardless of combo — it isn't gated by any
  unlock.
- **Disappearing UI** — the control overlay fades out after 30s of no input
  and returns instantly on the next pointer or key event, so the canvas and
  sound are the only things left on screen.
- **Session summaries** — pressing `Esc` returns to the landing screen with
  a one-line summary of that session (collisions, max combo, key reached).
- **Binaural mode** — an optional L/R ±4Hz theta-beat layer mixed under the
  drone (headphones recommended).
- **Follow camera** — an optional camera mode that tracks the live marble
  instead of the static overview.
- **PWA / offline** — installable, works without a network connection after
  first load.
- **GitHub Pages deploy** — CI builds and deploys `main` automatically.

## Controls

Keyboard shortcuts work anywhere on the page (no need to click the canvas
first) as soon as the app loads:

| Key | Action |
|---|---|
| `1`–`8` | Select a module type: Origin/marble, Slope/ramp, Base/bumper, Hex/chime, Spiral/spinner, Portal/funnel, Balance/seesaw, Axis/bell |
| `Space` | Drop a marble |
| `M` | Mute / unmute |
| `D` | Cycle echo send (off → short → long) |
| `L` | Toggle the "Divine Light" overhead lighting effect |
| `B` | Toggle binaural beats mode |
| `F` | Toggle follow camera (tracks the live marble) |
| `C` | Clear all placed modules and marbles |
| `H` | Toggle the help card |
| `Esc` | Exit to the landing screen (shows the session summary) |

Clicking the board places the currently-selected module; clicking with
"Origin" selected drops a marble at that position instead.

## Development

```bash
pnpm install
pnpm dev            # start the dev server
pnpm build          # type-check and build for production
pnpm preview        # preview a production build locally
pnpm lint           # eslint
pnpm test:run       # vitest, single run
pnpm test           # vitest, watch mode
```

## Architecture

```
src/
  App.tsx                    — top-level state (landing/session), theme
  audio/                     — Tone.js synthesis engine
    bus.ts                   —   master chain (compressor → limiter → volume) + send buses
    instruments.ts           —   declarative 8-voice instrument definitions (osc/ADSR/filter)
    voices.ts                —   voice pool, polyphony cap, voice stealing
    drone.ts                 —   ambient drone layers + binaural mode
    harmony.ts               —   circle-of-fifths key travel
    engine.ts                —   public API (trigger/mute/echo/dispose)
  components/
    Physics3DCanvas.tsx      — scene wiring: physics bodies, keyboard, engine lifecycle
    canvas/                  — Scene, Ground, Lights, Marble, Ripple, modules/, effects/
    ui/                      — ControlsOverlay, ModuleSelector, usePresence (disappearing UI)
  stores/gameStore.ts        — zustand: combo, unlocks, session stats, modulation
  config/
    world.ts                 — physics constants, module dimensions, camera/lighting tuning
    experience.ts             — palette, post-processing, aurora, starfield, presence timing
  pages/Landing.tsx           — entry splash + session summary
  types/                      — patch.ts (module type), events.ts, session.ts
```

## Deployment

Fully static, no environment variables. `vite.config.ts` sets
`base: '/pythagora/'` to match this repository's name (`ECGSCM/pythagora`) —
update it if you fork under a different name.

`.github/workflows/ci.yml` runs lint, type-check, tests and a production
build on every push and PR. On push to `main` (or when the workflow is run
manually via `workflow_dispatch`, for a redeploy without a new commit), a
second job builds the site again and publishes `dist/` to the `gh-pages`
branch via `peaceiris/actions-gh-pages@v4`, since this repository serves
Pages from a branch rather than through the Pages deployment API. Pages must
be configured under Settings → Pages → Source: Deploy from a branch →
`gh-pages`. The site is served at `https://ecgscm.github.io/pythagora/`.

To build and preview a production bundle locally:

```bash
pnpm build
pnpm preview
```

## Further reading

Design and audit documents live in `docs/`: `REFACTORING_PLAN.md` (the audit
and fix plan this rebuild followed), `EXPERIENCE_DESIGN.md` (the "Sound is
Light" visual/audio spec), and `CREATIVE_ENHANCEMENT_PLAN.md` (the original
vision document).
