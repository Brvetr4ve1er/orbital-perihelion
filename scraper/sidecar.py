"""
PKOS Scraper Sidecar — local-first, zero paid APIs.

Endpoints
  GET  /health                  — liveness
  POST /search   {query, max}   — SearXNG primary, DuckDuckGo HTML fallback
  POST /scrape   {url, mode}    — Crawl4AI primary, Playwright fallback
  POST /enrich   {query, urls?} — one-shot: search + scrape top N → markdown bundle
  POST /interactive {url, task} — Browser-use (reserved; narrow use)

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
            headers={"User-Agent": "Mozilla/5.0 (PKOS/1.0)"},
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


# ── Scrape: Crawl4AI → Playwright fallback ──────────────────────────────────

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


async def scrape_playwright(url: str) -> Optional[dict]:
    try:
        from playwright.async_api import async_playwright
    except Exception:
        return None
    try:
        async with _sem, async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(user_agent="Mozilla/5.0 (PKOS/1.0)")
            page = await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            title = await page.title()
            html = await page.content()
            await browser.close()
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


async def scrape_httpx(url: str) -> Optional[dict]:
    """Tier-4 last resort: plain HTTP + BS4. Cheap for static pages."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (PKOS/1.0)"})
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


# ── API ──────────────────────────────────────────────────────────────────────

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    global _crawler
    if _crawler and _crawler is not False:
        try:
            await _crawler.__aexit__(None, None, None)
        except Exception:
            pass


app = FastAPI(title="PKOS Scraper Sidecar", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True, "searxng": SEARXNG_URL, "cache_ttl_s": CACHE_TTL}


@app.post("/search")
async def search(req: SearchReq):
    k = _key("search", f"{req.query}:{req.max}")
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    async with httpx.AsyncClient() as client:
        results = await search_searxng(client, req.query, req.max)
        source = "searxng"
        if not results:
            results = await search_ddg(client, req.query, req.max)
            source = "duckduckgo"

    payload = {"query": req.query, "source": source, "results": results}
    await cache_set(k, payload)
    return {**payload, "cached": False}


@app.post("/scrape")
async def scrape(req: ScrapeReq):
    k = _key("scrape", f"{req.mode}:{req.url}")
    cached = await cache_get(k)
    if cached:
        return {**cached, "cached": True}

    result = None
    if req.mode in ("auto", "crawl4ai"):
        result = await scrape_crawl4ai(req.url)
    if not result and req.mode in ("auto", "httpx"):
        result = await scrape_httpx(req.url)
    if not result and req.mode in ("auto", "playwright"):
        result = await scrape_playwright(req.url)

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("sidecar:app", host="127.0.0.1", port=PORT, reload=False)
