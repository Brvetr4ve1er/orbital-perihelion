# Assessment Notes

This section is not a duplicate bug tracker. It captures broader engineering observations about the application after reading the codebase.

## What The Codebase Gets Right

### 1. Clear client-side architecture

The repo is not random glue code. It has recognizable layers:

- `core`
  parsing, schema, search, validation
- `services`
  persistence, enrichment, analytics, external integrations
- `state`
  one observable store
- `ui`
  dashboard composition and feature surfaces
- `graph`
  a largely self-contained visualization subsystem

That separation makes the app understandable and gives future maintainers obvious places to work.

### 2. Canonical model first, UI second

The best design decision in the project is the canonical `Product` shape plus `observations` and `consensus`. Even though some UI paths still flatten back to legacy shapes, the import and queue-based enrichment flows already converge on a single data model.

### 3. Build health is acceptable

The app currently builds successfully with `npm run build`. The most immediate risks are data correctness and feature drift, not broken compilation.

## Where The Codebase Is Fragile

### 1. Product truth is split across multiple representations

The app carries at least four active forms of product data:

- canonical product fields
- observations
- consensus
- legacy flattened projections from `ProductAdapter.toLegacy(...)`

This is workable, but only if every write path is disciplined. The queue path mostly is; the manual modal enrichment path is not.

### 2. UI surface area has outgrown the wiring underneath it

The dashboard has many views and many settings. Several of those controls are presentational or aspirational rather than implemented. That makes the product feel richer than it is, but it also increases support cost because users and future agents will trust controls that do nothing.

### 3. Caching strategy is inconsistent

Velocity and forecast are explicitly invalidated on product mutation. Analytics is not. That is a classic sign of local optimizations added over time without one unified invalidation policy.

### 4. Documentation previously described intent, not reality

Earlier docs repeatedly described:

- universal parsing
- gigabyte-scale browser storage
- fully wired scraping providers
- dynamic graph LOD settings

The implemented code does not support those statements in full. That mismatch is now a material maintenance problem, because any future contributor reading the old docs would form the wrong mental model before opening the code.

## Main Operational Risks

### 1. CSV correctness risk

Inventory import is relatively hardened. Sales import is not. Since reorder and forecast features depend on sales, weak parsing there can quietly poison downstream analytics.

### 2. AI merge correctness risk

The AI path is operationally useful, but only the queue path is reasonably canonical. The manual enrichment button is the most obvious data integrity hotspot in the repo.

### 3. Configuration trust risk

The settings panel currently overpromises. For operators, false configurability is worse than a missing setting because it suggests control where none exists.

## Practical Direction

If the project continues, the highest-value sequence is:

1. Unify all AI writes through `SchemaMapper`.
2. Fix sales CSV parsing and analytics invalidation.
3. Remove or wire dead settings.
4. Add a small test suite around parser fixtures and schema merges.
5. Reduce dependence on legacy flattening helpers over time.
