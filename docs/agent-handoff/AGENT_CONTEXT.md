# Agent Context

## Mission

The project is trying to become a local-first product intelligence tool for retail inventory analysis, especially for messy consumer electronics CSVs.

Core intended workflow:

1. User imports CSV inventory data.
2. The system normalizes names, categories, pricing, stock, and specs.
3. The system optionally enriches products with local AI and web lookup.
4. The UI lets the user inspect products through graph, treemap, and card views.

## Active Code Surface

The active app is the React/Vite app in [tambo-ui](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui).

Important files:

- [main.jsx](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/main.jsx)
- [App.jsx](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/App.jsx)
- [bridge.js](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/core/bridge.js)
- [csv-handler.js](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/core/csv-handler.js)
- [store.jsx](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/core/store.jsx)
- [GraphCanvas.jsx](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/graph/GraphCanvas.jsx)
- [graph-data.js](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/graph/graph-data.js)
- [InspectorPanel.jsx](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/src/ui/InspectorPanel.jsx)

Legacy backbone scripts are copied into:

- [public/backbone](/C:/Users/ROG%20STRIX/Documents/playground/PRODUCT%20INTEL%20ENGINE/tambo-ui/public/backbone)

Those scripts currently provide:

- parser logic
- enrichment helpers
- category schema
- local LLM integration

## Current Reality

The project is in a transitional state:

- The UI has been modernized into React.
- The core parsing and enrichment logic is still loaded as browser globals.
- State management exists, but not all features use it correctly.
- The graph system is materially more advanced than the ingestion and persistence layers.

## Key Constraints

- The app currently depends on browser-loaded global scripts.
- CSV handling is fragile.
- Local AI availability is optional in practice, even if the UX suggests otherwise.
- Existing docs are descriptive, but not sufficient as an implementation guide.

## Highest-Value Principle

Future work should prioritize this order:

1. Make import correctness reliable.
2. Make state changes explicit and persistent.
3. Remove architecture duplication and global-script dependency.
4. Only then expand enrichment and UI sophistication.
