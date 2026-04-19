# ⚡ PKOS — Product Knowledge Operating System

> **Orbital Perihelion Edition**: A high-performance commercial intelligence engine for electronics inventory management and market positioning.

PKOS is a state-of-the-art dashboard designed to transform raw inventory data into actionable commercial intelligence. By leveraging local LLMs, format-agnostic CSV parsing, and real-time market search, PKOS provides a comprehensive view of your product landscape.

---

## 🚀 Key Features

### 🧠 Intelligent Enrichment Engine
*   **Local LLM Integration**: Connects to LM Studio via an OpenAI-compatible API to analyze products and extract competitor prices and specs.
*   **Web Scraping**: Routes searches through a DuckDuckGo HTML proxy to feed real-time pricing and feature information into the context window.
*   **Universal Ingestion**: Support for any CSV dialect, automatically matching French and English column headers to the canonical schema.

### 📊 Commercial Intelligence
*   **Margin Analysis**: Real-time margin calculation and profitability tracking from cost and retail prices.
*   **Stock Health Tracking**: Normalization of CSV stock status columns directly onto the product cards.
*   **AI Insights**: Auto-generated pros, cons, and buyer-fit profiles from the LLM based on scrape data.

### 💨 High Performance UI
*   **React 19 & TypeScript**: Strongly typed modern architecture.
*   **Immutability**: Global state handled cleanly through an observable store.
*   **Vite-Powered**: Ultra-fast HMR and optimized production builds.

---

## 🛠️ Technology Stack

- **Core Framework**: React 19, TypeScript
- **State Management**: Zero-dependency observable store paradigm
- **Styling**: Vanilla CSS (Glassmorphism & Custom Tokens)
- **AI Backend**: LM Studio (Local LLM via `/api/llm`), Python Web Proxy (via `/api/proxy`)
- **Build Tool**: Vite 7

---

## 🏁 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- LM Studio running locally with a model loaded (e.g. `deepseek-r1`) listening on port `1234`.
- The PKOS Python Proxy server running locally on port `5000`.

### Configuration
Optionally configure your `.env`:
```
VITE_LLM_URL=/api/llm
VITE_LLM_MODEL=deepseek/deepseek-r1-0528-qwen3-8b
```

### Installation
1. Install the required dependencies:
   ```powershell
   npm install
   ```

2. Launch in development mode:
   ```powershell
   npm run dev
   ```

### Production Build
To generate a production-ready bundle:
```powershell
npm run build
```

---

## 📂 Project Structure

```text
orbital-perihelion/
├── src/
│   ├── core/           # Schema, Parsers, Engine, Validators
│   ├── services/       # LLM integration, Rule-based enrichment, Curated DB
│   ├── state/          # Global application store
│   └── ui/             # React Component Tree
├── docs/               # Architecture docs, handoff logs, issue tracker
├── index.html          # Main application entry point
├── vite.config.js      # Build & proxy configuration
```

---

*Built with precision for the modern commerce era.*
