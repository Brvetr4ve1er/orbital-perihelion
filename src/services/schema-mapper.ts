import { Product, ProductSchema } from '../core/schema';
import { EnrichmentService } from './enrichment';
import { buildSearchIndex } from '../core/search-index';

/**
 * Schema Mapper — CPO v4.2 Deep Merge Engine
 * 
 * Takes the raw JSON output from the LLM extraction and maps it into the
 * canonical Product schema, using the Observation/Consensus architecture
 * to preserve provenance and enable multi-source resolution.
 */

interface LLMExtractionResult {
    description?: string;
    seoDescription?: string;
    specs?: Record<string, any>;
    competitorPrices?: Array<{
        source: string; url?: string; price: number;
        currency?: string; availability?: string;
    }>;
    sources?: Array<{
        title?: string; url: string; snippet?: string;
        domain?: string; type?: string;
    }>;
    metrics?: {
        sentiment?: { score: number; label: string; highlights: string[] };
        reviews?: { rating: number; count: number; distribution?: Record<string, number> };
        market?: { meanPrice?: number; priceVolatility?: number; demandLevel?: string };
    };
    intelligence?: {
        pros?: string[]; cons?: string[]; buyerFit?: string;
        featureScore?: number; pricePosition?: string;
        marketVerdict?: string; sellingAngles?: string[];
    };
    images?: string[];
    videos?: Array<{ url: string; platform: string; thumbnail?: string }>;
    marketing?: { hooks?: string[]; benefits_dz?: string[] };
    visual?: { heroImage?: string };
    strategic?: {
        productRole?: string; marginBehavior?: string;
        targetAudience?: string[]; competitivePosition?: string;
    };
    relationships?: {
        complementary?: string[];
        alternatives?: Array<{ productId: string; reason: string }>;
    };
    _meta?: { schemaVersion?: string; createdBy?: string; score?: number };
    _sourceLinks?: any[];
    _searchMeta?: any;
    _pipeline?: string;
}

const SRC_SCRAPER = 'src_agentic_scraper_v2';

export const SchemaMapper = {
    /**
     * Merge LLM extraction result into an existing Product object.
     * Uses the Observation/Consensus architecture for all fact-level fields.
     */
    mergeIntoProduct(product: Product, extraction: LLMExtractionResult): Product {
        const p = JSON.parse(JSON.stringify(product)) as any;
        const ts = new Date().toISOString();
        const confidence = extraction._meta?.score || 0.7;
        const pipeline = extraction._pipeline || 'unknown';

        if (!p.enrichment) p.enrichment = {};
        if (!p.observations) p.observations = {};

        // ── 1. Description & SEO ──
        if (extraction.description) {
            p.enrichment.description = extraction.description;
            EnrichmentService.appendObservation(p, 'description', extraction.description, confidence, SRC_SCRAPER, pipeline);
        }
        if (extraction.seoDescription) {
            p.enrichment.seoDescription = extraction.seoDescription;
        }

        // ── 2. Technical Specs ──
        if (extraction.specs && Object.keys(extraction.specs).length > 0) {
            p.enrichment.specs = { ...(p.enrichment.specs || {}), ...extraction.specs };
            // Add each spec as an observation for consensus
            for (const [key, val] of Object.entries(extraction.specs)) {
                if (val != null) {
                    EnrichmentService.appendObservation(p, `spec_${key}`, val, confidence, SRC_SCRAPER, pipeline);
                }
            }
        }

        // ── 3. Competitor Prices ──
        if (extraction.competitorPrices && extraction.competitorPrices.length > 0) {
            const existing = p.enrichment.competitorPrices || [];
            const merged = [...existing];

            for (const cp of extraction.competitorPrices) {
                const dup = merged.find(
                    (e: any) => e.source === cp.source && Math.abs((e.price || 0) - (cp.price || 0)) < 100
                );
                if (!dup) {
                    merged.push({
                        source: cp.source,
                        url: cp.url || '',
                        price: cp.price,
                        currency: cp.currency || 'DZD',
                        availability: cp.availability || 'Inconnu',
                        lastChecked: ts,
                    });
                }
            }
            p.enrichment.competitorPrices = merged;

            // Add mean competitor price as observation
            const prices = merged.map((c: any) => c.price).filter(Boolean);
            if (prices.length > 0) {
                const mean = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
                EnrichmentService.appendObservation(p, 'competitor_mean_price', mean, confidence, SRC_SCRAPER, pipeline);
            }
        }

        // ── 4. Sources ──
        if (extraction.sources && extraction.sources.length > 0) {
            p.enrichment.sources = extraction.sources.map(s => ({
                title: s.title || '',
                url: s.url,
                snippet: s.snippet || '',
                domain: s.domain || (s.url ? s.url.split('//')[1]?.split('/')[0] : ''),
                type: s.type || 'general',
            }));
        } else if (extraction._sourceLinks) {
            p.enrichment.sources = extraction._sourceLinks;
        }

        // ── 5. Metrics (Sentiment, Reviews, Market) ──
        if (extraction.metrics) {
            p.enrichment.metrics = p.enrichment.metrics || {};

            if (extraction.metrics.sentiment) {
                p.enrichment.metrics.sentiment = extraction.metrics.sentiment;
                EnrichmentService.appendObservation(p, 'sentiment_score', extraction.metrics.sentiment.score, confidence, SRC_SCRAPER, pipeline);
                EnrichmentService.appendObservation(p, 'sentiment_label', extraction.metrics.sentiment.label, confidence, SRC_SCRAPER, pipeline);
            }
            if (extraction.metrics.reviews) {
                p.enrichment.metrics.reviews = extraction.metrics.reviews;
                EnrichmentService.appendObservation(p, 'review_rating', extraction.metrics.reviews.rating, confidence, SRC_SCRAPER, pipeline);
                EnrichmentService.appendObservation(p, 'review_count', extraction.metrics.reviews.count, confidence, SRC_SCRAPER, pipeline);
            }
            if (extraction.metrics.market) {
                p.enrichment.metrics.market = extraction.metrics.market;
                if (extraction.metrics.market.meanPrice) {
                    EnrichmentService.appendObservation(p, 'market_mean_price', extraction.metrics.market.meanPrice, confidence, SRC_SCRAPER, pipeline);
                }
                if (extraction.metrics.market.demandLevel) {
                    EnrichmentService.appendObservation(p, 'demand_level', extraction.metrics.market.demandLevel, confidence, SRC_SCRAPER, pipeline);
                }
            }
        }

        // ── 6. Intelligence (Pros, Cons, Verdict) ──
        if (extraction.intelligence) {
            p.enrichment.intelligence = {
                pros: extraction.intelligence.pros || [],
                cons: extraction.intelligence.cons || [],
                buyerFit: extraction.intelligence.buyerFit || '',
                featureScore: extraction.intelligence.featureScore || 0.5,
                pricePosition: extraction.intelligence.pricePosition as any || 'unknown',
                marketVerdict: extraction.intelligence.marketVerdict || '',
                sellingAngles: extraction.intelligence.sellingAngles || [],
            };

            // Also sync to knowledge block
            p.knowledge = {
                insights: {
                    pros: extraction.intelligence.pros || [],
                    cons: extraction.intelligence.cons || [],
                    fit: extraction.intelligence.buyerFit || '',
                    hooks: extraction.intelligence.sellingAngles || [],
                }
            };

            EnrichmentService.appendObservation(p, 'price_position', extraction.intelligence.pricePosition || 'unknown', confidence, SRC_SCRAPER, pipeline);
            EnrichmentService.appendObservation(p, 'market_verdict', extraction.intelligence.marketVerdict || '', confidence, SRC_SCRAPER, pipeline);
        }

        // ── 7. Images & Videos ──
        if (extraction.images && extraction.images.length > 0) {
            p.enrichment.images = extraction.images.filter((img: string) => img && img.startsWith('http'));
            
            // Set hero image
            if (!p.visual) p.visual = { heroImage: '', gallery: [], marketingVisuals: [], videoUrl: null, thumbnailUrl: null, imageStatus: 'missing' };
            if (extraction.visual?.heroImage) {
                p.visual.heroImage = extraction.visual.heroImage;
                p.visual.imageStatus = 'present';
            } else if (p.enrichment.images.length > 0) {
                p.visual.heroImage = p.enrichment.images[0];
                p.visual.imageStatus = 'present';
            }
            p.visual.gallery = p.enrichment.images;
        }
        if (extraction.videos && extraction.videos.length > 0) {
            p.enrichment.videos = extraction.videos;
            if (p.visual && extraction.videos[0]?.url) {
                p.visual.videoUrl = extraction.videos[0].url;
            }
        }

        // ── 8. Marketing ──
        if (extraction.marketing) {
            p.marketing = {
                ...(p.marketing || {}),
                hooks: extraction.marketing.hooks || [],
                benefits_dz: extraction.marketing.benefits_dz || [],
                sellingAngles: extraction.intelligence?.sellingAngles || p.marketing?.sellingAngles || [],
            };
        }

        // ── 9. Strategic ──
        if (extraction.strategic) {
            p.strategic = {
                ...(p.strategic || {}),
                productRole: extraction.strategic.productRole || p.strategic?.productRole || '',
                marginBehavior: extraction.strategic.marginBehavior || p.strategic?.marginBehavior || '',
                targetAudience: extraction.strategic.targetAudience || p.strategic?.targetAudience || [],
                competitivePosition: extraction.strategic.competitivePosition || p.strategic?.competitivePosition || '',
            };
        }

        // ── 10. Relationships ──
        if (extraction.relationships) {
            p.relationships = {
                ...(p.relationships || {}),
                complementary: extraction.relationships.complementary || [],
                alternatives: extraction.relationships.alternatives || [],
            };
        }

        // ── 11. Evict stale observations ──
        // Keep only the top 3 highest-confidence observations per key to prevent
        // unbounded storage growth as products are re-enriched over time.
        this._evictObservations(p, 3);

        // ── 12. Recompute Consensus & Score ──
        EnrichmentService.computeConsensus(p);
        const score = extraction._meta?.score || EnrichmentService.calculateScore(p);
        
        p._meta = {
            ...(p._meta || {}),
            schemaVersion: '4.2',
            createdBy: pipeline === 'cpo_v4.2_full' ? 'AgenticScraper' : 'LegacyEnricher',
            score,
            ts,
            lastAggregated: ts,
        };
        p.identity.confidenceScore = score;
        p.identity.lastUpdated = ts;

        // ── 13. Rebuild Search Index (canonical, unified) ──
        p._searchIndex = buildSearchIndex(p as Product);

        // ── 14. Zod Runtime Validation ──
        // safeParse catches LLM hallucinations (string where number expected, etc.).
        // On failure, surgically strip ONLY the invalid paths and re-validate.
        // If still failing, return the ORIGINAL product (pre-merge) — never type-assert corrupt data.
        const validated = ProductSchema.safeParse(p);
        if (validated.success) {
            return validated.data as Product;
        }

        // Surgical strip: null out each invalid path
        console.warn(
            `[SchemaMapper] Zod validation failed for "${p.identity?.name}" — ` +
            `${validated.error.issues.length} issue(s). Stripping invalid paths.`
        );
        const stripped = p as any;
        for (const issue of validated.error.issues) {
            if (!issue.path.length) continue;
            let obj = stripped;
            for (let i = 0; i < issue.path.length - 1; i++) {
                obj = obj?.[issue.path[i]];
                if (obj == null) break;
            }
            if (obj != null) {
                const lastKey = issue.path[issue.path.length - 1];
                obj[lastKey] = undefined;
            }
        }

        // Re-validate after stripping
        const revalidated = ProductSchema.safeParse(stripped);
        if (revalidated.success) return revalidated.data as Product;

        // If still invalid, discard the merge entirely and return original product
        console.error(
            `[SchemaMapper] Re-validation failed after stripping for "${p.identity?.name}". ` +
            `Discarding AI merge to prevent data corruption.`
        );
        return product;
    },

    /**
     * Evict low-confidence observations to keep storage bounded.
     * Retains the top `maxPerKey` observations sorted by confidence (desc).
     */
    _evictObservations(p: any, maxPerKey: number) {
        if (!p.observations) return;
        for (const key of Object.keys(p.observations)) {
            const obs = p.observations[key];
            if (!Array.isArray(obs) || obs.length <= maxPerKey) continue;
            // Sort by confidence descending, then by timestamp descending
            obs.sort((a: any, b: any) => (b.c || 0) - (a.c || 0) || (b.t || '').localeCompare(a.t || ''));
            p.observations[key] = obs.slice(0, maxPerKey);
        }
    },
};
