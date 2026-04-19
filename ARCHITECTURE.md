# PKOS (Product Knowledge Operating System) - Architecture & Feature Set

## Overview
PKOS (Project: Orbital Perihelion) is a local inventory intelligence dashboard designed to ingest, normalize, enrich, and visualize product inventory data. It transforms raw, highly variable CSV inventory exports into a rich, interactive, and highly responsive React-based intelligence interface.

## Core Constraints & Goals
- **Scale:** Optimized for standard local inventories (≤200 products) to ensure instantaneous interactions without the overhead of a distributed backend.
- **Environment:** Runs purely on a local server/browser using Vite, leaning on the client-side for heavy lifting and maintaining a highly responsive UI.
- **Architecture Philosophy:** Strict separation of core logic (parsing, enrichment, state) from UI rendering, built on a unified canonical data model ensuring modularity and maintainability.

---

## 🏗️ Canonical Schema: Fact-Level Architecture (CPO v4.0)

The entire application centers around the **Canonical Product Object (CPO v4.0)** (`src/core/schema.ts`), which defines the structural shape of all inventory items.

- **Multi-Observation Storage:** Instead of single static values, the schema supports storing multiple *observations* for the same attribute (e.g., price, stock) from different sources (import, scraping, inference).
- **Consensus Aggregation:** The engine resolves conflicting data from multiple sources (or observations) into a single, computed consensus view based on source trust levels and timestamps.
- **Rich Categorization:** Each product contains deep sub-categories encompassing visual assets, technical specs, commercial data (margins, wholesale pricing), strategic roles, and marketing angles.

---

## ⚙️ System Modules & Data Flow

### 1. Data Ingestion & Normalization (`src/core/`)
- **Unified Parser (`Parser`):** Automatically detects the incoming CSV format and routes it to the specific parser.
- **Format Parsers:** `InventoryParser` and `PKOSCsvParser` handle unstructured or semi-structured rows and extract base information.
- **Product Adapter (`ProductAdapter`):** Normalizes disparate object formats into the strict CPO v4.0 interface, ensuring the rest of the application never deals with malformed data.

### 2. State Management (`src/state/`)
- **Centralized Store (`inventoryStore`):** A lightweight observer-pattern store maintaining the single source of truth for the application. It holds raw product arrays, current search queries, active UI filters, and loading/error states. 
- **Persistence:** Automatically syncs with `localStorage` to persist sessions between reloads. It intelligently detects outdated schema versions and clears cached data to prevent runtime crashes.

### 3. Intelligence & Enrichment Layer (`src/services/` & `src/core/engine.ts`)
- **Core Engine:** Handles high-performance filtering, flat-string search index generation (for hyper-fast querying), and dashboard statistics calculations (total retail value, capital immobilized, margins, stock status).
- **Enrichment Service (`EnrichmentService`):** Applies predefined dictionaries, regular expressions, and heuristic-based rules to detect brands, classify categories, and extract technical specifications (like screen size or resolution) from unstructured text strings.
- **Scraper / Simulation Service (`ScraperEngine`):** Proves out the agentic workflow by simulating data-gathering operations (finding competitor prices or deep-dive technical specs) to populate the "thickness" of product knowledge.
- **Projection Layer:** Transforms complex CPO formats into simplified UI-ready object shapes when bridging between deep data structures and standard React components.

---

## 💻 Adaptive UI Layer (`src/ui/`)

Built entirely in **React** (migrated from Vanilla JS), utilizing a modular, feature-based folder structure.

### Key Features & Components:

#### 1. Zero-Friction Setup (`App.tsx`)
- Drag-and-drop or file-picker CSV import directly on the home screen.
- Auto-loads previous session data if available.

#### 2. KPI Dashboard Strip (`KPIStrip.tsx`)
Real-time calculation headers displaying:
- **Valeur Stock:** Total Retail Value of inventory.
- **Capital Immobilisé:** Total Cost.
- **Marge Moyenne:** Average Profit Margin across products.
- **Santé Stock:** Visual Health Bar depicting the ratio of Normal / Low / Out-of-Stock items.

#### 3. High-Speed Filter & Search (`FilterBar.tsx`)
- Instantaneous client-side filtering by textual search.
- Dynamically generated top Categories, Brands, and Stock Health pills based on the current active inventory.

#### 4. Adaptive View Modes (`Dashboard.tsx`)
The dashboard implements a modular view-switching architecture supporting multiple analytical models:
- **Grid View (`ProductCard.tsx`):** Highly visual, high-performance glassmorphic cards. Displays primary visual, brand, sku, commercial data, and a peek intelligence insight.
- **Table View (`TableView.tsx`):** Virtualized high-density spreadsheet view via `@tanstack/react-virtual`, supporting 10,000+ rows instantly.
- **Compare View (`CompareView.tsx`):** Deep analytical comparison of up to 4 selected items with cross-reference diff highlighting (e.g. green for lowest price, red for highest).
- **Graph & Tree Views (`GraphView.tsx`):** Deterministic multi-layer D3 node simulation for brand/category exploration.

#### 5. Adaptive Intelligence UI (`ProductIntelligenceUI.tsx`)
Powered by the flexible Tambo AI concept components.
- Clicking a product card opens a modal that structurally adapts its rendering based on the **thickness** (completeness) of the product's data profile (Level 0 Minimal to Level 3 Quantum).
- **Dynamic Blocks:**
  - **SpecsBlock:** Renders cleanly formatted technical specifications.
  - **InsightsBlock:** Displays analytical deductions like Pros/Cons and "Buyer Fit" verdicts.
  - **PricingBlock:** Tracks live competitor pricing, calculating the exact percentage diff against the base retail price.
- **Empty State Fallbacks:** If data is "thin", it gracefully degrades to offer an action button to "Lancer Scan Agentique" to kick off the enrichment process.
