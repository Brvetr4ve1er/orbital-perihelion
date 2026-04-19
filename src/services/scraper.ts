/**
 * Scraper Client — talks to the local Python sidecar.
 * Zero paid APIs. SearXNG + Crawl4AI + Playwright fallback.
 *
 * If the sidecar isn't running, every method resolves with an empty/null
 * payload so callers degrade gracefully (never throws).
 */

export interface ScraperSource {
    title: string;
    url: string;
    snippet: string;
    engine?: string;
}

export interface SearchResponse {
    query: string;
    source: 'searxng' | 'duckduckgo' | 'unavailable';
    results: ScraperSource[];
    cached?: boolean;
}

export interface ScrapeResponse {
    url: string;
    title: string;
    markdown: string;
    text: string;
    images: string[];
    engine: string;
    cached?: boolean;
}

export interface EnrichBundle {
    query: string;
    sources: ScraperSource[];
    markdown_bundle: string;
    images: string[];
    cached?: boolean;
}

let _available: boolean | null = null;

async function _post<T>(path: string, body: any, timeoutMs = 30000): Promise<T | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const r = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch {
        return null;
    }
}

export const Scraper = {
    /** One-shot probe — does the sidecar respond? Cached per-session. */
    async isAvailable(): Promise<boolean> {
        if (_available !== null) return _available;
        try {
            const r = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '__ping__', max: 1 }),
                signal: AbortSignal.timeout(2500),
            });
            _available = r.ok;
        } catch {
            _available = false;
        }
        return _available;
    },

    /** Reset the availability cache (e.g. after user starts the sidecar). */
    resetAvailability() {
        _available = null;
    },

    async search(query: string, max = 8): Promise<SearchResponse> {
        const res = await _post<SearchResponse>('/api/search', { query, max }, 15000);
        return res ?? { query, source: 'unavailable', results: [] };
    },

    async scrape(url: string, mode: 'auto' | 'crawl4ai' | 'playwright' | 'httpx' = 'auto'): Promise<ScrapeResponse | null> {
        return await _post<ScrapeResponse>('/api/scrape', { url, mode }, 30000);
    },

    async enrichWeb(query: string, max_sources = 5, urls?: string[]): Promise<EnrichBundle | null> {
        return await _post<EnrichBundle>('/api/enrich-web', { query, max_sources, urls }, 60000);
    },
};
