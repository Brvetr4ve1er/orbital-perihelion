import { Product } from '../core/schema';
import { Scraper } from './scraper';
import { settingsStore } from './settings';

// Default Configuration (Can be overridden by local storage)
let config = {
    url: localStorage.getItem('pkos_llm_url') || import.meta.env.VITE_LLM_URL || '/api/llm',
    model: localStorage.getItem('pkos_llm_model') || import.meta.env.VITE_LLM_MODEL || 'deepseek/deepseek-r1-0528-qwen3-8b',
    key: localStorage.getItem('pkos_llm_key') || import.meta.env.VITE_LLM_KEY || 'dummy_key'
};

// Status tracking
let llmStatus = 'offline';
let llmStatusListeners: ((status: string) => void)[] = [];

export const LLMService = {
    // ── Status Subscription ────────────────────────────────────
    getStatus() {
        return llmStatus;
    },
    subscribeStatus(listener: (status: string) => void) {
        llmStatusListeners.push(listener);
        return () => {
            llmStatusListeners = llmStatusListeners.filter(l => l !== listener);
        };
    },
    _setStatus(status: string) {
        llmStatus = status;
        llmStatusListeners.forEach(l => l(status));
    },

    // ── Dynamic Configuration ──────────────────────────────────
    getConfig() {
        return config;
    },
    setConfig(url: string, model: string, key: string) {
        config = { url, model, key };
        localStorage.setItem('pkos_llm_url', url);
        localStorage.setItem('pkos_llm_model', model);
        localStorage.setItem('pkos_llm_key', key);
    },

    // ── Saved presets (multiple endpoints) ─────────────────────
    // Store a list of named (url, model, key) tuples in localStorage so users
    // can hop between e.g. "Ollama laptop" and "LM Studio office" instantly.
    getPresets(): Array<{ name: string; url: string; model: string; key: string }> {
        try {
            return JSON.parse(localStorage.getItem('pkos_llm_presets') || '[]');
        } catch { return []; }
    },
    savePreset(name: string) {
        const list = this.getPresets().filter(p => p.name !== name);
        list.push({ name, ...config });
        localStorage.setItem('pkos_llm_presets', JSON.stringify(list));
    },
    deletePreset(name: string) {
        const list = this.getPresets().filter(p => p.name !== name);
        localStorage.setItem('pkos_llm_presets', JSON.stringify(list));
    },
    loadPreset(name: string) {
        const p = this.getPresets().find(x => x.name === name);
        if (p) this.setConfig(p.url, p.model, p.key);
        return p;
    },

    // ── Ping / connectivity check ──────────────────────────────
    async ping(): Promise<{ online: boolean; error?: string }> {
        try {
            // First check if the proxy is alive and can reach LM Studio
            // Since we can't easily GET the models list via the /v1/chat/completions endpoint,
            // and the user might just have the proxy set up for /api/llm, we'll try a dummy call
            // or just use the proxy endpoint directly. 
            // In the legacy code, it fetched the proxy url to get the models.
            // For robustness, we will assume online if we can hit the /api/llm with an empty/dummy request or just rely on a proxy response.
            // Let's just do a GET to the proxy target or a lightweight fetch.
            // Using dummy chat completion call.
            this._setStatus('loading');
            const response = await fetch(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: 'system', content: 'ping' }],
                    max_tokens: 1
                })
            });
            if (response.ok || response.status === 400 || response.status === 401) {
                // 400/401 is fine, it means the server is there. 404 means route is wrong.
                this._setStatus('online');
                return { online: true };
            }
            this._setStatus('error');
            return { online: false, error: `HTTP ${response.status}` };
        } catch (e: any) {
            this._setStatus('offline');
            return { online: false, error: e.message };
        }
    },

    // ── Core LLM call (OpenAI-compat) ──────────────────────────
    async callLLM(systemPrompt: string, userPrompt: string, jsonMode = false): Promise<any> {
        this._setStatus('loading');
        
        const body = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt   }
            ],
            temperature: 0.05,
            max_tokens: 1500,
            stream: false
        };

        const response = await fetch(config.url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const txt = await response.text().catch(() => '');
            this._setStatus('error');
            throw new Error(`LM Studio HTTP ${response.status}: ${txt.substring(0, 200)}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices.length) {
            this._setStatus('error');
            throw new Error('LLM returned no choices.');
        }

        let content = data.choices[0].message.content || '';
        this._setStatus('online');

        if (jsonMode) {
            content = content.trim();
            const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fenceMatch) content = fenceMatch[1].trim();
            
            const braceStart = content.indexOf('{');
            const braceEnd   = content.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd > braceStart) {
                content = content.substring(braceStart, braceEnd + 1);
            }
            try {
                return JSON.parse(content);
            } catch (e) {
                console.error('[LLMEngine] JSON parse failed. Raw:', content.substring(0, 500));
                throw new Error('Model returned invalid JSON.');
            }
        }

        return content;
    },

    // ── Proxy-routed raw HTML fetch ────────────────────────────
    async proxyFetch(url: string): Promise<string> {
        const res = await fetch('/api/proxy?url=' + encodeURIComponent(url));
        if (!res.ok) throw new Error(`Proxy error ${res.status} for ${url}`);
        return await res.text();
    },

    // ── DuckDuckGo search ──────────────────────────────────────
    async searchProduct(query: string): Promise<{ text: string, links: {title: string, url: string, snippet: string}[] }> {
        const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);

        let html;
        try {
            html = await this.proxyFetch(searchUrl);
        } catch (e) {
            console.warn('[LLMService] Search proxy failed:', e);
            return { text: '', links: [] };
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links: any[] = [];
        const snippets: string[] = [];

        doc.querySelectorAll('.result').forEach((result: any) => {
            const anchor = result.querySelector('.result__a');
            const snippet = result.querySelector('.result__snippet');
            if (!anchor) return;

            const title = anchor.textContent.trim();
            let href = anchor.href || anchor.getAttribute('href') || '';
            try {
                const u = new URL(href, 'https://html.duckduckgo.com');
                href = u.searchParams.get('uddg') || u.searchParams.get('u') || href;
                href = decodeURIComponent(href);
            } catch (_) {}

            const text = snippet ? snippet.textContent.trim() : '';
            if (href && !href.startsWith('https://duckduckgo.com')) {
                links.push({ title, url: href, snippet: text });
                snippets.push(`[${title}] (${href})\n${text}`);
            }
        });

        return { text: snippets.join('\n\n').substring(0, 12000), links: links.slice(0, 8) };
    },

    // ── Full Product Enrichment Pipeline ───────────────────────
    async enrichProduct(product: Product): Promise<any> {
        const query = [product.identity.brand, product.identity.model, product.identity.name, 'prix fiche technique'].filter(Boolean).join(' ');

        let searchContext = '';
        let sourceLinks: any[] = [];
        let productImages: string[] = [];

        // Tier-1: Python sidecar (SearXNG + Crawl4AI → markdown bundle)
        const settings = settingsStore.getState();
        const maxSources = settings.scraping.maxSourcesPerProduct || 5;
        const useSidecar = await Scraper.isAvailable();

        if (useSidecar) {
            const bundle = await Scraper.enrichWeb(query, maxSources);
            if (bundle && bundle.markdown_bundle) {
                searchContext = bundle.markdown_bundle;
                sourceLinks = bundle.sources.map(s => ({ title: s.title, url: s.url, snippet: s.snippet }));
                productImages = bundle.images || [];
            }
        }

        // Tier-2 fallback: legacy DDG-via-proxy search (no scrape, snippets only)
        if (!searchContext) {
            try {
                const searchResults = await this.searchProduct(query);
                searchContext = searchResults.text;
                sourceLinks = searchResults.links;
            } catch(e) {
                console.warn("[LLMService] Web search skipped/failed entirely", e);
            }
        }

        const sys = `You are a product intelligence engine for an Algerian electronics store.
Given a product and web search results, output ONLY a JSON object with this exact structure.
Do not write anything outside the JSON. Do not use markdown.

{"description":"French product description (2 sentences)","specs":{"Spec Name":"value"},"competitorPrices":[{"source":"site name","url":"https://url","price":45000}],"ai_insights":{"buyerFit":"French buyer description","pricePosition":"budget","pros":["pro1","pro2"],"cons":["con1"]}}

Rules:
- pricePosition must be: budget, midrange, or premium
- Extract real prices from the web context if visible
- Include url field only if you see a real URL in the context
- Keep specs short: 3-5 key specs max
- Write all text in French`;

        const usr = `Product: ${product.identity.brand} ${product.identity.name}
Category: ${product.identity.category}
Our price: ${product.commercial?.priceRange?.typical || 'unknown'} DZD

Web search snippets:
${searchContext.substring(0, 6000)}

URLs found:
${sourceLinks.slice(0, 5).map((l: any) => `${l.title}: ${l.url}`).join('\n')}

Output JSON only:`;

        const result = await this.callLLM(sys, usr, true);

        // Inject source links back in if LLM omitted URLs
        if (result && result.competitorPrices) {
            result.competitorPrices = result.competitorPrices.map((cp: any) => {
                if (!cp.url) {
                    const match = sourceLinks.find((l: any) =>
                        l.title.toLowerCase().includes(cp.source?.toLowerCase() || '') ||
                        (cp.source && cp.source.toLowerCase().includes(l.title.toLowerCase().split(' ')[0]))
                    );
                    if (match) cp.url = match.url;
                }
                return cp;
            });
        }

        result._sourceLinks = sourceLinks;
        if (productImages.length && (!result.images || !result.images.length)) {
            result.images = productImages;
        }
        return result;
    }
};
