# Functioning

This document describes the actual runtime path implemented in the repo.

## 1. App Startup

- `src/main.tsx` boots the main dashboard app.
- `src/graph-main.tsx` boots a separate graph-only page.
- `src/ui/App.tsx` initializes AOS, subscribes to the product store, pings the configured LLM endpoint, loads cached sales records, and restores persisted products from storage.

Important detail:

- Product restore comes from `Persistence.loadAll()`.
- The dashboard renders only after products exist in memory.
- The open product modal is kept in sync with store updates by `Dashboard.tsx`.

## 2. Inventory Import Path

The import pipeline is:

1. User selects a CSV in `App.tsx`.
2. The file is read as UTF-8 text with `FileReader.readAsText(file, 'utf-8')`.
3. A Vite module worker runs `src/workers/import.worker.ts`.
4. The worker calls:
   `Parser.parse(csvText)` -> `EnrichmentService.enrich(product)` -> `ProductValidator.validateAll(products)`.
5. The main thread stores results in `inventoryStore.importSucceeded(...)`.
6. The product array is persisted through `Persistence.saveAll(...)`.

What "enrichment on import" means here:

- It is rule-based enrichment only.
- It does not call the LLM.
- It always runs during worker import, regardless of the `autoEnrichOnImport` setting, because that setting is currently not wired.

## 3. CSV Parsing

`src/core/universal-csv-parser.ts` does the heavy lifting.

Implemented behavior:

- Delimiter detection:
  chooses between `;`, `,`, tab, and `|` using the first line.
- Quote-aware parsing:
  supports escaped quotes and multiline fields.
- Header normalization:
  strips diacritics and punctuation before alias matching.
- Alias mapping:
  maps a fixed list of French/English header variants onto canonical fields.
- Number parsing:
  attempts to handle both European and US-style numeric formats.

Current limits:

- Not truly "any language":
  the alias table is finite.
- Not truly "any encoding":
  the file reader hardcodes UTF-8.
- Not truly "any delimiter":
  only four delimiters are supported.

## 4. Canonical Product Normalization

`src/core/product-adapter.ts` converts raw parsed rows into the canonical `Product` shape from `src/core/schema.ts`.

The adapter is responsible for:

- Assigning product identity fields.
- Building default nested sections:
  `visual`, `technical`, `commercial`, `strategic`, `marketing`, `relationships`.
- Recording first-party observations:
  stock, purchase price, stock status, brand, barcode, MPN.
- Running Zod validation through `ProductSchema.safeParse(...)`.
- Stamping `_searchIndex` for fast search.

Important implementation detail:

- Many UI surfaces still rely on `ProductAdapter.toLegacy(product)` to flatten the canonical model into older display-ready fields.

## 5. Rule-Based Enrichment

`src/services/enrichment.ts` adds structure without calling external services.

Implemented rules:

- Brand detection from product name against `KNOWN_BRANDS`.
- Category classification from regex patterns.
- Basic spec extraction:
  screen size, kg, litres, watts, HP/CV, BTU, dishwasher covers.
- Curated DB overlay for hardcoded high-confidence product patterns.
- Observation append + consensus recomputation.
- Confidence score recomputation and sync into `identity.confidenceScore`.

What it does not do:

- It does not browse the web.
- It does not use the LLM.
- It does not validate whether inferred specs are commercially correct for a given model.

## 6. Store, Filters, and Persistence

`src/state/store.ts` is a small observable store.

State responsibilities:

- source product array
- search query
- active filters
- import status and error
- last mutation timestamp

Persistence responsibilities:

- `src/services/persistence.ts` uses IndexedDB first.
- If IndexedDB fails, it falls back to `localStorage`.
- Sales records are stored in a separate IndexedDB object store.

Persistence behaviors worth knowing:

- Full imports call `saveAll()` and clear the product store before rewriting it.
- Single-product updates call `updateOne()`.
- Delete and bulk price operations call `deleteMany()` / `putMany()`.
- Backup import from settings writes to persistence only; it does not repopulate the live store until reload.

## 7. Sales Import and Derived Analytics

Sales use a separate CSV path in `src/services/sales.ts`.

Implemented flow:

1. User imports a sales CSV from the header button.
2. `parseSalesCSV(text)` maps a smaller schema:
   `sku`, `barcode`, `date`, `qty`, `unitPrice`, `channel`.
3. `SalesService.addMany(...)` stores the rows in IndexedDB.
4. Dashboard widgets recompute velocity, revenue, category performance, and forecast data.

Derived services:

- `velocity.ts`
  sold 7/30/90d, velocity, days of cover, reorder signal.
- `analytics.ts`
  revenue, ABC/Pareto, daily series, KPI aggregates.
- `forecast.ts`
  revenue forecast and stockout ETA.
- `insights.ts`
  narrative insights assembled from the above caches.

Important limitation:

- Sales CSV parsing is simpler than inventory parsing and is not quote-aware.

## 8. AI Enrichment Path

There are two AI-related paths.

Batch path:

- `EnrichmentQueue.enqueueAll()` loads products into a serial queue.
- `EnrichmentQueue.start()` processes one product at a time.
- `LLMService.enrichProduct(product)` fetches search context via the Python sidecar or a DuckDuckGo HTML fallback.
- `SchemaMapper.mergeIntoProduct(...)` merges the extracted JSON into the canonical product.
- `inventoryStore.updateProduct(...)` writes the result back and persists it.

Manual single-product path:

- The "Enrichir avec l'IA" button in `ProductIntelligenceUI.tsx` also calls `LLMService.enrichProduct(product)`.
- Unlike the queue path, it does not use `SchemaMapper`.
- It writes a partial, older field shape into `knowledge`, `enrichment`, and `consensus`.

This split is one of the most important current defects. See `ACTIVE_ISSUES.md`.

## 9. LLM and Scraper Connectivity

`vite.config.js` defines local proxies:

- `/api/llm`
  forwarded to the configured local LLM endpoint, rewritten to `/v1/chat/completions`.
- `/api/ollama`
  forwarded to local Ollama.
- `/api/health`, `/api/search`, `/api/scrape`, `/api/enrich-product`, `/api/enrich`, `/api/proxy`
  forwarded to the Python sidecar.

Implemented scraper behavior:

- The frontend assumes the sidecar already exists.
- The frontend does not directly implement Firecrawl or provider switching.
- If the sidecar is unavailable, the app degrades to smaller browser-side fallback behavior for search, but not all workflows remain equivalent.

## 10. Dashboard Views

`src/ui/features/dashboard/Dashboard.tsx` orchestrates the UI.

Views:

- `grid`
  card-based catalog view
- `table`
  denser list/table
- `tree`
  hierarchical tree
- `graph`
  relationship graph
- `compare`
  side-by-side compare
- `ecommerce`
  CRM/ecommerce-oriented panel

Other always-on modules:

- KPI strip
- sales KPI strip
- insights feed
- revenue chart
- forecast panel
- reorder radar
- dead stock panel
- category leaderboard

## 11. Graph Mode

There are two graph entry modes:

- Dashboard graph tab:
  projects the live product list into graph nodes via `src/services/graph-projection.ts`.
- Standalone `graph.html`:
  uses example datasets unless external data is injected.

Renderer behavior:

- SVG under the default threshold.
- Canvas when node count exceeds the built-in threshold from `DEFAULT_RENDER_CONFIG.svgThreshold`.

Documentation correction:

- The graph system does switch renderer types.
- The user-facing `graphLodThreshold` performance setting is not what controls that threshold today.
