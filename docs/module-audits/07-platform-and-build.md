# Platform and Build Audit

Scope:

- `package.json`
- `vite.config.js`
- `index.html`
- `graph.html`
- environment variables and proxy expectations

## Responsibility

This layer defines how the system is launched and how its moving parts are connected:

- dev server
- build output
- dual entrypoints
- local proxy rules
- runtime dependency expectations

## What Is Solid

- The Vite setup is readable.
- Dual entrypoints are explicit.
- Proxy paths make local model and sidecar usage straightforward during development.
- The app builds successfully in its current state.

## Verified Issues

### 1. Runtime setup complexity is higher than the script surface suggests

Observed behavior:

- `package.json` only exposes `dev`, `build`, and `preview`
- the real system also expects:
  a local LLM endpoint,
  the scraper sidecar,
  optionally SearXNG and Playwright/Crawl4AI support

Why this matters:

- The app is easy to build but not fully easy to operate.
- New contributors can get a false sense that `npm run dev` is the whole stack.

### 2. Proxy configuration is environment-sensitive but partially implicit

Observed behavior:

- `vite.config.js` reads `VITE_SIDECAR_URL` and `VITE_LLM_URL_DEV`
- frontend defaults assume local endpoints and local ports

Risk:

- Configuration drift can create confusing partial failures:
  app loads,
  LLM status changes,
  sidecar paths fail,
  enrichment silently degrades.

### 3. The build is healthy, but build health does not equal behavior health

Current fact:

- `npm run build` passes.

Important interpretation:

- Most current risks are runtime correctness, data integrity, and wiring drift rather than TypeScript or bundle failure.

## Likely Hidden Risks

### 1. Environment reproducibility risk

The project spans Node, browser APIs, Python, and optional scraping tooling. That usually produces onboarding friction and machine-specific behavior unless setup is heavily automated.

### 2. Dual-entrypoint drift risk

The main app and standalone graph page can evolve independently. If not watched, one becomes product truth while the other becomes stale demo infrastructure.

### 3. Missing automated verification risk

Without tests or runtime smoke checks, the platform layer can keep building while feature contracts drift underneath it.

## Upgrade Directions

### Medium-weight upgrades

- Add a real `doctor` script:
  verify node modules,
  env vars,
  sidecar health,
  LLM endpoint health,
  optional scraper dependencies.
- Add a startup status panel in docs and UI.
- Add one command or script per common local stack mode.

### Heavy upgrades

- Containerize the full local stack:
  frontend,
  sidecar,
  optional SearXNG.
- Add smoke tests that validate:
  import,
  sales ingest,
  queue enrichment,
  graph projection,
  backup restore.
- Consider a small backend coordinator if the local multi-process setup keeps growing.

## Recommended Priority

1. Improve setup diagnostics.
2. Add smoke checks.
3. Only then decide whether the stack should remain purely local-first or gain a thin coordinating backend.
