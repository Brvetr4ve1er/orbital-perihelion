# Implementation Roadmap

## Objective

Move the project from "promising but fragile" to "reliable and extensible" without throwing away the strongest parts of the current codebase.

## Phase 1: Stabilization ✅ COMPLETED

### Goals
- make CSV import trustworthy
- make failures visible
- make state updates explicit
- remove misleading UI behaviors

### Outcomes
- Addressed naive delimiter splitting and implemented `UniversalCSVParser`.
- Removed file-wide string replacements.
- Introduced explicit import error displays in the UI.
- Stabilized legacy data adapters.

## Phase 2: Modularization ✅ COMPLETED

### Goals
- reduce architecture fragility
- remove script duplication
- make core logic testable

### Outcomes
- Migrated out of vanilla script injection into a full React 19 + TypeScript stack.
- Built a global robust state store (`inventoryStore`).
- Replaced global window pollution with clean module imports.

## Phase 3: Product Hardening ✅ COMPLETED

### Goals
- improve operational reliability
- improve maintainability for future agents
- integrate real Local LLM + DuckDuckGo Scraping

### Outcomes
- Developed the `LLMService` mapped to local LM Studio via proxy.
- Implemented `ProductValidator` to ensure critical fields exist.
- Overhauled README and internal documentation.
- Integrated `curated-db.ts` to boost confidence of known high-value products.
- Extracted constants and API configuration into environment variables (`.env.local`).

## Phase 4: Long-Term Platform Work ✅ COMPLETED

### Goals
- support larger datasets
- reduce dependency on browser-only limitations
- support durable intelligence workflows

### Outcomes
- **IndexedDB Persistence**: Migrated storage from `localStorage` to IndexedDB using the `idb` package to bypass 5MB quotas.
- **Web Worker Offloading**: Moved the entire CSV ingest, parse, and enrichment pipeline into a background Web Worker (`import.worker.ts`), eliminating UI freezing on large datasets.
- **Batch Enrichment Queue**: Implemented `EnrichmentQueue`, a sequential job processor for AI enrichment with UI controls (Play/Pause/Cancel) and progress tracking.

## Future Recommendations (Phase 5)
With the core AI Engine fully robust, the next steps could include:
- Export functionality to write data back to a CRM or ERP.
- A dedicated Python backend API replacing the current Vite local proxy logic.
- Real-time product tracking metrics (Trend analysis).
- Dockerization of the tool suite.
