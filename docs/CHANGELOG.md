# PKOS Engineering Changelog

> All notable changes, fixes, and decisions made during the stabilization phase.
> Format: `[DATE] [TYPE] Description — Files affected`
> Types: `FIX` `ADD` `REMOVE` `REFACTOR` `ISSUE` `DECISION`

---

## Session 2026-04-27 — Documentation Reality Pass

### REFACTOR — Main docs rewritten from code, not roadmap language
**Files:** `docs/README.md`, `docs/OVERVIEW.md`, `docs/FUNCTIONING.md`, `docs/ACTIVE_ISSUES.md`, `docs/INSIGHTS_AND_ISSUES.md`
**Reason:** The previous top-level docs mixed historical intent, future-state claims, and partially outdated implementation notes. They repeatedly overstated parser universality, storage guarantees, graph configurability, and settings wiring.
**Change:** Replaced the main docs set with a code-audited description of:
- the actual runtime flow
- the real data model
- the split between rule-based enrichment and AI enrichment
- known inactive settings
- current bug register with file evidence and remediation suggestions

### DECISION — Historical handoff notes kept as historical context
**Files intentionally left untouched:** `docs/agent-handoff/*`, `docs/ALTERNATIVE.md`, `docs/FINAL_ADAPTIVE_PRODUCT_SCHEMA.md`
**Reason:** These files still have value as planning or historical reference, but they are no longer treated as the source of truth for current behavior.

### ADD — Module-by-module audit set
**Files:** `docs/module-audits/README.md`, `docs/module-audits/01-core.md`, `docs/module-audits/02-state.md`, `docs/module-audits/03-services.md`, `docs/module-audits/04-ui.md`, `docs/module-audits/05-graph.md`, `docs/module-audits/06-scraper-sidecar.md`, `docs/module-audits/07-platform-and-build.md`
**Reason:** The first documentation pass captured application-wide behavior and active issues. This second pass breaks the codebase down by module so future humans or agents can audit responsibilities, likely blind spots, and upgrade opportunities without re-deriving structure from the repo each time.

---

## Session 2026-04-19 — Import Crash Fix (Zod v4 bug)

### FIX [CRITICAL] — "Cannot read properties of undefined (reading '_zod')" on CSV import
**File:** `src/core/schema.ts` line 151
**Root cause:** Zod v4.3.6 bug — `z.record(z.any())` (one-argument form) leaves `def.valueType` as `undefined` internally. When the parser tries to validate a product with any content in `enrichment.specs`, the ZodRecord parsing code does `def.valueType._zod.run(...)` which crashes with this error. The Web Worker catches it and forwards the message back to the UI.
**Reproduction:** `z.record(z.any()).optional().safeParse({key: value})` throws. `z.record(z.string(), z.any()).optional().safeParse({key: value})` works fine.
**Fix:** Changed `specs: z.record(z.any()).optional()` → `specs: z.record(z.string(), z.any()).optional()`. The explicit key schema makes Zod v4 initialize `def.valueType` correctly.
**Scope:** Only `enrichment.specs` was affected — all other `z.record()` calls in the schema already used the two-argument form.

---

## Session 2026-04-19 — Logic & UX Bug Sweep

### FIX — Store `updateProduct` was blowing away active filters
**File:** `src/state/store.ts`
**Bug:** `updateProduct()` set `filteredProducts: products` (all products, unfiltered). Every time AI enrichment completed for any product, the full unfiltered list was written to state, clearing whatever category/brand/search filter the user had active.
**Fix:** Removed `filteredProducts` from the `updateProduct` patch. The Dashboard already derives its displayed list via `useMemo(Engine.filterProducts(state.products, ...))`, so the store's `filteredProducts` field only needs to be set on a full import.

### FIX — ProductIntelligenceUI modal shows stale data during AI enrichment
**File:** `src/ui/features/dashboard/Dashboard.tsx`
**Bug:** When a user opens a product detail modal and the AI enrichment queue finishes enriching that product, the modal still displays the pre-enrichment state because `selectedProduct` is a snapshot stored in local React state.
**Fix:** The store subscription callback now checks if the open product was just updated and replaces it with the fresh version from the store in the same tick, with no visible flicker.

### FIX — Enrichment `extractSpecs` only caught `55P` screen size format
**File:** `src/services/enrichment.ts`
**Bug:** `upper.match(/(\d{2})P\b/)` matched only `55P`. Products listed as `55"`, `55 POUCES`, `55 POUCES`, `55INCH` all failed to extract a screen size, so the TV builder had no size data to work with.
**Fix:** Broadened to `/\b(\d{2,3})\s*(?:P\b|"|\s*(?:POUCES?|INCHES?))/`. Added extraction for litres, watts, HP/CV, BTU, and couvert (dishwasher places).

### FIX — TV builder fabricated a `43"` screen size when none was detected
**File:** `src/services/enrichment.ts`
**Bug:** `screen_size: (nums.size_or_feux || 43) + '"'` injects a hardcoded default when no size is found in the product name. This manufactures false data that flows into the consensus layer and can appear in the product detail modal with 0.8 confidence.
**Fix:** TV builder only sets `screen_size` and `resolution` when `nums.size_or_feux` was actually extracted. Similarly, washing machine builder only sets `capacity` when a real KG value exists.

### ADD — ATTR_BUILDERS for refrigerator, freezer, AC, microwave, dishwasher
**File:** `src/services/enrichment.ts`
**Bug:** All categories except `tv` and `washing_machine` fell through to `other: () => ({ status: 'Verified', warranty: '24 Months' })`, giving every fridge, AC, and microwave the same two useless attributes.
**Fix:** Added real builders for `refrigerator` (capacity L, No Frost, Inox finish), `freezer` (capacity, type), `ac` (Split, Inverter, HP, BTU), `microwave` (power W, capacity L), and `dishwasher` (couvert count).

### FIX — Confidence score disconnect between `_meta.score` and `identity.confidenceScore`
**File:** `src/services/enrichment.ts`
**Bug:** `calculateScore()` computed a score and wrote it to `p._meta.score`, but never updated `p.identity.confidenceScore`. The Validator and all UI components read `identity.confidenceScore`, which stayed at the initial `0.5` even after full enrichment. Two competing "truth scores" diverged silently.
**Fix:** After `calculateScore()`, also write the result to `p.identity.confidenceScore`.

### FIX — Missing `beauty` and `hair_dryer` category labels and icons
**File:** `src/core/product-adapter.ts`
**Bug:** CATEGORY_PATTERNS maps épilateurs/tondeuses to `beauty` and sèche-cheveux to `hair_dryer`, but `_categoryLabel` and `_categoryIcon` had no entries for either ID. Both rendered as `undefined` in filter pills, category stats, and the legend.
**Fix:** Added `beauty: 'Beauté & Soin'` / `💅` and `hair_dryer: 'Sèche-Cheveux'` / `💨` to both lookup tables.

---

## Session 2026-04-19 — CSV Parser Hardening & Scroll Fix

### FIX [CRITICAL] — `normalizeKey` diacritic removal was completely broken
**File:** `src/core/universal-csv-parser.ts`
**Root cause:** `normalizeKey()` called `.normalize('NFC')` AFTER the diacritic strip regex. In NFC form, accented characters like `é` are single precomposed code-points (U+00E9), not subject to the `[\u0300-\u036f]` regex. The fix is to call `.normalize('NFD')` FIRST which decomposes `é` → `e + U+0301`, allowing the regex to remove the combining mark.
**Impact:** Every CSV header containing an accented character (`Catégorie`, `Quantité en Stock`, `Marque`, `Désignation`, etc.) was returning a garbled norm string, making header→field mapping fail silently. Users importing any real French inventory file would get partially or fully unmapped fields.

### FIX [CRITICAL] — COLUMN_MAP variants were never normalized
**File:** `src/core/universal-csv-parser.ts`
**Root cause:** `mapHeaders()` normalized the header string but compared it directly against raw variant strings (e.g. `'catégorie'`). Even with the correct NFD fix, `'categorie' !== 'catégorie'`. Pre-computing `NORMALIZED_MAP` at module load time ensures both sides of every comparison are in the same ASCII form.

### FIX — `parseNumber` thousands separator handling
**File:** `src/core/universal-csv-parser.ts`
**Issue:** `.replace(',', '.')` only replaces the first comma. `1.234,56` → `1.234.56` → NaN → 0. Now detects separator conventions from position (US vs European) and handles space-separated thousands.

### ADD — Barcode / EAN / MPN as canonical product identifiers
**Files:** `src/core/universal-csv-parser.ts`, `src/core/product-adapter.ts`, `src/core/schema.ts`, `src/core/search-index.ts`
**Issue:** `Code Barre` (EAN-13 barcode) was mapped to the `id` field. If the file also had an explicit `ID` column, the barcode was silently discarded. `mpn` (manufacturer part number) was not extracted at all.
**Fix:** Added dedicated `barcode` and `mpn` fields to `RawProductRow`, `COLUMN_MAP`, and the CPO enrichment schema. Both are stored as observations for the consensus layer and included in the search index so products can be found by scanning a barcode. The product detail modal now shows barcode and MPN if present.

### FIX — Scroll broken in Replit iframe proxy
**File:** `src/index.css`
**Issue 1:** Page scroll was set on `body` (`overflow-y: auto`). In Replit's proxied iframe, the body scroll can be intercepted or ignored. The fix moves the scroll root to `.app-container` with `height: 100%; overflow-y: auto`, while `html`/`body`/`#root` are set to `height: 100%; overflow: hidden`.
**Issue 2:** `.tv-body` (the TableView virtual scroll container) had both `flex: 1` and `height: 65vh`. In a flex parent with no fixed height, `flex: 1` grows unboundedly, preventing the `height` constraint from creating a scroll container. Removed `flex: 1`; the virtualizer now correctly sees a bounded `60vh` scroll element.

---

## Session 2026-04-19 — Dashboard Evolution & Performance

### ADD — Compare & Table Views
**Files:** `src/ui/features/dashboard/CompareView.tsx`, `src/ui/features/dashboard/TableView.tsx`, `src/ui/features/dashboard/Dashboard.tsx`
**Action:** Implemented two new dashboard views to handle high-density data and analytical comparisons.
- **Compare View:** Side-by-side grid supporting 2-4 products concurrently, employing diff-highlighting for discrepant values and automatic min/max highlighting for numeric data.
- **Table View:** Spreadsheet-style dense layout using `@tanstack/react-virtual` to gracefully handle 10,000+ items at 60 FPS while supporting interactive sorting state and inline UI overlays.

### FIX [P2-5] — Pre-computed Search Index
**Files:** `src/core/search-index.ts`, `src/core/engine.ts`, `src/core/product-adapter.ts`, `src/services/enrichment-queue.ts`
**Action:** Resolves the UI rendering stutter on large catalogs by moving search string concatenation out of the render loop. `buildSearchIndex` runs at ingestion (inside `ProductAdapter`) and gets re-triggered when LLM enriches target products, making text search operations purely O(1) latency checks.

## Session 2026-04-14 — Cleanup + Phase 1 Stabilization

### REMOVE — Legacy file deletion
**Files removed:** `pkos.html`, `pkos.css`, `products.json`, `_product_names.txt`, `tambo/`, `dist/`
**Reason:** Dead artifacts from the legacy vanilla-JS era. `tambo/` was an entire external framework repo incorrectly cloned into the project root, bloating the workspace and causing confusion. `dist/` should never be committed.

### FIX — vite.config.js second build input
**File:** `vgeminiite.config.js`
**Issue:** Build referenced a `pkos.html` entry that no longer existed after cleanup.
**Fix:** Removed `build.rollupOptions.input` block entirely. App now builds with default single-entry config.

### FIX — CSV header parsing correctness bug (critical)
**Files:** `src/core/inventory-parser.ts`, `src/core/pkos-csv-parser.ts`
**Issue:** Header line was parsed with naive `split(',')` while data rows used the quote-aware `parseCSVRow()`. Any quoted header value (e.g. `"Prix d'Achat"`) would split incorrectly, corrupting the column→field mapping for every row in the file.
**Fix:** Changed header parsing to use `this.parseCSVRow(lines[0])` matching the data row path.

### ADD — Store domain actions
**File:** `src/state/store.ts`
**Issue:** State had no explicit lifecycle — `setLoading()` / `setError()` were ad-hoc and didn't compose. Silent failures were invisible.
**Change:** Added `importStatus: 'idle' | 'loading' | 'success' | 'error'` field plus domain actions `importStarted()`, `importSucceeded()`, `importFailed()`, `updateProduct()`. Old methods kept as `@deprecated` shims.

### ADD — Import error surface in UI
**File:** `src/ui/App.tsx`
**Issue:** Error state existed in the store but was never rendered. Users saw a blank screen on failure.
**Change:** Added three distinct states in the render tree: loading spinner, error card with message, empty landing state. Error messages now include the actual reason.

### ADD — Auto-enrichment on import
**File:** `src/ui/App.tsx`
**Issue:** `EnrichmentService.enrich()` existed but was never called during the import flow.
**Change:** Every parsed product now runs through `EnrichmentService.enrich()` before being stored. Brand/category detection and consensus computation happen at import time.

---

## Session 2026-04-14 — Universal CSV Parser

### ISSUE — CSV import completely broken for real inventory files
**Root cause:** The format detector (`InventoryParser.isInventoryCSV`) checked for hardcoded English keywords `DESIGNATION`, `PV HT`, `QTE`. The actual user inventory file uses French headers: `Nom`, `Prix de Vente (Détail)`, `Quantité en Stock`. Both detectors failed → `Parser.parse()` returned `[]` → user sees "no products found".
**Impact:** 100% of real user files were rejected.

### ADD — Universal CSV Parser
**File:** `src/core/universal-csv-parser.ts` (new)
**Design decisions:**
- Auto-detects delimiter (comma, semicolon, tab, pipe) by counting occurrences in first line
- Maps 50+ header name variants across French/English to canonical field names using fuzzy matching
- Handles quoted fields with proper escape (`""`) handling
- Skips rows with no product name (won't create ghost products from blank rows)
- `diagnose()` method returns a human-readable summary of what was detected — used for error messages
- Zero hardcoded column names anywhere in the parse path

**Canonical fields detected:** `id`, `name`, `brand`, `category`, `sku`, `price_retail`, `price_purchase`, `price_wholesale`, `stock`, `stock_status`

### REFACTOR — Parser.ts simplified
**File:** `src/core/parser.ts`
**Change:** Removed all format-detection branching. Single path: `UniversalCSVParser.parse()` → `ProductAdapter.fromRawRow()`. Old branch kept only for `export()` (still uses PKOSCsvParser).

### REFACTOR — ProductAdapter updated for RawProductRow
**File:** `src/core/product-adapter.ts`
**Change:** Added `fromRawRow(row: RawProductRow)` entry point. Improved field fallback chain to cover both new `RawProductRow` shape and legacy ad-hoc shapes. Fixed category icon lookup. Stock/price now stored as observations for the consensus layer.

### FIX — Build error: await in non-async callback
**File:** `src/ui/App.tsx`
**Issue:** Used `await import(...)` for dynamic import inside a `FileReader.onload` callback. `onload` is not declared `async` in the TS type, causing a build error.
**Fix:** Moved `UniversalCSVParser` to a static import at file top.

---

## Session 2026-04-16 — Phase 2 Stabilization

### ADD — Documentation system
**Files added:** `docs/CHANGELOG.md`, `docs/ACTIVE_ISSUES.md`
**Reason:** Prior sessions had no traceability. Every change, issue, and decision is now documented in real-time.

### FIX [P0-1] — Dashboard store subscription was missing
**File:** `src/ui/features/dashboard/Dashboard.tsx`
**Issue:** Component called `inventoryStore.getState()` once at render and never subscribed. Filter and search changes never triggered a re-render — the product list was permanently stale after first load.
**Fix:** Added `useEffect` + `useState` subscription loop, same pattern as `App.tsx`. Stats now computed from the full product list; filtered list computed for display.

### FIX [P0-3] — Stale error hint referenced deleted column format
**File:** `src/ui/App.tsx`
**Issue:** Error state still said "DESIGNATION, QTE, PV TTC" — the old hardcoded keywords from the format detector that was replaced with the universal parser.
**Fix:** Updated hint to describe the universal parser's actual capability.

### FIX [P1-1] — Margin always 0 on all products
**File:** `src/core/product-adapter.ts`
**Issue:** `toLegacy()` read margin from `consensus.margin` which was never written by `EnrichmentService`. Result was 0% margin on every card and in the KPI strip.
**Fix:** Margin now computed directly in `toLegacy()` as `(retail - purchase) / retail * 100`. No longer depends on an enrichment observation.

### FIX [P1-2] — Stock status and stock quantity from CSV now preserved
**File:** `src/core/product-adapter.ts`
**Issue:** `toLegacy()` read stock from `consensus.stock` path which was unreliable. Stock status was derived from quantity thresholds (&gt;5: Normal, &gt;0: Faible, 0: Rupture) rather than using the CSV's explicit `Statut Stock` column.
**Fix:** Stock quantity read directly from `observations.stock[0].v`. Stock status stored as an observation from the CSV's `Statut Stock` column and read back in `toLegacy()` via `_normalizeStockStatus()`.

### FIX [P1-3] — Category detection missed all small appliances
**File:** `src/services/enrichment.ts`
**Issue:** `CATEGORY_PATTERNS` only covered large appliances (TV, washer, fridge, oven). 60%+ of inventory items (batteurs, blenders, friteuses, pétrin, aspirateurs, etc.) all fell into the useless `other` category.
**Fix:** Added 18 new patterns covering all major small appliance types present in the real inventory data.

### FIX [P1-5] — Modal had no CSS
**File:** `src/index.css`
**Issue:** `modal-overlay`, `modal-content`, `modal-close` classes referenced in `Dashboard.tsx` had zero CSS rules — modal was completely unstyled.
**Fix:** Added full modal CSS: glassmorphism overlay with blur, animated slide-in content panel, styled close button with hover state.

### FIX [P1-6] — Search index mutated product objects
**File:** `src/core/engine.ts`
**Issue:** `indexProduct()` wrote `p._searchIndex = ...` inside the filter function — a side effect in a pure computation path.
**Fix:** Replaced with `buildSearchIndex(p): string` — pure function returning the index string without touching the product object.

### ADD — Missing utility methods in ProductAdapter
**File:** `src/core/product-adapter.ts`
**Changes:** Added `_categoryLabel()` (human-readable label from cat ID), `_normalizeStockStatus()` (maps CSV status strings to display values), expanded `_categoryIcon()` to cover new small appliance categories.

### REMOVE [P2-1] — Dead `inventory-parser.ts` deleted
**File:** `src/core/inventory-parser.ts`
**Reason:** No longer imported anywhere after the universal parser replaced all format-specific parsers. Deleted to reduce confusion.

---

## Session 2026-04-16 — Stabilization & Hardening

### REFACTOR — Documentation Modernization
**Files:** `docs/FUNCTIONING.md`, `docs/INSIGHTS_AND_ISSUES.md`, `docs/ACTIVE_ISSUES.md`
**Action:** Rewrote core documentation to match the React 19 / TS architecture. Removed legacy references to `bridge.js` and global window injection. Consolidated active issues into a clean, prioritized list.

### ADD — Runtime Schema Validation (Zod)
**Files:** `src/core/schema.ts`, `src/core/product-adapter.ts`
**Action:** Implemented Zod schemas mirroring the CPO interfaces. Integrated `safeParse` into `ProductAdapter.normalize()` to catch malformed data during ingestion while maintaining fallback compatibility.

### ADD — Parser Verification Suite
**File:** `src/core/verify-parser.ts` (new)
**Action:** Created a standalone utility to test `UniversalCSVParser` logic against multiple dialects (Semicolon, Comma, Quoted, Malformed). Verified robustness of header mapping.

### FIX — Fuzzy Header Mapping expanded
**File:** `src/core/universal-csv-parser.ts`
**Action:** Added `prod` as a variant for product names to handle more obscure inventory headers (e.g., `XYZ-PROD`).

### ADD — Enrichment Categories
**File:** `src/services/enrichment.ts`
**Action:** Added 8+ new kitchen and beauty appliance patterns including `PLANCHA`, `CREPIERE`, `GAFRIERE`, `TONDEUSE`.

---

## Session 2026-04-18 — Intelligence Visualization & Batch Processing

### ADD — Graph Visualization System
**Files:** `src/graph/` (entire directory), `src/graph-main.tsx`, `graph.html`
**Action:** Implemented a high-performance D3-powered relationship explorer. 
- Hybrid SVG/Canvas rendering.
- Level-of-Detail (LOD) zoom logic.
- Node position persistence (localStorage).
- Brand/Category clustering force simulation.

### ADD — Batch Enrichment Queue
**Files:** `src/services/enrichment-queue.ts`, `src/ui/features/dashboard/EnrichmentQueuePanel.tsx`
**Action:** Created a sequential processing system for inventory-wide AI enrichment.
- Progress tracking with rolling ETA.
- Job status management (Pending/Running/Done/Failed).
- Real-time store/IDB synchronization.

### REFACTOR — Dual Entry-Point Build
**File:** `vite.config.js`
**Action:** Configured Rollup to output both `index.html` (Dashboard) and `graph.html` (Intelligence Graph).

### ADD — Project Documentation Alternatives
**File:** `docs/ALTERNATIVE.md` (new)
**Action:** Researched and documented open-source alternatives for every major tool in the stack (React, Vite, D3, Zod, etc.).

