import { Product } from './schema';

/**
 * Search Index Builder — Canonical, Single Source of Truth
 * 
 * Builds a flat, pre-computed search index string for a product.
 * Stored on `product._searchIndex` so FilterBar / Engine can match
 * without re-computing on every keystroke.
 *
 * ALL search index construction MUST go through this function.
 * Do NOT create alternative builders elsewhere.
 */
export function buildSearchIndex(p: Product): string {
    const parts: string[] = [
        // Identity
        p.identity.name || '',
        p.identity.brand || '',
        p.identity.model || '',
        p.identity.sku || '',
        p.identity.category || '',
        p.identity.subcategory || '',
        // Enrichment text
        p.enrichment?.seoDescription || '',
        p.enrichment?.description || '',
        // Product identifiers
        p.enrichment?.barcode || '',
        p.enrichment?.mpn || '',
        // AI intelligence (from SchemaMapper enrichment)
        ...(p.enrichment?.intelligence?.pros || []),
        ...(p.enrichment?.intelligence?.cons || []),
        p.enrichment?.intelligence?.buyerFit || '',
        // Marketing
        ...(p.marketing?.hooks || []),
        ...(p.marketing?.benefits_dz || []),
        // Strategic
        ...(p.strategic?.targetAudience || []),
    ];

    // Include observation values (stock status, etc.)
    if (p.observations) {
        for (const [, obs] of Object.entries(p.observations)) {
            if (Array.isArray(obs) && obs[0]?.v) {
                parts.push(String(obs[0].v));
            }
        }
    }

    // Include specs keys and values
    if (p.enrichment?.specs) {
        for (const [k, v] of Object.entries(p.enrichment.specs)) {
            parts.push(k, String(v));
        }
    }

    return parts.join(' ').toLowerCase();
}
