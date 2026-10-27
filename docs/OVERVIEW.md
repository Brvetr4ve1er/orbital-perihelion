# Overview

`orbital-perihelion` is a local, browser-first inventory intelligence dashboard for electronics catalogs. It imports CSV inventory data, normalizes each row into a canonical `Product` object, enriches it with rule-based heuristics, persists it in IndexedDB, and exposes several analysis views on top of that state.

The implemented product is smaller and more specific than some earlier docs suggest. It is not a general-purpose data platform, not a backend service, and not a guaranteed "any CSV / any language / any encoding" ingestion engine. It is a React + Vite application with a Python scraping sidecar dependency for the AI-assisted enrichment path.

## What Is Implemented

- Client-side CSV import through a Web Worker.
- Canonical product normalization into `src/core/schema.ts`.
- Rule-based enrichment on import:
  brand detection, category classification, basic spec extraction, curated DB overlays, observation/consensus scoring.
- Local persistence:
  IndexedDB first, `localStorage` fallback.
- Dashboard views:
  grid, table, compare, tree, graph, ecommerce/CRM panel.
- Sales import:
  a second CSV path used for velocity, revenue, reorder, and forecast widgets.
- Optional AI enrichment:
  local or remote OpenAI-compatible model endpoints plus a local scraping sidecar.
- Standalone graph entrypoint:
  `graph.html` renders the graph UI separately from the main dashboard.

## What Is Not Reliably Implemented

- Generic "any encoding" CSV support.
  Main import hardcodes `utf-8` in `src/ui/App.tsx`.
- Fully universal schema detection.
  The parser supports a finite alias table and four delimiters.
- Persisted API secrets.
  Settings intentionally scrub API keys before saving.
- Fully wired settings panel.
  Several controls exist in UI but are not consumed by runtime code.
- A single consistent AI merge path.
  Batch enrichment and manual per-product enrichment do not write results the same way.
- Automated tests.
  The repo currently exposes build scripts, but no test suite.

## Runtime Shape

- Frontend:
  React 19, TypeScript, Vite 7.
- Storage:
  IndexedDB via `idb`; fallback to `localStorage`.
- Sidecar dependencies:
  local OpenAI-compatible model endpoint and local Python scraper sidecar behind Vite proxies.
- Data model:
  one canonical `Product` object augmented by `observations`, `consensus`, `enrichment`, and UI-only derived fields.

## Primary Source Files

- `src/ui/App.tsx`
  app shell, file import triggers, queue controls.
- `src/workers/import.worker.ts`
  parse → enrich → validate pipeline.
- `src/core/`
  schema, parser, adapter, validator, search index, filtering engine.
- `src/services/`
  persistence, LLM/scraper integration, queueing, sales, analytics, forecasting.
- `src/ui/features/dashboard/`
  dashboard composition and product modal UX.
- `src/graph/`
  standalone graph system.

## Read This Next

- `FUNCTIONING.md` for the real execution path.
- `ACTIVE_ISSUES.md` for the current defect ledger.
