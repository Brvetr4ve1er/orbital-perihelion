# Module Audit Index

This directory contains a second-pass audit of the application broken down by module instead of by application-wide feature.

Each report includes:

- current responsibility
- notable strengths
- verified issues
- likely hidden risks
- upgrade proposals, including heavier architectural changes

## Reports

- `01-core.md`
  parsing, schema, normalization, search index, validation, filtering engine
- `02-state.md`
  application store and mutation model
- `03-services.md`
  persistence, AI integration, enrichment queue, analytics, exports, settings
- `04-ui.md`
  main app shell, dashboard, cards, modal flows, settings UX
- `05-graph.md`
  graph projection, simulation, rendering, standalone graph mode
- `06-scraper-sidecar.md`
  Python sidecar, search, scrape, cache, security posture
- `07-platform-and-build.md`
  Vite config, entrypoints, scripts, runtime coupling, operational setup

## Suggested Reading Order

1. `07-platform-and-build.md`
2. `01-core.md`
3. `03-services.md`
4. `04-ui.md`
5. `05-graph.md`
6. `06-scraper-sidecar.md`
7. `02-state.md`

That order moves from system boundaries into data integrity, then into user-facing behavior.
