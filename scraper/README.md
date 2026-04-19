# PKOS Scraper Sidecar

Local, zero-API-cost scraping pipeline. FastAPI + Crawl4AI + SearXNG + Playwright.

## Tier strategy

| Tier | Tool | Use for |
|------|------|---------|
| 1 (search) | SearXNG (self-hosted) | Meta-search across Google/Bing/DDG/Brave/Wiki |
| 1 (search fallback) | DuckDuckGo HTML | If SearXNG container isn't running |
| 1 (scrape) | Crawl4AI | LLM-ready markdown, cached, async |
| 2 (scrape) | httpx+BS4 | Static pages, cheapest |
| 3 (scrape) | Playwright | JS-heavy pages only |
| 4 (interactive) | Browser-use | Login/forms/wizards — NOT YET WIRED |

## Setup (one-time)

```bash
cd scraper
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
python -m playwright install chromium
```

## Run

```bash
# 1. SearXNG (optional but recommended — tier-1 search)
docker compose up -d searxng

# 2. Sidecar
python sidecar.py
# Listening on http://127.0.0.1:5001
```

The Vite dev server proxies `/api/scrape` and `/api/search` to `:5001`.

## Endpoints

- `POST /search   {query, max}`            → search results
- `POST /scrape   {url, mode}`             → single page scrape
- `POST /enrich   {query, urls?, max_sources}` → one-shot bundle for LLM
- `GET  /health`                            → liveness

## Cache

SQLite (`scraper/cache.sqlite`). Default TTL 7 days. Override with `CACHE_TTL_HOURS`.

## Env vars

- `SEARXNG_URL` — default `http://localhost:8080`
- `CACHE_DB` — default `./scraper/cache.sqlite`
- `CACHE_TTL_HOURS` — default `168`
- `MAX_CONCURRENCY` — default `3`
- `PORT` — default `5001`
