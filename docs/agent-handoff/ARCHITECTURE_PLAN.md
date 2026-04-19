# Architecture Plan

## Target Architecture

The recommended target architecture is a layered local-first application with explicit module boundaries.

## Recommended Layers

### 1. Presentation Layer

Location:

- `tambo-ui/src`

Responsibilities:

- file selection and user workflows
- state-driven view rendering
- graph, treemap, card, and inspector views
- progress and error presentation

Should not own:

- parsing rules
- CSV dialect handling
- AI request formatting details
- domain-specific enrichment logic

### 2. Application Layer

Recommended future location:

- `tambo-ui/src/core/app`
- or shared package directory such as `shared/product-intel`

Responsibilities:

- orchestration of import pipeline
- coordination between parser, schema, enrichment, and storage
- transformation of raw records into app state objects
- command-style actions like `importInventory`, `enrichProduct`, `loadPersistedInventory`

This layer should become the main operational heart of the system.

### 3. Domain Layer

Recommended future location:

- `shared/product-intel/domain`

Responsibilities:

- product model
- category model
- commercial calculations
- relation generation
- analytics

This layer should be pure where possible.

### 4. Infrastructure Layer

Recommended future location:

- `shared/product-intel/infrastructure`

Responsibilities:

- CSV parser implementation
- local LLM gateway adapter
- persistence adapter
- web scraping adapter if retained

This layer should hide implementation details from the app.

## Target Data Flow

Recommended import flow:

1. Raw file input
2. CSV parse into rows
3. Header mapping into canonical fields
4. Domain normalization into product drafts
5. Enrichment pass
6. Analytics generation
7. State commit
8. Persistence write

Current problem:

The project mixes steps 2 through 5 inside a UI-adjacent function and relies on legacy globals during the process.

## Recommended Module Boundaries

### Inventory Import Service

Purpose:

- own end-to-end import behavior

Suggested interface:

```js
async function importInventory(fileText, options) => {
  products,
  analytics,
  warnings,
  mapping,
}
```

### Enrichment Service

Purpose:

- own per-product AI and lookup enrichment

Suggested interface:

```js
async function enrichProduct(product, context) => {
  product,
  metadata,
  warnings,
}
```

### Graph Service

Purpose:

- turn product state into graph nodes and edges

Suggested interface:

```js
function buildProductGraph(products, options) => graph
```

This already exists conceptually in [graph-data.js](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/graph/graph-data.js), and should be preserved.

## State Model Recommendation

The store should evolve from generic setters to domain actions.

Recommended actions:

- `IMPORT_STARTED`
- `IMPORT_SUCCEEDED`
- `IMPORT_FAILED`
- `PRODUCT_ENRICH_STARTED`
- `PRODUCT_ENRICH_SUCCEEDED`
- `PRODUCT_ENRICH_FAILED`
- `PRODUCT_UPDATED`
- `INVENTORY_LOADED_FROM_STORAGE`

This will make the UI easier to reason about and easier for agents to extend.

## Persistence Recommendation

Short term:

- keep `localStorage`
- persist only canonical normalized product state

Medium term:

- move to IndexedDB or a lightweight local database if historical sessions matter

Do not:

- persist partially transformed or ambiguous raw rows as if they were canonical product objects

## Migration Strategy

### Stage 1

Wrap existing legacy functions in adapter services.

### Stage 2

Extract logic from `public/backbone` into importable modules.

### Stage 3

Delete browser-global script loading.

### Stage 4

Clean remaining legacy root-level assets and align docs with actual architecture.

## Architecture Principles for Future Agents

- Prefer explicit data contracts over string rewriting.
- Prefer app actions over direct object mutation.
- Prefer shared modules over copied scripts.
- Preserve graph and domain logic that already works.
- Do not widen the bridge-based architecture; shrink it over time.
