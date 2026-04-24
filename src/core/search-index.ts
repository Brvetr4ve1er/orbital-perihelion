import { Product } from './schema';

/**
 * Search Index Builder — Unit 3
 * 
 * Builds a flat, pre-computed search index string for a product.
 * Stored on `product._searchIndex` so FilterBar / Engine can match
 * without re-computing on every keystroke.
 */
export function buildSearchIndex(p: Product): string {
    const parts: string[] = [
        p.identity.name || '',
        p.identity.brand || '',
        p.identity.model || '',
        p.identity.sku || '',
        p.identity.category || '',
        p.identity.subcategory || '',
        p.enrichment?.seoDescription || '',
        p.enrichment?.description || '',
        // Essential product identifiers
        p.enrichment?.barcode || '',
        p.enrichment?.mpn || '',
    ];

    // Include observation values (stock status, etc.)
    if (p.observations) {
        for (const [key, obs] of Object.entries(p.observations)) {
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
