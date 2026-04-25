/**
 * Scraper Client v2 — talks to the local Python sidecar.
 * Zero paid APIs. SearXNG + Crawl4AI + Playwright fallback.
 *
 * If the sidecar isn't running, every method resolves with an empty/null
 * payload so callers degrade gracefully (never throws).
 */

export interface ScraperSource {
    title: string;
    url: string;
    snippet: string;
    domain?: string;
    type?: 'official' | 'retailer' | 'review' | 'general';
    intent?: 'commercial' | 'technical' | 'sentiment';
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

export interface ProductEnrichBundle {
    product: { name: string; brand: string; sku: string; category: string; price: number };
    search_meta: Record<string, { source: string; count: number }>;
    sources: ScraperSource[];
    markdown_bundle: string;
    images: string[];
    source_count: number;
    total_search_results: number;
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
    /** Probe the sidecar. Caches positive results; retries on failure. */
    async isAvailable(): Promise<boolean> {
        // If we know it's online, return true. 
        // If we haven't checked or it was offline, re-check.
        if (_available === true) return true;
        
        try {
            const r = await fetch('/api/health', {
                signal: AbortSignal.timeout(3000),
            });
            _available = r.ok;
            if (_available) console.log('[Scraper] Sidecar is online');
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

    /** Legacy: generic enrichment bundle. */
    async enrichWeb(query: string, max_sources = 5, urls?: string[]): Promise<EnrichBundle | null> {
        return await _post<EnrichBundle>('/api/enrich', { query, max_sources, urls }, 60000);
    },

    /**
     * NEW: Full CPO v4.2 product enrichment pipeline.
     * Executes multi-intent search (commercial, technical, sentiment),
     * ranks & diversifies URLs by domain authority, scrapes top sources,
     * and returns a structured markdown bundle ready for LLM extraction.
     */
    async enrichProduct(
        name: string,
        brand: string,
        sku: string,
        category: string,
        price: number,
        maxSources = 6
    ): Promise<ProductEnrichBundle | null> {
        return await _post<ProductEnrichBundle>(
            '/api/enrich-product',
            { name, brand, sku, category, price, max_sources: maxSources },
            90000  // 90s timeout for full pipeline
        );
    },
};
