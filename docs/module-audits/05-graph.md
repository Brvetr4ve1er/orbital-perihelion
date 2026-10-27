# Graph Module Audit

Scope:

- `src/graph/*`
- `src/services/graph-projection.ts`
- `src/graph-main.tsx`

## Responsibility

This module renders a force-directed relationship graph for products, brands, and categories. It also supports a standalone graph page with example data.

## What Is Solid

- The graph subsystem is relatively self-contained.
- React is kept out of the simulation tick path.
- The SVG/Canvas split is a good design choice.
- Position persistence is a strong usability feature for exploration.

## Verified Issues

### 1. Live graph and standalone graph have different purposes

Observed behavior:

- dashboard graph tab uses projected live product data
- `graph.html` uses example presets unless external data is supplied

Why this matters:

- "graph module" currently means both product exploration and a demo surface.
- That ambiguity should be explicit in docs and UI.

### 2. Graph metadata extraction is partly disconnected from product truth

Observed behavior:

- projection reads `consensus.price_retail` and `consensus.stock`
- imported products commonly store price and stock elsewhere

Impact:

- node detail and future graph behaviors can operate on null metadata

### 3. Settings-based graph threshold is not wired

Observed behavior:

- graph engine uses `DEFAULT_RENDER_CONFIG.svgThreshold`
- settings expose `graphLodThreshold`

Impact:

- operators cannot actually tune the threshold through settings

### 4. The graph is structurally shallow

Observed behavior:

- projection creates product → brand and product → category links

Implication:

- the graph is currently more of a categorized relationship map than a richer intelligence graph.
- It does not yet represent competitive, bundle, or upgrade relationships from the canonical schema.

## Likely Hidden Risks

### 1. Persistence collision risk

Saved node positions may age poorly when graph topology changes significantly across catalogs or schema revisions.

### 2. Scale ceiling risk

The renderer switch is good, but the graph will still hit practical usability limits once node count, label clutter, and interaction density rise together. Canvas solves only part of that.

### 3. Semantic underuse risk

The canonical schema already contains richer relationships than the graph currently surfaces. If that gap remains, the graph will stay visually impressive but semantically underpowered.

## Upgrade Directions

### Medium-weight upgrades

- Fix graph metadata reads to use canonical helpers.
- Wire actual settings into graph render config.
- Distinguish live graph mode from demo graph mode in UI and docs.
- Add relationship badges or filters for richer edge types when present.

### Heavy upgrades

- Introduce multi-layer graph modes:
  taxonomy graph,
  commercial graph,
  competitive graph,
  bundle/upgrade graph.
- Add graph data versioning so saved layouts are invalidated safely when topology semantics change.
- Move graph projection into a richer domain graph builder with typed edge semantics and weighting rules.

## Recommended Priority

1. Correct metadata reads.
2. Wire settings properly.
3. Expand edge semantics only after product truth accessors are standardized.
