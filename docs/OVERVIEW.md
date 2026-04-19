# Project Overview: PRODUCT INTEL ENGINE (PKOS)

The **PRODUCT INTEL ENGINE** (also known as PKOS - Product Knowledge Operating System) is an advanced tool designed for the consumer electronics market to transform raw, messy inventory CSV data into structured, enriched, and searchable commercial intelligence.

## Core Mission
- **Normalize Inventory**: Parse Universal CSVs and clean up inconsistent product nomenclature.
- **Fact Consensus & Validation**: Harden incoming data making sure crucial margins and missing properties are flagged.
- **Enrich Data**: Use a combination of Rule-based logic (Regex), Local/Online LLMs (LM Studio + DeepSeek), and Web Scraping to extract specifications, categories, and real-time competitor prices.
- **Long-Term Utility**: Build a reliable local engine storing gigabytes of intelligence cleanly inside the browser.

## High-Level Architecture (React / TS)
The project runs entirely in the local browser via an advanced React 19 architecture:

1. **Intelligence Engine (Frontend Pipeline)**:
    - `UniversalCSVParser`: Handles any delimiter, encoding, or header formats.
    - `EnrichmentService`: Rule-based matching and exact category/brand normalization.
    - `ProductValidator`: Validates the `CPO v4.1` (Canonical Product Object) schema, generating Missing Price/Brand alerts.
    - `Web Worker Pipeline`: Entire ingestion and enrichment computation is offloaded to a background thread (`import.worker.ts`) to keep the UI perfectly fluid.

2. **Backend API Proxies via Vite**:
    - `Vite Proxy (/api/llm)`: Relays LLM requests safely bypassing CORS to a local **LM Studio** endpoint.
    - `Vite Proxy (/api/proxy)`: Relays DuckDuckGo scraping demands to a basic local Python scraper backend.

3. **Storage & State (Immutability)**:
    - **Active Memory**: A standalone Observable Store acts as the single source of truth for the Product Intelligence Dashboard.
    - **IndexedDB (`idb`)**: Fast, persistent storage bypassing localStorage limits, keeping up to gigabytes of catalog data intact between reboots.

## Feature Stack
- **Graph Visualization System**: A D3-powered interactive interface to explore relationships between products, brands, and categories. Supports Level-of-Detail (LOD) rendering and persistent node positioning.
- **Batch Enrichment Queue**: A sequential background job scheduler for processing entire inventories through LLM enrichment, providing real-time progress, ETA, and job status tracking.
- **LLM Interactive Config**: An explicit UI to swap between Local and Online Language Models entirely in-browser.
- **Interactive Metrics**: Margin evaluations, total stock values, and live data validation toasts.

## Tech Stack
- **Core Framework**: React 19, TypeScript
- **State Management**: Zero-dependency observable store pattern
- **Styling**: Vanilla CSS (Fluid Glassmorphism & Custom Tokens)
- **AI Backend Connectors**: LM Studio (`/api/llm`) & DuckDuckGo proxy API
- **Build Tool**: Vite 7
- **Database**: IndexedDB (`idb` wrapper)
