import { Product } from '../core/schema';
import { Scraper, ProductEnrichBundle } from './scraper';
import { settingsStore } from './settings';

export const getConfig = () => {
    return settingsStore.getState().llm;
};

// Status tracking
let llmStatus = 'offline';
let llmStatusListeners: ((status: string) => void)[] = [];

// ── The CPO v4.2 Full Extraction Prompt ─────────────────────────────────
// This is the master prompt that instructs the LLM to extract every field
// from the CPO v4.2 schema. It is built dynamically per product.

function buildExtractionPrompt(product: Product, bundle: ProductEnrichBundle): { system: string; user: string } {
    const identity = product.identity;
    const price = product.commercial?.priceRange?.typical || 0;

    const system = `You are the PKOS Product Intelligence Extraction Engine for an Algerian electronics retailer.
Your task: read the scraped web content below and extract EVERY piece of structured data that maps to the CPO v4.2 product schema.

You MUST output ONLY a single JSON object. No markdown, no explanation, no commentary.
The JSON must conform EXACTLY to this structure (omit fields only if truly unknowable):

{
  "description": "2-sentence professional French product description",
  "seoDescription": "SEO-optimized meta description in French (max 160 chars)",
  "specs": {
    "key": "value pairs — adapt to category. Examples: power_w, capacity_l, screen_size, resolution, panel_type, weight_kg, energy_class, noise_db, dimensions"
  },
  "competitorPrices": [
    {"source": "Retailer name", "url": "https://...", "price": 45000, "currency": "DZD", "availability": "En Stock|Rupture|Inconnu"}
  ],
  "sources": [
    {"title": "Page title", "url": "https://...", "snippet": "Brief excerpt", "domain": "example.com", "type": "retailer|review|official|forum|news"}
  ],
  "metrics": {
    "sentiment": {"score": 0-100, "label": "Positive|Mixed|Negative", "highlights": ["key phrase 1", "key phrase 2"]},
    "reviews": {"rating": 4.5, "count": 120, "distribution": {"5": 80, "4": 25, "3": 10, "2": 3, "1": 2}},
    "market": {"meanPrice": 45000, "priceVolatility": 0.1, "demandLevel": "low|medium|high|viral"}
  },
  "intelligence": {
    "pros": ["Pro 1 in French", "Pro 2"],
    "cons": ["Con 1 in French"],
    "buyerFit": "French description of ideal buyer profile",
    "featureScore": 0.0-1.0,
    "pricePosition": "budget|midrange|premium",
    "marketVerdict": "Bon Achat|Attendre|Surcoté — with 1-sentence justification",
    "sellingAngles": ["Sales hook 1 in French", "Sales hook 2"]
  },
  "images": ["https://direct-image-url.jpg"],
  "videos": [{"url": "https://youtube.com/...", "platform": "YouTube", "thumbnail": "https://..."}],
  "marketing": {
    "hooks": ["Catchy 1-liner for social media"],
    "benefits_dz": ["Benefit localized for Algerian market"]
  },
  "visual": {
    "heroImage": "https://best-product-image.jpg"
  },
  "strategic": {
    "productRole": "Hero|Filler|Traffic Driver|Margin Maker",
    "marginBehavior": "stable|seasonal|declining",
    "targetAudience": ["Familles", "Professionnels"],
    "competitivePosition": "Leader|Challenger|Follower|Niche"
  },
  "relationships": {
    "complementary": ["Accessory or add-on product names"],
    "alternatives": [{"productId": "competitor model name", "reason": "why it's an alternative"}]
  },
  "_meta": {"schemaVersion": "4.2", "createdBy": "AgenticScraper", "score": 0.0-1.0}
}

RULES:
- Extract REAL data from the web content. Do not hallucinate prices or specs.
- If a competitor price is visible in the text, extract it with its source URL.
- All text fields (description, pros, cons, buyerFit, hooks) must be in French.
- specs keys should be snake_case. Adapt them to the product category.
- The _meta.score should reflect how much real data you found (0.3 = mostly guessed, 0.9 = rich real data).
- For images, extract only absolute URLs to actual product photos (no logos, no icons).
- competitorPrices must use DZD currency unless explicitly stated otherwise.`;

    const sourceList = bundle.sources
        .map(s => `[${(s.type || 'general').toUpperCase()}] ${s.title || s.domain || ''}: ${s.url}`)
        .join('\n');

    const user = `PRODUCT TO ENRICH:
Name: ${identity.name}
Brand: ${identity.brand}
SKU: ${identity.model || identity.sku || 'N/A'}
Category: ${identity.category}
Our Price: ${price > 0 ? price + ' DZD' : 'Unknown'}

SCRAPED WEB CONTENT (${bundle.source_count} sources from ${bundle.total_search_results} search results):
${bundle.markdown_bundle}

SOURCE URLs:
${sourceList}

IMAGES FOUND BY SCRAPER:
${(bundle.images || []).slice(0, 10).join('\n')}

Extract ALL data into the CPO v4.2 JSON schema. Output JSON only:`;

    return { system, user };
}


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
        return settingsStore.getState().llm;
    },
    setConfig(url: string, model: string, key: string) {
        settingsStore.update('llm', { url, model, key });
    },

    // ── Saved presets (multiple endpoints) ─────────────────────
    getPresets(): Array<{ name: string; url: string; model: string; key: string }> {
        try {
            return JSON.parse(localStorage.getItem('pkos_llm_presets') || '[]');
        } catch { return []; }
    },
    savePreset(name: string) {
        const list = this.getPresets().filter(p => p.name !== name);
        const { url, model, key } = this.getConfig();
        list.push({ name, url, model, key });
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
            this._setStatus('loading');
            const config = this.getConfig();

            // Try lightweight GET /models first (avoids triggering model loading)
            const modelsUrl = config.url.replace(/\/chat\/completions\/?$/, '/models')
                                        .replace(/\/v1\/?$/, '/v1/models');
            try {
                const r = await fetch(modelsUrl, {
                    method: 'GET',
                    headers: config.key ? { 'Authorization': `Bearer ${config.key}` } : {},
                    signal: AbortSignal.timeout(5000),
                });
                if (r.ok || r.status === 401) {
                    this._setStatus('online');
                    return { online: true };
                }
            } catch { /* fall through to POST probe */ }

            // Fallback: minimal POST (for non-standard endpoints)
            const response = await fetch(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: 'system', content: 'ping' }],
                    max_tokens: 1
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (response.ok || response.status === 400 || response.status === 401) {
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
    async callLLM(systemPrompt: string, userPrompt: string, jsonMode = false, retryCount = 0): Promise<any> {
        this._setStatus('loading');
        const config = this.getConfig();
        
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   }
        ];

        const maxRetries = settingsStore.getState().enrichment.retryAttempts || 2;
        let lastError = '';

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                messages.push({ role: 'assistant', content: lastError });
                messages.push({ role: 'user', content: 'Please correct the JSON formatting error above and output ONLY valid JSON.' });
            }

            const body = {
                model: config.model,
                messages: messages,
                temperature: config.temperature || 0.05,
                max_tokens: config.maxTokens || 3000,  // Increased for full schema extraction
                stream: false
            };

            try {
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
                    throw new Error(`LLM HTTP ${response.status}: ${txt.substring(0, 200)}`);
                }

                const data = await response.json();

                if (!data.choices || !data.choices.length) {
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
                        console.error(`[LLMEngine] JSON parse failed (attempt ${attempt + 1}/${maxRetries + 1}). Raw:`, content.substring(0, 500));
                        lastError = content;
                        if (attempt === maxRetries || !settingsStore.getState().enrichment.retryOnValidationError) {
                            throw new Error('Model returned invalid JSON.');
                        }
                        continue;
                    }
                }

                return content;
            } catch (err: any) {
                if (attempt === maxRetries) {
                    this._setStatus('error');
                    throw err;
                }
            }
        }
    },

    // ── Proxy-routed raw HTML fetch ────────────────────────────
    async proxyFetch(url: string): Promise<string> {
        const res = await fetch('/api/proxy?url=' + encodeURIComponent(url));
        if (!res.ok) throw new Error(`Proxy error ${res.status} for ${url}`);
        return await res.text();
    },

    // ── DuckDuckGo search (legacy fallback) ────────────────────
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

    // ══════════════════════════════════════════════════════════════
    //  FULL PRODUCT ENRICHMENT PIPELINE (CPO v4.2)
    // ══════════════════════════════════════════════════════════════
    async enrichProduct(product: Product): Promise<any> {
        const identity = product.identity;
        const useSidecar = await Scraper.isAvailable();
        const settings = settingsStore.getState();
        const maxSources = settings.scraping?.maxSourcesPerProduct || 6;

        let bundle: ProductEnrichBundle | null = null;
        let searchContext = '';
        let sourceLinks: any[] = [];
        let productImages: string[] = [];

        // ── Tier 1: Full CPO v4.2 Pipeline (Python Sidecar) ──
        if (useSidecar) {
            bundle = await Scraper.enrichProduct(
                identity.name,
                identity.brand,
                identity.model || identity.sku || '',
                identity.category,
                product.commercial?.priceRange?.typical || 0,
                maxSources
            );

            if (bundle && bundle.markdown_bundle) {
                console.log(`[LLMService] Sidecar returned ${bundle.source_count} sources (${bundle.total_search_results} search hits)`);
                // Build the full extraction prompt
                const { system, user } = buildExtractionPrompt(product, bundle);
                
                try {
                    const result = await this.callLLM(system, user, true);
                    
                    // Post-process: inject scraper images if LLM missed them
                    if (result && bundle.images?.length) {
                        if (!result.images || result.images.length === 0) {
                            result.images = bundle.images;
                        }
                    }

                    // Post-process: inject source URLs if LLM missed them
                    if (result && result.competitorPrices) {
                        result.competitorPrices = result.competitorPrices.map((cp: any) => {
                            if (!cp.url) {
                                const match = bundle!.sources.find(s =>
                                    s.type === 'retailer' &&
                                    (s.title?.toLowerCase().includes(cp.source?.toLowerCase() || '') ||
                                     s.domain?.toLowerCase().includes(cp.source?.toLowerCase() || ''))
                                );
                                if (match) cp.url = match.url;
                            }
                            return cp;
                        });
                    }

                    // Inject source metadata from scraper
                    if (result) {
                        result._sourceLinks = bundle.sources;
                        result._searchMeta = bundle.search_meta;
                        result._pipeline = 'cpo_v4.2_full';
                    }

                    return result;
                } catch (err) {
                    console.warn('[LLMService] Full extraction failed, falling back to legacy:', err);
                    // Fall through to legacy path
                    searchContext = bundle.markdown_bundle;
                    sourceLinks = bundle.sources;
                    productImages = bundle.images || [];
                }
            }
        }

        // ── Tier 2: Legacy DDG Snippet-Only Fallback ──
        if (!searchContext) {
            const query = [identity.brand, identity.model, identity.name, 'prix fiche technique'].filter(Boolean).join(' ');
            try {
                // Try sidecar's basic enrich first
                if (useSidecar) {
                    const legacyBundle = await Scraper.enrichWeb(query, maxSources);
                    if (legacyBundle?.markdown_bundle) {
                        searchContext = legacyBundle.markdown_bundle;
                        sourceLinks = legacyBundle.sources.map(s => ({ title: s.title, url: s.url, snippet: s.snippet }));
                        productImages = legacyBundle.images || [];
                    }
                }
                // Final fallback: browser-side DDG
                if (!searchContext) {
                    const searchResults = await this.searchProduct(query);
                    searchContext = searchResults.text;
                    sourceLinks = searchResults.links;
                }
            } catch (e) {
                console.warn("[LLMService] Web search skipped/failed entirely", e);
            }
        }

        // ── Legacy Minimal LLM Extraction ──
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

        const usr = `Product: ${identity.brand} ${identity.name}
Category: ${identity.category}
Our price: ${product.commercial?.priceRange?.typical || 'unknown'} DZD

Web search snippets:
${searchContext.substring(0, 6000)}

URLs found:
${sourceLinks.slice(0, 5).map((l: any) => `${l.title}: ${l.url}`).join('\n')}

Output JSON only:`;

        const result = await this.callLLM(sys, usr, true);

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
        result._pipeline = 'legacy_minimal';
        if (productImages.length && (!result.images || !result.images.length)) {
            result.images = productImages;
        }
        return result;
    }
};
