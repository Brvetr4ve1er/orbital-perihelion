# Project Functioning: Deep Dive

The intelligence of the PKOS (Product Knowledge Operating System) is built on a multi-stage pipeline that processes raw inventory data into structured, enriched Canonical Product Objects (CPO).

## 1. Universal Data Ingestion (`UniversalCSVParser.ts`)
When a CSV is uploaded, the `UniversalCSVParser` executes a format-agnostic extraction strategy:
- **Delimiter Detection**: Auto-detects `,`, `;`, `\t`, or `|` indices.
- **Fuzzy Header Mapping**: Maps 50+ French/English header variants (e.g., "PV TTC", "Prix de Vente") to canonical fields using normalized key matching.
- **Quote-Aware Parsing**: Handles complex CSV nuances like escaped quotes (`""`) and newlines within cells.
- **Diagnostics**: Generates a summary of detected columns to assist the user in case of mapping ambiguities.

## 2. Canonical Normalization (`ProductAdapter.ts`)
The raw rows are passed to the `ProductAdapter`, which transforms them into the **CPO v4.1** schema:
- **Fact-Level Architecture**: instead of flat fields, it initializes an `observations` store.
- **Source Tracking**: Tracks if a brand was explicitly provided in the CSV or needs regex inference.
- **Price/Stock Normalization**: Converts various currency and quantity formats into clean numbers.
- **Sustainability**: Implements `toLegacy()` shims to remain compatible with older dashboard components that expect flat objects.

## 3. Intelligence enrichment (`EnrichmentService.ts`)
This is the "Brain" of the system, running logic to fill gaps:
- **Brand Detection**: High-priority regex matching for known brands (Samsung, Condor, Iris, etc.) triggered only if the CSV source is empty.
- **Category Classification**: Uses 50+ optimized regex patterns to sort products into categories like `tv`, `washing_machine`, or `mixer`.
- **Fact Consensus**: Aggregates observations from different sources (CSV, Regex, LLM Scraper) and selects the "winner" based on confidence tiers.
- **Curated DB Overlay**: Exact-match overrides for high-value products from a built-in "Ground Truth" database.

## 4. Batch Enrichment Queue (`enrichment-queue.ts`)
To handle large-scale LLM processing without overwhelming local resources:
- **Sequential Processing**: Jobs are processed one at a time to respect local VRAM limits and prevent rate-limiting.
- **Stateful Management**: Tracks `pending`, `running`, `done`, `failed`, and `skipped` statuses for every item in the inventory.
- **Real-time Feedback**: Computes rolling ETA and progress percentages, allowing the user to monitor long-running enrichment sessions.
- **Immediate Persistence**: Results are merged into the store and persisted to IndexedDB as soon as each job completes.

## 5. Graph Visualization System (`src/graph/`)
An advanced relationship explorer powered by **D3.js**:
- **Hybrid Rendering**: Automatically switches between **SVG** (for high interactivity) and **Canvas** (for high performance at scale > 5000 nodes).
- **Level of Detail (LOD)**: Dynamically adjusts visual complexity based on zoom level—hiding labels or entire nodes to maintain fluid performance.
- **Force Simulation**: Uses a multi-force engine (charge, link, collision) to naturally cluster products by brand or category.
- **Position Persistence**: Node coordinates can be saved and reloaded, allowing users to build a permanent mental map of their inventory.

## 6. Background Pipeline (`import.worker.ts`)
To ensure the UI remains responsive (60fps) during heavy ingestion:
- **Web Worker Offloading**: The entire parsing and enrichment loop runs on a background thread.
- **Progress Tracking**: Real-time progress updates are sent back to the main thread to drive UI loaders.

## 7. Persistence & State Management
- **Observable Store**: A zero-dependency state container handles the global product list and search/filter states with atomic updates.
- **IndexedDB**: Uses the `idb` wrapper to persist the catalog locally in the browser, allowing for gigabyte-scale inventories without performance degradation.

## 8. AI & Proxy Layer
- **Local LLM**: Requests are proxied via Vite to LM Studio (`/api/llm`) for zero-latency, private product analysis.
- **Scraper Proxy**: A Python-based back-end handles DuckDuckGo searches and web content extraction, providing clean markdown/text to the LLM.
