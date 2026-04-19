/**
 * Search Index Builder — Unit 3
 * 
 * Builds a flat, pre-computed search index string for a product.
 * Stored on `product._searchIndex` so FilterBar / Engine can match
 * without re-computing on every keystroke.
 */
import { Product } from './schema';

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
    ];

    // Include consensus values (price, stock, specs, etc.)
    if (p.consensus) {
        for (const entry of Object.values(p.consensus)) {
            if (entry && entry.v !== undefined && entry.v !== null) {
                parts.push(String(entry.v));
            }
        }
    }

    // Include comparison tags
    if (p.technical?.comparisonTags?.length) {
        parts.push(...p.technical.comparisonTags);
    }

    return parts.join(' ').toLowerCase();
}
