# PKOS — Product Knowledge Operating System (Project: Orbital Perihelion)

## Overview
A high-performance commercial intelligence engine and dashboard for electronics inventory management. It ingests CSV data, normalizes it, enriches it via local LLMs and web scraping, and provides sophisticated visualizations for inventory, margin analysis, and market positioning.

## Tech Stack
- **Frontend**: React 19 + TypeScript
- **Build System**: Vite 7
- **Package Manager**: npm
- **Styling**: Vanilla CSS (Glassmorphism design tokens)
- **Animation**: Framer Motion, AOS
- **Visualization**: D3.js (force graph, tree simulation)
- **State**: Custom Observable Store + IndexedDB (idb) for persistence
- **Validation**: Zod
- **AI**: LM Studio (OpenAI-compatible local LLM)
- **Scraper**: Python sidecar (SearXNG + Crawl4AI + Playwright)

## Project Structure
```
src/
  core/       # Schema (CPO v4.0), CSV parsers, engine, validators
  services/   # LLM, scraper, enrichment, persistence services
  state/      # Global observable store
  ui/         # React components, dashboard, KPI cards
  graph/      # D3 graph rendering and hooks
  workers/    # Background import workers
public/       # Static assets, sample CSV datasets
scraper/      # Python sidecar service
```

## Entry Points
- `index.html` → `src/main.tsx` — Main SPA dashboard
- `graph.html` → `src/graph-main.tsx` — D3 graph visualization

## Development
```bash
npm run dev    # Start dev server on port 5000
npm run build  # Build for production (output: dist/)
```

## Key Architecture Notes

### CSV Parser (`src/core/universal-csv-parser.ts`)
- **NFD normalization is critical**: `normalizeKey()` must call `.normalize('NFD')` BEFORE stripping diacritics, not NFC after. NFD decomposes precomposed chars (é → e + ´ combining) so the regex can strip them.
- **Both sides normalized**: `NORMALIZED_MAP` pre-normalizes all COLUMN_MAP variants at module load so header↔variant comparisons are always pure ASCII.
- **Canonical identifiers extracted**: `id`, `name`, `brand`, `category`, `sku`, `barcode`/EAN, `mpn`/part-number, prices, stock.
- **Thousands separator aware**: `parseNumber()` detects EU vs US/ISO format from last-separator position.

### Scroll Architecture
- Scroll root is `.app-container` (`height: 100%; overflow-y: auto`), NOT body.
- `html`, `body`, `#root` are `height: 100%; overflow: hidden` — this is required for Replit's iframe proxy to pass scroll events correctly.
- TableView virtual scroll: `.tv-body` uses `height: 60vh` (NOT `flex: 1`, which would make it grow unboundedly in an unconstrained flex parent and break the virtualizer).

## External Services (optional, not required to run the UI)
- LM Studio at `http://10.36.208.130:1234` — local LLM (proxied via `/api/llm`)
- Python scraper sidecar at `http://127.0.0.1:5002` — web enrichment (proxied via `/api/search`, `/api/scrape`, `/api/enrich-web`)

## Deployment
Configured as a static site deployment. Build command: `npm run build`. Public dir: `dist`.
