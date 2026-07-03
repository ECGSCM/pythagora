# Deployment

Pythagora Synth is a fully static, client-side app — there is no backend and
no environment variables to configure. It deploys to **GitHub Pages**.

## How it's wired up

- `vite.config.ts` sets `base: '/pythagora/'`, matching this repository's
  name (`ECGSCM/pythagora`). If you fork this repo under a different name,
  update `base` to match.
- `package.json` has a `deploy` script that builds the app and publishes
  `dist/` to the `gh-pages` branch using the [`gh-pages`](https://www.npmjs.com/package/gh-pages)
  package.

## Deploying

```bash
pnpm install
pnpm deploy          # builds, then publishes dist/ to the gh-pages branch
```

`pnpm deploy:force` does the same but force-pushes, which is occasionally
necessary if the `gh-pages` branch history has diverged.

After the first deploy, enable GitHub Pages for this repository (Settings →
Pages → deploy from the `gh-pages` branch), if it isn't already. The site
will be available at:

```
https://ecgscm.github.io/pythagora/
```

## CI

`.github/workflows/ci.yml` runs lint, type checking, tests, and a production
build on every push/PR to `main`. It does not deploy — a GitHub Pages deploy
job (via `actions/deploy-pages`) is planned for a later phase (see
`REFACTORING_PLAN.md`, Phase 6). Until then, deploys are manual via
`pnpm deploy`.

## Environment variables

None. This app has no backend, no auth, and no third-party services — the
entire experience runs in the browser.
