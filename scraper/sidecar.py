"""
PKOS Scraper Sidecar — local-first, zero paid APIs.

Endpoints
  GET  /health                  — liveness
  POST /search   {query, max}   — SearXNG primary, DuckDuckGo HTML fallback
  POST /scrape   {url, mode}    — Crawl4AI primary, Playwright fallback
  POST /enrich   {query, urls?} — one-shot: search + scrape top N → markdown bundle
  POST /enrich-product {name, brand, sku, category, price} — full CPO v4.2 pipeline

Config via env:
  SEARXNG_URL       default http://localhost:8080
  CACHE_DB          default ./scraper/cache.sqlite
  CACHE_TTL_HOURS   default 168 (7d)
  MAX_CONCURRENCY   default 3
  PORT              default 5001
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Optional
from urllib.parse import quote_plus

import aiosqlite
import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

SEARXNG_URL = os.getenv("SEARXNG_URL", "http://localhost:8080")
CACHE_DB = os.getenv("CACHE_DB", os.path.join(os.path.dirname(__file__), "cache.sqlite"))
CACHE_TTL = int(os.getenv("CACHE_TTL_HOURS", "168")) * 3600
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "3"))
PORT = int(os.getenv("PORT", "5001"))

_sem = asyncio.Semaphore(MAX_CONCURRENCY)


# ── Cache ────────────────────────────────────────────────────────────────────

async def _db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(CACHE_DB)
    await db.execute(
        "CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT, ts INTEGER)"
    )
    await db.commit()
    return db


def _key(namespace: str, payload: str) -> str:
    return f"{namespace}:{hashlib.sha256(payload.encode()).hexdigest()[:32]}"


async def cache_get(k: str) -> Optional[dict]:
    db = await _db()
    try:
        async with db.execute("SELECT v, ts FROM cache WHERE k=?", (k,)) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        v, ts = row
        if time.time() - ts > CACHE_TTL:
            return None
        return json.loads(v)
    finally:
        await db.close()


async def cache_set(k: str, v: dict) -> None:
    db = await _db()
    try:
        await db.execute(
            "INSERT OR REPLACE INTO cache (k,v,ts) VALUES (?,?,?)",
            (k, json.dumps(v), int(time.time())),
        )
        await db.commit()
    finally:
        await db.close()


# ── Search: SearXNG → DuckDuckGo fallback ───────────────────────────────────

async def search_searxng(client: httpx.AsyncClient, query: str, max_results: int) -> list[dict]:
    try:
        r = await client.get(
            f"{SEARXNG_URL}/search",
            params={"q": query, "format": "json", "safesearch": 1},
            timeout=12.0,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        out = []
        for item in (data.get("results") or [])[:max_results]:
            out.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("content", ""),
                "engine": item.get("engine", "searxng"),
            })
        return out
    except Exception:
        return []


async def search_ddg(client: httpx.AsyncClient, query: str, max_results: int) -> list[dict]:
    try:
        r = await client.get(
            f"https://html.duckduckgo.com/html/?q={quote_plus(query)}",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=12.0,
        )
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        out = []
        for res in soup.select(".result")[:max_results]:
            a = res.select_one(".result__a")
            s = res.select_one(".result__snippet")
            if not a:
                continue
            href = a.get("href", "")
            if "uddg=" in href:
                from urllib.parse import parse_qs, unquote, urlparse
                qs = parse_qs(urlparse(href).query)
                href = unquote(qs.get("uddg", [href])[0])
            out.append({
                "title": a.get_text(strip=True),
                "url": href,
                "snippet": s.get_text(strip=True) if s else "",
                "engine": "duckduckgo_html",
            })
        return out
    except Exception:
        return []


async def _do_search(query: str, max_results: int = 8) -> tuple[list[dict], str]:
    """Run SearXNG → DDG fallback, return (results, source_name)."""
    async with httpx.AsyncClient() as client:
        results = await search_searxng(client, query, max_results)
        if results:
            return results, "searxng"
        results = await search_ddg(client, query, max_results)
        return results, "duckduckgo"


# ── Scrape: Crawl4AI → httpx → Playwright fallback ──────────────────────────

_crawler = None

async def get_crawler():
    global _crawler
    if _crawler is None:
        try:
            from crawl4ai import AsyncWebCrawler  # lazy import
            _crawler = AsyncWebCrawler(verbose=False)
            await _crawler.__aenter__()
        except Exception as e:
            print(f"[scraper] Crawl4AI unavailable: {e}")
            _crawler = False
    return _crawler or None


async def scrape_crawl4ai(url: str) -> Optional[dict]:
    crawler = await get_crawler()
    if not crawler:
        return None
    try:
        async with _sem:
            result = await crawler.arun(url=url, bypass_cache=False, word_count_threshold=10)
        if not result or not getattr(result, "success", False):
            return None
        return {
            "url": url,
            "title": getattr(result, "metadata", {}).get("title", ""),
            "markdown": (result.markdown or "")[:20000],
            "text": (getattr(result, "cleaned_html", "") or "")[:20000],
            "images": [img.get("src") for img in (result.media or {}).get("images", [])[:10]],
            "engine": "crawl4ai",
        }
    except Exception as e:
        print(f"[scraper] crawl4ai failed for {url}: {e}")
        return None


async def scrape_httpx(url: str) -> Optional[dict]:
    """Lightweight last resort: plain HTTP + BS4."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
            if r.status_code >= 400:
                return None
            soup = BeautifulSoup(r.text, "html.parser")
            for t in soup(["script", "style", "noscript"]):
                t.decompose()
            title = (soup.title.get_text(strip=True) if soup.title else "")
            text = soup.get_text("\n", strip=True)
            images = [img.get("src") for img in soup.select("img[src]")[:10]]
            return {
                "url": url,
                "title": title,
                "markdown": "",
                "text": text[:20000],
                "images": images,
                "engine": "httpx",
            }
    except Exception:
        return None


# ── Persistent Playwright browser ────────────────────────────────────────────
# Instead of launching a new Chromium per request (expensive!), we keep a
# single browser alive for the lifetime of the sidecar process and only
# create isolated contexts per request.

_pw_instance = None  # playwright instance
_pw_browser = None   # persistent browser


async def _get_playwright_browser():
    """Lazy-init a persistent Chromium browser. Returns (browser, pw_instance) or (None, None)."""
    global _pw_instance, _pw_browser
    if _pw_browser is not None:
        return _pw_browser
    try:
        from playwright.async_api import async_playwright
        _pw_instance = await async_playwright().start()
        _pw_browser = await _pw_instance.chromium.launch(headless=True)
        print("[scraper] Persistent Playwright browser launched")
        return _pw_browser
    except Exception as e:
        print(f"[scraper] Playwright unavailable: {e}")
        _pw_browser = False  # sentinel: don't retry
        return None


async def _close_playwright():
    """Clean shutdown of the persistent browser + playwright instance."""
    global _pw_browser, _pw_instance
    if _pw_browser and _pw_browser is not False:
        try:
            await _pw_browser.close()
        except Exception:
            pass
    if _pw_instance:
        try:
            await _pw_instance.stop()
        except Exception:
            pass
    _pw_browser = None
    _pw_instance = None


async def scrape_playwright(url: str) -> Optional[dict]:
    browser = await _get_playwright_browser()
    if not browser:
        return None
    try:
        async with _sem:
            ctx = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            page = await ctx.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                title = await page.title()
                html = await page.content()
            finally:
                await ctx.close()  # always clean up the context
        soup = BeautifulSoup(html, "html.parser")
        for t in soup(["script", "style", "noscript"]):
            t.decompose()
        text = soup.get_text("\n", strip=True)
        images = [img.get("src") for img in soup.select("img[src]")[:10]]
        return {
            "url": url,
            "title": title,
            "markdown": "",
            "text": text[:20000],
            "images": images,
            "engine": "playwright",
        }
    except Exception as e:
        print(f"[scraper] playwright failed for {url}: {e}")
        return None


async def _do_scrape(url: str, mode: str = "auto") -> Optional[dict]:
    """Waterfall scrape: crawl4ai → httpx → playwright."""
    result = None
    if mode in ("auto", "crawl4ai"):
        result = await scrape_crawl4ai(url)
    if not result and mode in ("auto", "httpx"):
        result = await scrape_httpx(url)
    if not result and mode in ("auto", "playwright"):
        result = await scrape_playwright(url)
    return result


# ── Domain Ranking ───────────────────────────────────────────────────────────

# Classifies URLs by intent for smarter source selection
DOMAIN_TIERS = {
    "official": ["samsung.com", "lg.com", "hisense.com", "midea.com", "tcl.com",
                 "condor.dz", "iris.dz", "geant-electronics.com", "brandt.dz"],
    "retailer": ["ouedkniss.com", "jumia.dz", "amazon.fr", "amazon.com",
                 "boulanger.com", "darty.com", "cdiscount.com", "fnac.com",
                 "mediamarkt.com", "electroplanet.ma"],
    "review":   ["lesnumeriques.com", "01net.com", "techradar.com", "rtings.com",
                 "tomsguide.fr", "frandroid.com", "gsmarena.com", "reddit.com",
                 "trustpilot.com", "quechoisir.org"],
}

def classify_url(url: str) -> str:
    """Return 'official', 'retailer', 'review', or 'general'."""
    url_lower = url.lower()
    for tier, domains in DOMAIN_TIERS.items():
        for d in domains:
            if d in url_lower:
                return tier
    return "general"


def rank_and_diversify(results: list[dict], max_total: int = 6) -> list[dict]:
    """Select a diverse set of URLs covering official, retailer, and review sources."""
    buckets: dict[str, list] = {"official": [], "retailer": [], "review": [], "general": []}
    seen_domains = set()

    for r in results:
        url = r.get("url", "")
        domain = url.split("//")[-1].split("/")[0].lower() if "//" in url else ""
        if domain in seen_domains:
            continue
        seen_domains.add(domain)
        tier = classify_url(url)
        buckets[tier].append(r)

    # Priority: 1 official + 2 retailers + 2 reviews + fill general
    selected = []
    for tier, quota in [("official", 1), ("retailer", 2), ("review", 2), ("general", 2)]:
        selected.extend(buckets[tier][:quota])
        if len(selected) >= max_total:
            break

    return selected[:max_total]


# ── API Models ───────────────────────────────────────────────────────────────

class SearchReq(BaseModel):
    query: str
    max: int = 8

class ScrapeReq(BaseModel):
    url: str
    mode: str = Field(default="auto", description="auto|crawl4ai|playwright|httpx")

class EnrichReq(BaseModel):
    query: str
    urls: Optional[list[str]] = None
    max_sources: int = 5

class ProductEnrichReq(BaseModel):
    """Full CPO v4.2 enrichment request for a single product."""
    name: str
    brand: str = ""
    sku: str = ""
    category: str = ""
    price: float = 0
    max_sources: int = 6


# ── FastAPI App ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Clean shutdown of persistent resources
    global _crawler
    if _crawler and _crawler is not False:
        try:
            await _crawler.__aexit__(None, None, None)
        except Exception:
            pass
    await _close_playwright()


app = FastAPI(title="PKOS Scraper Sidecar v2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/health")
async def health():
    return {"ok": True, "version": "2.0", "searxng": SEARXNG_URL, "cache_ttl_s": CACHE_TTL}


@app.get("/proxy")
async def proxy(url: str):
    """Simple GET proxy for CORS bypass (e.g. DDG fallback)."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            return resp.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Proxy failed: {str(e)}")


@app.post("/search")
async def search(req: SearchReq):
    k = _key("search", f"{req.query}:{req.max}")
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    results, source = await _do_search(req.query, req.max)
    payload = {"query": req.query, "source": source, "results": results}
    await cache_set(k, payload)
    return {**payload, "cached": False}


@app.post("/scrape")
async def scrape(req: ScrapeReq):
    k = _key("scrape", f"{req.mode}:{req.url}")
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    result = await _do_scrape(req.url, req.mode)
    if not result:
        raise HTTPException(status_code=502, detail=f"All scrape tiers failed for {req.url}")

    await cache_set(k, result)
    return {**result, "cached": False}


@app.post("/enrich")
async def enrich(req: EnrichReq):
    """One-shot: search + scrape top-N → consolidated markdown bundle for LLM."""
    k = _key("enrich", f"{req.query}:{req.max_sources}:{','.join(req.urls or [])}")
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    # Step 1: search if URLs not provided
    links: list[dict] = []
    if req.urls:
        links = [{"title": "", "url": u, "snippet": ""} for u in req.urls]
    else:
        s = await search(SearchReq(query=req.query, max=req.max_sources * 2))
        links = s["results"][: req.max_sources]

    # Step 2: scrape in parallel (bounded by semaphore)
    async def _one(link):
        try:
            res = await scrape(ScrapeReq(url=link["url"], mode="auto"))
            return {**link, "markdown": res.get("markdown") or res.get("text", ""), "images": res.get("images", [])}
        except Exception as e:
            return {**link, "error": str(e)}

    scraped = await asyncio.gather(*(_one(l) for l in links[: req.max_sources]))
    scraped = [s for s in scraped if s.get("markdown")]

    # Build a single LLM-ready bundle (truncated)
    bundle_parts = []
    for s in scraped:
        bundle_parts.append(f"## {s.get('title') or s['url']}\nURL: {s['url']}\n\n{s['markdown'][:2500]}\n")
    bundle = "\n---\n".join(bundle_parts)[:14000]

    # Collect unique images from all scrapes
    all_images: list[str] = []
    for s in scraped:
        for img in s.get("images", []):
            if img and img not in all_images:
                all_images.append(img)

    payload = {
        "query": req.query,
        "sources": [{"title": s.get("title"), "url": s["url"], "snippet": s.get("snippet", "")} for s in scraped],
        "markdown_bundle": bundle,
        "images": all_images[:15],
    }
    await cache_set(k, payload)
    return {**payload, "cached": False}


@app.post("/enrich-product")
async def enrich_product(req: ProductEnrichReq):
    """
    Full CPO v4.2 product enrichment pipeline.
    
    1. Builds 3 intent-specific search queries (commercial, technical, sentiment).
    2. Merges + deduplicates results, then ranks them by domain authority.
    3. Scrapes the top N diverse sources.
    4. Returns a structured markdown bundle + classified source metadata
       ready for the frontend LLM to extract the full schema.
    """
    cache_id = f"{req.name}:{req.brand}:{req.sku}"
    k = _key("enrich_product", cache_id)
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    # ── Build multi-intent search queries ──
    base = " ".join(filter(None, [req.brand, req.name, req.sku])).strip()

    queries = {
        "commercial": f"{base} prix fiche technique {req.category}",
        "technical":  f"{base} specifications caractéristiques officielles",
        "sentiment":  f"{base} avis test review pros cons",
    }

    # ── Execute all searches concurrently ──
    async def _search_one(intent: str, q: str):
        results, source = await _do_search(q, max_results=8)
        return intent, results, source

    search_tasks = [_search_one(intent, q) for intent, q in queries.items()]
    search_results = await asyncio.gather(*search_tasks)

    # Merge all results
    all_results = []
    search_meta = {}
    for intent, results, source in search_results:
        search_meta[intent] = {"source": source, "count": len(results)}
        for r in results:
            r["intent"] = intent
            all_results.append(r)

    # Rank & diversify
    selected = rank_and_diversify(all_results, max_total=req.max_sources)

    # ── Scrape selected URLs concurrently ──
    async def _scrape_one(link: dict):
        try:
            result = await _do_scrape(link["url"], "auto")
            if not result:
                return None
            return {
                **link,
                "markdown": (result.get("markdown") or result.get("text", ""))[:3000],
                "images": result.get("images", []),
                "page_title": result.get("title", ""),
                "engine": result.get("engine", "unknown"),
                "domain_type": classify_url(link["url"]),
            }
        except Exception as e:
            print(f"[enrich-product] Scrape failed for {link.get('url')}: {e}")
            return None

    scraped = await asyncio.gather(*(_scrape_one(s) for s in selected))
    scraped = [s for s in scraped if s]

    # ── Build LLM-ready markdown bundle ──
    bundle_parts = []
    for s in scraped:
        label = f"[{s['domain_type'].upper()}] {s.get('page_title') or s['url']}"
        bundle_parts.append(f"## {label}\nURL: {s['url']}\nIntent: {s.get('intent', 'general')}\n\n{s['markdown']}\n")
    markdown_bundle = "\n---\n".join(bundle_parts)[:16000]

    # Collect images
    all_images = []
    for s in scraped:
        for img in s.get("images", []):
            if img and img not in all_images and not img.startswith("data:"):
                all_images.append(img)

    # Build source metadata
    sources_meta = []
    for s in scraped:
        domain = s["url"].split("//")[-1].split("/")[0] if "//" in s["url"] else ""
        sources_meta.append({
            "title": s.get("page_title") or s.get("title", ""),
            "url": s["url"],
            "snippet": s.get("snippet", "")[:200],
            "domain": domain,
            "type": s["domain_type"],
            "intent": s.get("intent", "general"),
            "engine": s.get("engine", "unknown"),
        })

    payload = {
        "product": {"name": req.name, "brand": req.brand, "sku": req.sku, "category": req.category, "price": req.price},
        "search_meta": search_meta,
        "sources": sources_meta,
        "markdown_bundle": markdown_bundle,
        "images": all_images[:20],
        "source_count": len(scraped),
        "total_search_results": len(all_results),
    }
    await cache_set(k, payload)
    return {**payload, "cached": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("sidecar:app", host="127.0.0.1", port=PORT, reload=False)
