# PKOS — Product Knowledge Operating System

> **Orbital Perihelion edition** — local commercial intelligence engine for inventory ingestion, enrichment, and analytics.

PKOS turns raw CSV exports into a richly-typed, queryable product catalog with margin analysis, stock-out forecasting, and AI-assisted enrichment.

---

## Quick Start

```bash
npm install
npm run dev          # http://127.0.0.1:5000
npm run build        # outputs to dist/
npm run typecheck    # tsc --noEmit
npm run preview      # serve the production build
```

### Optional sidecars

| Service          | Port  | Purpose                                                 |
| ---------------- | ----- | ------------------------------------------------------- |
| LM Studio        | 1234  | Local OpenAI-compatible LLM (proxied via `/api/llm`)    |
| Python scraper   | 5001  | DDG / SearXNG search + scrape (proxied via `/api/*`)    |

Drop files from `samples/` into the importer to try the pipeline without your own data.

---

## Project Layout

```text
.
├── index.html              # Main SPA entry
├── graph.html              # Standalone graph view entry
├── samples/                # Example CSVs for manual import
├── scraper/                # Optional Python sidecar (Docker / SearXNG)
├── docs/                   # Architecture, audits, change log, issues
└── src/
    ├── main.tsx            # SPA bootstrap
    ├── graph-main.tsx      # Graph-view bootstrap
    ├── core/               # CPO schema, parsers, engine, validators
    ├── services/           # LLM, scraper, enrichment, persistence, analytics
    ├── state/              # Observable store
    ├── ui/
    │   ├── App.tsx
    │   ├── components/     # Reusable widgets (KPI strip, filter bar, …)
    │   ├── features/       # Dashboard, settings, ecommerce
    │   ├── hooks/
    │   └── styles/         # base.css, admin-shell.css, graph.css
    ├── graph/              # D3-force graph (sim, renderers, components)
    └── workers/            # CSV import worker
```

## Tech Stack

React 19 · TypeScript · Vite 7 · Framer Motion · D3-force · Zod · IndexedDB (idb) · `@tanstack/react-virtual` · AOS

## Architecture Highlights

- **CPO v4.0 schema** (`src/core/schema.ts`) — multi-observation product model with consensus aggregation across import / scrape / inference sources.
- **Observable store** (`src/state/store.ts`) — single source of truth, persists to IndexedDB.
- **Lazy-loaded views** — Table, Tree, Graph, Compare, and CRM panels split into separate chunks (see `vite.config.js`).
- **Worker-based CSV import** — heavy parsing runs off the main thread (`src/workers/import.worker.ts`).

See `docs/OVERVIEW.md` and `docs/module-audits/` for deeper dives.
