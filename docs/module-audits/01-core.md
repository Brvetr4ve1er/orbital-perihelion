# Core Module Audit

Scope:

- `src/core/schema.ts`
- `src/core/universal-csv-parser.ts`
- `src/core/parser.ts`
- `src/core/product-adapter.ts`
- `src/core/validator.ts`
- `src/core/search-index.ts`
- `src/core/engine.ts`

## Responsibility

This module defines the canonical product shape and the first half of the ingestion pipeline:

- parse inventory CSV rows
- map them into the canonical `Product`
- validate runtime shape
- build the search index
- run basic product filtering and stats

## What Is Solid

- The canonical schema is explicit and relatively rich.
- The adapter does real normalization work instead of leaking raw CSV rows into UI code.
- The parser is more defensive than a naive CSV import.
- The search index is centralized in one builder instead of being assembled ad hoc in multiple views.

## Verified Issues

### 1. The parser is marketed as universal, but it is a finite alias mapper

Observed behavior:

- delimiter support is fixed to four delimiters
- header recognition depends on `COLUMN_MAP`
- name is mandatory for row survival

Why this matters:

- The module is useful, but the implementation is bounded and domain-specific.
- Future maintainers may over-trust it and keep pushing more formats into the alias table instead of designing a real schema discovery layer.

### 2. Search index quality depends on only the first observation per key

Observed behavior:

- `buildSearchIndex()` walks `p.observations` and only includes `obs[0].v`

Risk:

- If better or newer values exist later in the observation array, search relevance can degrade.
- The index becomes sensitive to insertion order rather than final consensus.

Upgrade:

- Prefer consensus values where available, then append selected observation fallbacks.

### 3. `validator.ts` mutates products during validation

Observed behavior:

- `validateAll()` edits `p.identity.name` and `p.identity.confidenceScore` in place.

Risk:

- The validator is not purely validating; it is partially repairing and mutating.
- That makes testing and reasoning harder, especially if more repairs are added later.

Upgrade:

- Split into `normalizeProductQuality()` and `validateProductQuality()` stages.

### 4. Filtering and stats logic duplicates stock-status derivation

Observed behavior:

- `engine.ts` computes stock status heuristically in more than one place.

Risk:

- Stock classification rules can drift between views.
- Any future threshold change has to be applied manually in multiple spots.

Upgrade:

- Introduce a canonical helper such as `getDisplayStockStatus(product)`.

## Likely Hidden Risks

These are not confirmed runtime failures, but they are structurally likely.

### 1. CSV ambiguity risk will keep growing

The parser solves variability by expanding aliases. That approach scales poorly once:

- suppliers reuse the same header for different semantics
- multilingual imports extend beyond French/English
- duplicate columns appear with overlapping meaning

### 2. Canonical schema inflation risk

The schema is broad enough that teams may start writing partial truths into many different areas:

- `technical`
- `enrichment.specs`
- `observations`
- `consensus`
- `knowledge`

Without stricter write conventions, the product model can become internally inconsistent even when Zod passes.

### 3. Legacy compatibility can become permanent debt

`ProductAdapter.toLegacy()` is still a major bridge into UI behavior. If left in place indefinitely, every future schema refinement will have to support both canonical and legacy mental models.

## Upgrade Directions

### Medium-weight upgrades

- Add parser fixtures for all known supplier exports.
- Move stock and price display derivation into dedicated helpers.
- Make validator output explicit repair actions instead of silently mutating objects.
- Add confidence provenance helpers around consensus reads.

### Heavy upgrades

- Replace alias-table parsing with a staged import wizard:
  detect columns, preview mapping, allow user correction, persist mapping profiles per supplier.
- Introduce a read model layer:
  canonical product in storage, dedicated view models for dashboard/graph/export.
- Formalize fact ownership:
  define which fields are authoritative in `commercial`, `technical`, `consensus`, and `enrichment`.

## Recommended Priority

1. Centralize stock/price/status derivation.
2. Add parser fixtures and regression tests.
3. Reduce dependence on `toLegacy()` through explicit view models.
