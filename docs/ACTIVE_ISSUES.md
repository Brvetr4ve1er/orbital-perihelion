# Active Issues

This register lists current issues verified against the codebase on 2026-04-27.

Priority scale:

- `P1` high impact / likely user-visible defect
- `P2` medium impact / incorrect behavior or misleading UX
- `P3` lower impact / maintainability or polish issue

## P1

### P1-1 Manual AI enrichment bypasses the canonical merge path

Impact:

- The queue path and the modal button write AI results differently.
- A product enriched manually can have different structure and lower data integrity than a product enriched through the queue.
- The manual path expects `result.ai_insights`, while the main LLM pipeline now returns `intelligence`.

Evidence:

- `src/ui/features/dashboard/ProductIntelligenceUI.tsx:101`
- `src/ui/features/dashboard/ProductIntelligenceUI.tsx:110`
- `src/ui/features/dashboard/ProductIntelligenceUI.tsx:117`
- `src/ui/features/dashboard/ProductIntelligenceUI.tsx:129`
- `src/services/enrichment-queue.ts:249`

Why this matters:

- `SchemaMapper.mergeIntoProduct(...)` is the only place that consistently merges observations, rebuilds consensus, rebuilds the search index, and validates the final product through Zod.
- The modal button does a partial handwritten merge instead.

Recommended fix:

- Route manual enrichment through `SchemaMapper.mergeIntoProduct(...)` exactly like the queue path.
- Delete the handwritten merge logic in `ProductIntelligenceUI.tsx`.

### P1-2 Sales CSV parsing is not quote-aware

Impact:

- Sales rows containing quoted commas, semicolons, or embedded delimiters can be split incorrectly.
- Revenue, velocity, and forecast widgets can silently compute on corrupted sales rows.

Evidence:

- `src/services/sales.ts:95`
- `src/services/sales.ts:117`

Why this matters:

- The inventory parser has a custom quote-aware parser.
- The sales parser falls back to `split(delim)` for both headers and rows.

Recommended fix:

- Reuse the quote-aware row parser pattern from `src/core/universal-csv-parser.ts`.
- Add fixture-based tests for Shopify/Woo/Square exports with quoted fields.

### P1-3 Analytics cache does not invalidate on product mutation

Impact:

- Editing prices, stock, or product metadata can leave KPI and analytics-derived surfaces stale as long as product count and sales count stay the same.
- Velocity and forecast caches are invalidated by the store, but analytics is not.

Evidence:

- `src/services/analytics.ts:173`
- `src/services/analytics.ts:199`
- `src/state/store.ts:7`
- `src/state/store.ts:9`
- `src/state/store.ts:10`

Why this matters:

- `analytics.ts` keys its cache on `products.length` and `sales.length`.
- `store.ts` only calls `invalidateVelocityCache()` and `invalidateForecastCache()` after product mutation.

Recommended fix:

- Invalidate analytics alongside velocity and forecast in `bustAnalyticsCaches()`.
- Prefer a mutation token such as `lastMutated` over array-length cache keys.

### P1-4 Graph projection reads price/stock from fields that are usually unset

Impact:

- Graph node metadata can show `null` price and stock even when those values exist on the product.
- Any graph-side inspection or future graph filtering by these fields will be unreliable.

Evidence:

- `src/services/graph-projection.ts:35`
- `src/services/graph-projection.ts:36`

Why this matters:

- Imported products store stock in `observations.stock` and retail price in `commercial.priceRange`.
- `graph-projection.ts` currently reads `p.consensus?.price_retail?.v` and `p.consensus?.stock?.v`.

Recommended fix:

- Read stock from `observations.stock` or a normalized helper.
- Read price from `commercial.priceRange.typical` or a canonical accessor.

## P2

### P2-1 Several settings panel controls are not wired to runtime behavior

Impact:

- The UI exposes configuration that users can change, but the runtime ignores it.
- This creates false expectations and makes troubleshooting harder.

Verified inactive or effectively inactive controls:

- `enrichment.autoEnrichOnImport`
- `enrichment.priorityBrands`
- `scraping.provider`
- `scraping.firecrawlKey`
- `scraping.timeoutMs`
- `performance.graphLodThreshold`
- `performance.cacheCapMb`
- `llm.systemPrompt`

Evidence:

- Definitions:
  `src/services/settings.ts:24`, `:28`, `:30`, `:33`, `:36`, `:52`, `:53`
- UI exposure:
  `src/ui/features/settings/SettingsPanel.tsx:155`, `:179`, `:192`, `:204`, `:220`, `:278`, `:284`
- Graph still uses a hardcoded renderer threshold:
  `src/graph/types.ts:96`
- Graph engine reads `DEFAULT_RENDER_CONFIG`, not the settings store:
  `src/graph/hooks/useGraphEngine.ts:34`

Recommended fix:

- Either wire each setting into the live services or remove/hide the control.
- Document active versus inactive settings in the UI until the wiring exists.

### P2-2 Secrets and connection presets are not persisted, but the UI does not make that explicit

Impact:

- Users can believe they saved an API key or scraping key when the app intentionally discards it on persist.
- Presets also omit keys, so a preset restore is incomplete by design.

Evidence:

- `src/services/settings.ts:132`
- `src/services/settings.ts:133`
- `src/services/llm.ts:140`
- `src/ui/features/settings/SettingsPanel.tsx:35`

Recommended fix:

- Keep the current safety behavior if desired, but disclose it clearly in the UI.
- If persistence is needed, implement an explicit "store secrets locally" opt-in.

### P2-3 Backup import does not rehydrate the live store

Impact:

- Importing a backup updates persistence, but the running UI still shows the old catalog until reload.
- The app itself already tells the user to reload.

Evidence:

- `src/ui/features/settings/SettingsPanel.tsx:53`
- `src/ui/features/settings/SettingsPanel.tsx:55`
- `src/ui/features/settings/SettingsPanel.tsx:56`

Recommended fix:

- After `Persistence.saveAll(data.products)`, call `inventoryStore.importSucceeded(data.products)` or reload the store state explicitly.

### P2-4 Main inventory import is UTF-8 only

Impact:

- Files exported in Windows-1252, ISO-8859-1, or other legacy encodings can be misread before parsing even begins.
- This especially matters for supplier exports with accented French headers or text.

Evidence:

- `src/ui/App.tsx:103`

Recommended fix:

- Detect encoding or allow user override.
- At minimum, document the UTF-8 expectation in the import UX.

### P2-5 Parser capability is narrower than the marketing language around it

Impact:

- Documentation and UI wording can set incorrect expectations about "any CSV", "any language", or "any format".
- Real failure modes become harder to diagnose because users assume the parser is more general than it is.

Evidence:

- Supported delimiters are fixed in `src/core/universal-csv-parser.ts`.
- Header mapping depends on a finite alias list in `COLUMN_MAP`.
- Main import is UTF-8 only via `src/ui/App.tsx:103`.

Recommended fix:

- Keep the parser, but describe it as "French/English inventory CSV parser with fuzzy alias mapping" rather than universal.

## P3

### P3-1 No automated test suite is configured

Impact:

- Parser changes, schema changes, and enrichment merge changes are easy to regress.
- The repo currently relies on manual verification and `vite build`.

Evidence:

- `package.json` contains `dev`, `build`, and `preview` scripts only.

Recommended fix:

- Add tests for:
  parser fixtures,
  schema merge behavior,
  sales CSV parsing,
  analytics cache invalidation.

### P3-2 Standalone graph mode is partly a demo surface, not a full alternate dashboard

Impact:

- `graph.html` renders example datasets when launched directly.
- Only the dashboard graph tab reflects the live inventory graph projection.

Evidence:

- `src/graph-main.tsx`
- `src/graph/components/GraphView.tsx`

Recommended fix:

- Document the distinction clearly.
- If standalone graph should reflect live state, add a persistence-backed bootstrap path.
