# Services Module Audit

Scope:

- persistence
- settings
- LLM integration
- scraper client
- schema merge
- enrichment queue
- sales, analytics, velocity, forecast, insights
- export helpers

Representative files:

- `src/services/persistence.ts`
- `src/services/settings.ts`
- `src/services/llm.ts`
- `src/services/scraper.ts`
- `src/services/schema-mapper.ts`
- `src/services/enrichment-queue.ts`
- `src/services/sales.ts`
- `src/services/analytics.ts`
- `src/services/velocity.ts`
- `src/services/forecast.ts`
- `src/services/csv-export.ts`

## Responsibility

This is the largest and most important module in the app. It acts as the application’s backend layer even though it runs mostly in-browser.

It owns:

- persistence
- external integration
- AI enrichment orchestration
- schema writeback
- sales intelligence
- backup/export behavior
- settings persistence

## What Is Solid

- The module boundaries are recognizable.
- Queue-based enrichment is the right default for local or rate-limited models.
- `SchemaMapper.mergeIntoProduct(...)` is the best write path in the app.
- IndexedDB first, with fallback behavior, is pragmatic for a local-first app.
- Analytics and forecast code are readable enough to audit.

## Verified Issues

### 1. Service quality is uneven between submodules

The services folder contains both disciplined code and weaker utility code.

Examples:

- `SchemaMapper` is relatively careful.
- `sales.ts` uses simplistic row splitting.
- `settings.ts` exposes values that runtime services do not consume.
- `llm.ts` contains both transport logic and prompt construction and fallback scraping logic.

This means "services" is currently a bucket, not one coherent layer.

### 2. `llm.ts` is doing too many jobs

It currently handles:

- status tracking
- provider config
- saved presets
- connection probing
- raw completion calls
- HTML search fallback
- sidecar orchestration
- prompt design
- post-processing of extraction payloads

Why this matters:

- The file is becoming the main integration knot in the repo.
- Hidden bugs are likely to appear at the boundaries between config, scraping, prompting, and merge expectations.

### 3. Settings persist incompletely and opaquely

Secrets are scrubbed intentionally, but that policy is not surfaced clearly to operators.

Impact:

- saved presets do not fully restore connectivity
- settings export/import does not preserve true runtime configuration

### 4. Cache strategy is inconsistent across analytics services

Observed patterns:

- velocity has explicit force invalidation
- forecast depends on its own key
- analytics uses product count + sales count

Why this matters:

- Similar services should not have materially different invalidation models without a clear reason.

### 5. Export behavior is lossy relative to the canonical model

`csv-export.ts` creates practical exports, but they flatten and simplify product state heavily.

Risk:

- exported CSV can look authoritative while omitting disagreement/provenance data
- Shopify export can silently produce structurally valid but semantically weak rows if product data is sparse

## Likely Hidden Risks

### 1. Prompt drift risk

`llm.ts` and `schema-mapper.ts` implicitly rely on a contract between prompt shape and merge logic. As prompts evolve, merge assumptions can become stale without obvious compile-time failure.

### 2. Local persistence growth risk

The app stores large nested product objects, observations, sources, images, and AI enrichment payloads. Storage will probably remain fine for modest catalogs, but the code has no active compaction strategy beyond observation trimming in `SchemaMapper`.

### 3. Sales identity matching risk

Sales depend mostly on normalized SKU matching. If catalogs drift in SKU formatting or suppliers change casing/spacing conventions, analytics can quietly miss real joins.

### 4. Export/import asymmetry risk

Backup import writes into persistence but not back into the live store. This suggests similar asymmetries may exist in other future admin operations unless a single rehydration pattern is established.

## Upgrade Directions

### Medium-weight upgrades

- Split `llm.ts` into:
  transport,
  prompts,
  search fallback,
  enrichment coordinator.
- Standardize cache invalidation with one mutation token source.
- Make settings metadata explicit:
  persisted, transient, secret, inactive.
- Add SKU normalization utilities shared by inventory and sales paths.
- Add export disclaimers in generated metadata or UI.

### Heavy upgrades

- Introduce an application service boundary:
  one orchestrator per workflow such as import, enrich, export, sales ingest.
- Add a structured import/export manifest format that preserves:
  schema version,
  provenance,
  settings persistence policy,
  compatibility checks.
- Move prompt contracts to typed schemas plus fixture validation.
- Add compaction and archival policies for old enrichment observations and source payloads.

## Recommended Priority

1. Break up `llm.ts`.
2. Standardize cache invalidation.
3. Harden sales identity mapping and quote-aware parsing.
4. Make settings persistence rules visible and explicit.
