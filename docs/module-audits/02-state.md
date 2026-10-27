# State Module Audit

Scope:

- `src/state/store.ts`

## Responsibility

The state module is intentionally small. It owns:

- product array
- search query
- active filters
- import lifecycle
- mutation broadcasting

It also triggers persistence and cache invalidation as side effects.

## What Is Solid

- The store is easy to understand.
- Domain actions are clearer than generic setters.
- The observer pattern is sufficient for the app’s current size.
- Product mutations are funneled through a small number of methods.

## Verified Issues

### 1. Store actions mix state updates with infrastructure side effects

Observed behavior:

- `updateProduct()`, `bulkAdjustPrice()`, `deleteProducts()`, and import actions also call persistence and cache invalidation.

Why this matters:

- The store is both state manager and orchestration layer.
- That increases coupling to services and makes isolated testing harder.

### 2. `filteredProducts` remains in state even though dashboard derives filtered results independently

Observed behavior:

- `Dashboard.tsx` computes filtered products with `Engine.filterProducts(...)`
- the store still carries `filteredProducts`

Risk:

- Confusion about the real source of truth.
- Future contributors may accidentally revive stale-state bugs by using the wrong field.

Upgrade:

- Remove `filteredProducts` entirely if no active consumer requires it.

### 3. Cache invalidation policy is incomplete

Observed behavior:

- product mutation invalidates velocity and forecast caches
- analytics cache is not invalidated from the store path

This is already captured in the global issue ledger, but it is also a state-layer design problem: the store currently does not own a complete invalidation contract.

## Likely Hidden Risks

### 1. Subscription fanout risk

The store notifies all listeners on every mutation with the full state object. This is acceptable now, but as more views or heavier derived computations are added, render pressure can rise quickly.

### 2. Side-effect ordering risk

Persistence writes happen after state changes. If persistence fails repeatedly, the UI still reports success and moves on. That may be acceptable for a local-first tool, but it means state truth and durable truth can diverge.

### 3. Undo/transaction gap

Bulk operations mutate product state directly with no transaction or undo mechanism. As editing surfaces grow, the lack of mutation history will become more expensive.

## Upgrade Directions

### Medium-weight upgrades

- Remove dead state fields.
- Introduce selectors or derived helpers instead of pushing all derivation into subscribers.
- Add persistence failure surfacing to the UI or a diagnostics channel.

### Heavy upgrades

- Split into:
  pure reducer/store,
  command side effects,
  derived selectors.
- Add mutation journaling:
  enough to support undo, audit history, and safer bulk edits.
- Move to a formally structured store toolkit only if the app’s mutation complexity continues to increase.

## Recommended Priority

1. Remove or fully deprecate `filteredProducts`.
2. Make cache invalidation complete and explicit.
3. Separate side effects from pure state transitions if editing workflows expand.
