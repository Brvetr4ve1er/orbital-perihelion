# Solution Proposals

## Decision Frame

There are three realistic paths forward.

## Option A: Stabilize the Current React App First

This is the recommended near-term path.

### Scope

- keep `tambo-ui`
- keep bridge temporarily
- fix CSV correctness
- fix state ownership
- fix broken or misleading UI behaviors
- improve docs and operational clarity

### Pros

- lowest disruption
- fastest path to a usable product
- preserves current graph work
- reduces risk before larger refactors

### Cons

- transitional architecture remains for a while
- some duplication remains until phase 2

### Best Use

Choose this if the goal is to get a reliable working product soon.

## Option B: Modularize the Backbone Into Shared ESM Modules

This is the recommended medium-term architecture upgrade.

### Scope

- move parser/schema/enrichment logic out of browser globals
- convert backbone files into importable modules
- create explicit service boundaries
- consume those modules from React directly

### Pros

- removes `window` dependency
- improves testing and refactoring
- makes long-term backend reuse possible
- removes copy drift between root and `public/backbone`

### Cons

- more refactor risk
- requires careful compatibility verification with legacy logic

### Best Use

Choose this after Option A stabilization has reduced product risk.

## Option C: Full Platform Re-architecture

This is not recommended immediately.

### Scope

- redesign frontend-backend boundary
- move parsing and enrichment to a service layer
- introduce persistent storage
- redesign the app around explicit ingestion pipelines

### Pros

- strongest long-term design
- clean architecture
- much better scalability

### Cons

- highest cost
- highest execution risk
- easy to lose working domain logic during the rewrite

### Best Use

Choose this only after the current product is stabilized and its real usage patterns are better understood.

## Recommended Combined Strategy

### Phase 1

Stabilize the existing React product.

### Phase 2

Modularize legacy backbone logic into shared modules.

### Phase 3

Consider backend and persistence redesign only after phases 1 and 2 are complete.

## Specific Fix Proposals

### Proposal 1: Replace ad hoc CSV parsing with a real parser boundary

Do not keep extending `csv-handler.js` with string rewrites.

Recommended direction:

- parse header and rows with a proper CSV parser
- perform column mapping structurally, not by string replacement
- transform records into a canonical intermediate format
- only then pass normalized data into product parsing/enrichment logic

Expected outcome:

- much fewer corrupted imports
- clearer debugging
- easier support for supplier-specific formats

### Proposal 2: Make the store the single source of truth

All mutations should go through store actions.

Required changes:

- stop mutating `product` directly in inspector flows
- add a proper enrichment update action
- persist updates through the store
- recompute analytics from canonical state changes

Expected outcome:

- predictable React behavior
- reliable persistence
- easier future collaboration

### Proposal 3: Introduce explicit app states

The app should model these states directly:

- idle
- importing
- import_failed
- loaded
- enriching
- enrichment_failed

Expected outcome:

- user-visible failures become clear
- less UI branching ambiguity
- better observability

### Proposal 4: Remove placebo UI features

If a control exists, it must affect behavior.

Required cleanup:

- wire `edgeThickness` to actual rendering, or remove it
- either implement `DOWNGRADE` edges or remove them from legend/constants
- audit settings and labels for truthfulness

Expected outcome:

- increased UI trust
- lower maintenance debt

### Proposal 5: Turn the bridge into an adapter layer, then replace it

Short term:

- keep `bridge.js` but make it a narrow adapter
- avoid leaking `window` logic across the app

Medium term:

- replace bridge-backed wrappers with imported modules

Expected outcome:

- lower refactor cost
- cleaner migration path

## Recommendation Summary

The best path is:

1. stabilize import and state correctness
2. reduce UX dishonesty
3. modularize backbone logic
4. only then redesign deeper infrastructure
