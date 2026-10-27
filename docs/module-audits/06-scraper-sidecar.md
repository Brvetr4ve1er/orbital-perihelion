# Scraper Sidecar Audit

Scope:

- `scraper/sidecar.py`
- `scraper/README.md`
- `scraper/docker-compose.yml`
- `scraper/searxng/settings.yml`

## Responsibility

The sidecar is the application’s local network-facing helper. It provides:

- health endpoint
- search endpoint
- scraping endpoint
- enrichment bundling
- multi-intent product enrichment pre-processing
- sqlite-backed cache

## What Is Solid

- The sidecar has clear endpoint separation.
- SearXNG plus fallback logic is practical for a local-first tool.
- There is basic URL safety screening for proxy use.
- Resource cleanup for persistent browser/crawler state is considered.
- Ranking and diversification of sources is a good step toward higher-quality enrichment context.

## Verified Issues

### 1. The sidecar is a substantial operational dependency

Observed behavior:

- many frontend AI features degrade or change meaning when the sidecar is unavailable
- the frontend can continue, but not with equivalent behavior

Why this matters:

- The app is not just "frontend + optional helper".
- In practice, enrichment quality and scraper-backed flows depend on a separate runtime service.

### 2. Proxy and scrape safety are basic, not deep

Observed behavior:

- `is_safe_url()` blocks obvious local/private targets
- the proxy still fetches arbitrary external URLs

Risk:

- The sidecar is acceptable for local use, but it is not hardened like a multi-user service.
- If this ever leaves localhost assumptions, the threat model changes sharply.

### 3. Cache and database lifecycle are simple

Observed behavior:

- sqlite cache is opened and closed per helper call
- cleanup is time-based and opportunistic

Risk:

- Probably fine for local use, but not ideal for higher request volume or long-running sessions.

### 4. Scrape waterfall increases complexity and failure ambiguity

The sidecar falls through:

- Crawl4AI
- plain HTTP + BeautifulSoup
- Playwright

This is pragmatic, but debugging extraction quality becomes harder because "success" can mean very different data fidelity.

## Likely Hidden Risks

### 1. Source quality drift

Search engines, retailer pages, and review sites change structure constantly. Even if the sidecar remains operational, enrichment quality may decay quietly over time.

### 2. Content truncation risk

The sidecar truncates markdown/text bundles. That is necessary, but it means extraction results are sensitive to ordering and clipping decisions.

### 3. Single-machine dependency risk

The stack assumes:

- local Python runtime
- browser access
- optional Playwright/Crawl4AI
- optional SearXNG

That makes reproducibility harder across machines unless setup automation is strong.

## Upgrade Directions

### Medium-weight upgrades

- Surface which scrape tier actually succeeded in the frontend.
- Add request diagnostics:
  chosen engine, fallback path, truncation counts, cache hits.
- Add per-source quality scoring and rejection reasons.
- Make cache maintenance more explicit and observable.

### Heavy upgrades

- Separate the sidecar into:
  search aggregation,
  scrape extraction,
  source ranking,
  cache service.
- Add structured scrape artifacts instead of mostly raw text bundles.
- Introduce reproducible setup scripts or containers for the whole sidecar stack.
- If future deployment goes beyond localhost, redesign security and SSRF posture from first principles.

## Recommended Priority

1. Surface scrape diagnostics to the frontend.
2. Tighten observability around fallback tiers and truncation.
3. Only then consider larger sidecar decomposition.
