# PKOS — Handoff Plan for Antigravity / Sonnet 4.6

Delegatable work units. Each is self-contained with file paths, contracts, and acceptance criteria. Build before delegating: `npx vite build` (currently green as of 2026-04-19).

## Context (already shipped this session)

- **Scraper sidecar** (`scraper/sidecar.py`) — FastAPI on `:5001`. Endpoints: `/search`, `/scrape`, `/enrich`, `/health`. SearXNG (tier-1) → DDG HTML (fallback). Crawl4AI (tier-1) → httpx+BS4 → Playwright. SQLite cache 7d.
- **Vite proxy** routes `/api/search`, `/api/scrape`, `/api/enrich-web` → `:5001`.
- **TS client** `src/services/scraper.ts` — graceful fallback when sidecar offline.
- **LLM enrichment** (`src/services/llm.ts`) — now prefers sidecar `enrichWeb()` for richer markdown context; falls back to legacy DDG-via-proxy. Writes `enrichment.images` + `enrichment.sources` back onto Product.
- **Schema** (`src/core/schema.ts`) — extended `enrichment` with `seoDescription`, `sources[]`.
- **ProductCard** (`src/ui/components/ProductCard.tsx`) — liquid-glass surface (backdrop-filter + sheen + glow), Framer Motion hover/slide/verdict-expand, AOS staggered reveal (via `index` prop from Dashboard), gallery carousel over `visual.heroImage + visual.gallery + enrichment.images`, market intel strip (cheapest competitor + delta %), price position pill (budget/midrange/premium), marketing hook line, pros/cons verdict drawer. Consumes `settings.cardLayout` toggles and `settings.locale.{currency,language}`.
- **AOS globally init'd** in `src/main.tsx` with reduced-motion guard.
- **Deps added**: `framer-motion`, `aos`, `@types/aos`.

## ✅ Unit 1 — Compare view (side-by-side, 2–4 products)

**File to create**: `src/ui/features/dashboard/CompareView.tsx`
**Entry point**: add `'compare'` to the `ViewMode` union in `Dashboard.tsx:~20` and push a new tab `{ id: 'compare', label: 'Compare', icon: '⚖︎' }`.

**State model** (in `Dashboard.tsx` or lift to store):
```ts
const [compareIds, setCompareIds] = useState<string[]>([]);  // max 4
```
Extend `ProductCard` with a second "Add to compare" mini-button (appears on hover, top-right of image). Don't reuse onClick — stop propagation.

**Layout**: CSS grid, `grid-template-columns: repeat(var(--n), minmax(240px, 1fr))`. Sticky left column = row labels (Image / Brand / Model / Price / Price position / Stock / Key specs / Pros / Cons / Market price / Source count).

**Diff highlighting**: for each row, compute the set of distinct values across selected products. If more than one distinct value, add class `.cmp-diff`. For numeric rows (price, stock), color the min green and max red. Helper:
```ts
function highlightNumeric(values: number[]): ('min'|'max'|'mid'|'na')[] { ... }
```

**Empty / not-enough state**: if `compareIds.length < 2`, render an empty state telling user to pick products from the grid (with a "Pick 2–4 products" CTA that switches to grid view).

**Acceptance**:
- Toggle a product in, toggle another in, switch to Compare → rows render with diff highlight.
- Remove-all button clears `compareIds`.
- `npx vite build` passes.

---

## ✅ Unit 2 — Table view (dense virtualized spreadsheet)

**File to create**: `src/ui/features/dashboard/TableView.tsx`
**Entry point**: add `'table'` to the `ViewMode` union, tab `{ id: 'table', label: 'Table', icon: '▤' }`.

**Columns** (configurable via `settings.cardLayout` — add a new `tableColumns: Record<string, boolean>` section to `services/settings.ts`):
- `image` (24px thumb) | `name` | `brand` | `category` | `sku` | `price` | `stock` | `margin` | `pricePosition` | `competitors (count)` | `enriched (✓/✗)`

**Virtualization**: install `@tanstack/react-virtual` or hand-roll. With ~10k rows the DOM cost matters. Contract:
```ts
const rowHeight = 44;
const visible = useVirtualizer({ count: products.length, estimateSize: () => 44, overscan: 8 });
```

**Sort / filter**: reuse `FilterBar` state already in Dashboard for filtering. Sort: click header → toggle asc/desc → `useMemo` sorted array. Default sort: `commercial.priceRange.typical desc`.

**Row click**: `setSelectedProduct(p)` (opens existing `ProductIntelligenceUI` modal — already wired).

**Acceptance**:
- Renders 10k products in under 200ms (use the imported CSV; if large CSVs aren't at hand, replicate in dev: `Array.from({length:10000}, ...)`).
- Sort/filter respond without jank (stay at 60fps while scrolling).
- `npx vite build` passes.

---

## ✅ Unit 3 — Search index caching (P2-5 from ACTIVE_ISSUES)

**Current state**: `ProductSchema._searchIndex` exists as `z.string().optional()` but nothing writes it; FilterBar builds an index on every keystroke.

**Grep**: `src/ui/components/FilterBar.tsx` and `src/services/projection.ts` for wherever the index is currently rebuilt.

**Plan**:
1. Add a builder helper in `src/core/search-index.ts`:
   ```ts
   export function buildSearchIndex(p: Product): string {
       return [
           p.identity.name,
           p.identity.brand,
           p.identity.model,
           p.identity.sku,
           p.identity.category,
           (p.enrichment?.seoDescription || ''),
           Object.values(p.consensus || {}).map(v => String(v.v)).join(' '),
       ].join(' ').toLowerCase();
   }
   ```
2. Call it:
   - In `ProductAdapter.normalize(...)` right before returning (freshly-imported products).
   - In `EnrichmentQueue._processNext` after merging LLM result into `updated` (so enrichment data is searchable).
3. Change FilterBar to read `p._searchIndex` when present; build lazily when absent (legacy products from older IDB snapshots).
4. Persistence (`src/services/persistence.ts`) — no change needed; `_searchIndex` is already on the schema and will round-trip.

**Acceptance**:
- Typing in the search box on a 5k-product catalog: stays responsive (< 50ms per keystroke).
- Newly enriched products become findable via their enriched description.
- `npx vite build` passes.

---

## Unit 4 (stretch) — Wire `settings.cardLayout.*` coverage audit

The ProductCard already reads `cardLayout.{showImage, showPrice, showStock, showMarketIntel, showMarketing, showAIVerdict}`. Check that `SettingsPanel.tsx` actually exposes toggles for all of them and that `ProductIntelligenceUI` (the detail modal) respects them too. If a setting exists without a UI toggle, add the toggle; if it's exposed but not consumed anywhere, either consume it or delete it.

---

## Developer runbook (for the delegate agent)

```bash
# Build check (run after every unit)
cd orbital-perihelion
npx vite build

# Dev server (manual UI verification)
npm run dev                     # Vite on :5173 (opens /graph.html by default)

# Scraper sidecar (for enrichment testing)
cd scraper
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
docker compose up -d searxng    # optional, tier-1 search
python sidecar.py               # :5001
```

## Known outstanding issues (not in scope for this handoff)

- d3-selection drag import warning at `src/graph/renderer/svg-renderer.ts:346` — pre-existing, not regression.
- Main bundle 805 kB (234 kB gzip) — d3 + tambo + framer-motion. Code-splitting is a separate task.
- `LLMConnector` maintains its own URL/model/key in localStorage (keys `pkos_llm_*`) separate from `settings.llm`. Future: consolidate into `settingsStore`.
- Browser-use not wired (tier-4 interactive). Add only when a concrete login/wizard target surfaces.

## Files touched this session (reference for merge conflicts)

```
scraper/requirements.txt            [new]
scraper/sidecar.py                  [new]
scraper/docker-compose.yml          [new]
scraper/searxng/settings.yml        [new]
scraper/README.md                   [new]
vite.config.js                      [edited: proxy routes]
src/services/scraper.ts             [new]
src/services/llm.ts                 [edited: sidecar-first enrichment]
src/services/enrichment-queue.ts    [edited: merge images + sources]
src/core/schema.ts                  [edited: enrichment.seoDescription + sources]
src/ui/components/ProductCard.tsx   [rewrite: liquid glass + motion]
src/ui/features/dashboard/Dashboard.tsx  [edited: pass index to card]
src/main.tsx                        [edited: AOS init]
src/index.css                       [appended: pc-glass styles]
package.json                        [+framer-motion +aos +@types/aos]
```
