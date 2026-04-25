import { Product } from './schema';
import { ProductAdapter } from './product-adapter';
import { buildSearchIndex } from './search-index';

/**
 * Core Engine for Inventory Intelligence.
 * Handles filtering, searching, and analytics computation.
 */
export const Engine = {
    /**
     * Filters a list of products based on query and filter set.
     */
    filterProducts(
        products: Product[],
        query: string,
        filters: Record<string, any>
    ): Product[] {
        const q = query.toLowerCase().trim();
        const { category, brand, stock } = filters;

        const filtered = products.filter(p => {
            if (category && category !== 'all' && p.identity.category !== category) return false;
            if (brand    && brand    !== 'all' && p.identity.brand    !== brand)    return false;

            if (stock && stock !== 'all') {
                const stockObs = p.observations?.stock?.[0];
                const stockQty = typeof stockObs?.v === 'number' ? stockObs.v : 0;
                let status = 'Rupture';
                if (stockQty > 5) status = 'Normal';
                else if (stockQty > 0) status = 'Faible';
                
                const csvStatus = p.observations?.stock_status?.[0]?.v;
                if (typeof csvStatus === 'string') {
                    const l = csvStatus.toLowerCase();
                    if (l.includes('stock')) status = 'Normal';
                    if (l.includes('faible')) status = 'Faible';
                    if (l.includes('rupture')) status = 'Rupture';
                }
                
                if (status !== stock) return false;
            }

            // Quick-view presets — composable with the above.
            const view = filters.view;
            if (view === 'dead_stock') {
                const qty = (p.observations?.stock?.[0]?.v as number) ?? 0;
                if (qty < 10) return false; // only overstock candidates
            } else if (view === 'no_image') {
                const has = p.visual?.heroImage || (p.enrichment?.images && p.enrichment.images[0]);
                if (has) return false;
            } else if (view === 'not_enriched') {
                if (p.enrichment?.intelligence) return false;
            } else if (view === 'low_margin') {
                const min = p.commercial?.priceRange?.min || 0;
                const typ = p.commercial?.priceRange?.typical || 0;
                if (!typ || !min) return false;
                const margin = (typ - min) / typ;
                if (Number.isNaN(margin) || margin > 0.15) return false;
            }

            if (q) {
                if (!p._searchIndex) {
                    p._searchIndex = buildSearchIndex(p);
                }
                return p._searchIndex.includes(q);
            }
            return true;
        });

        // 🧠 Smart Ranking (Decision Engine)
        // 1. In-stock first
        // 2. High confidence score
        // 3. High margin
        return filtered.sort((a, b) => {
            const aStock = (a.observations?.stock?.[0]?.v as number) || 0;
            const bStock = (b.observations?.stock?.[0]?.v as number) || 0;
            
            if (aStock > 0 && bStock === 0) return -1;
            if (aStock === 0 && bStock > 0) return 1;
            
            const aConf = a.identity.confidenceScore || 0;
            const bConf = b.identity.confidenceScore || 0;
            if (bConf !== aConf) return bConf - aConf;
            
            const aMargin = (a.commercial?.priceRange?.typical || 0) - (a.commercial?.priceRange?.min || 0);
            const bMargin = (b.commercial?.priceRange?.typical || 0) - (b.commercial?.priceRange?.min || 0);
            return bMargin - aMargin;
        });
    },

    /**
     * Builds a flat search index string for a product.
     * Delegates to the centralised buildSearchIndex helper.
     */
    buildSearchIndex(p: Product): string {
        return buildSearchIndex(p);
    },

    /**
     * Calculates combined statistics for a dashboard.
     */
    calculateStats(products: Product[]) {
        if (!products.length) return null;

        let totalRetail = 0;
        let totalCost = 0;
        let totalQty = 0;

        const brands: Record<string, number> = {};
        const categories: Record<string, { label: string, icon: string, count: number }> = {};
        const stockHealth = { normal: 0, faible: 0, rupture: 0 };

        products.forEach(p => {
            const retailPrice = p.commercial?.priceRange?.typical || p.commercial?.priceRange?.max || 0;
            const purchasePrice = p.commercial?.priceRange?.min || 0;
            const stockObs = p.observations?.stock?.[0];
            const stockQty = typeof stockObs?.v === 'number' ? stockObs.v : 0;
            
            let stockStatus = 'Rupture';
            if (stockQty > 5) stockStatus = 'Normal';
            else if (stockQty > 0) stockStatus = 'Faible';
            const csvStatus = p.observations?.stock_status?.[0]?.v;
            if (typeof csvStatus === 'string') {
                const l = csvStatus.toLowerCase();
                if (l.includes('stock')) stockStatus = 'Normal';
                if (l.includes('faible')) stockStatus = 'Faible';
                if (l.includes('rupture')) stockStatus = 'Rupture';
            }

            totalRetail += retailPrice * stockQty;
            totalCost += purchasePrice * stockQty;
            totalQty += stockQty;

            // Brand counts
            const brand = p.identity.brand || 'Inconnu';
            brands[brand] = (brands[brand] || 0) + 1;

            // Category counts
            const catId = p.identity.category || 'other';
            if (!categories[catId]) {
                categories[catId] = { label: ProductAdapter._categoryLabel(catId), icon: ProductAdapter._categoryIcon(catId), count: 0 };
            }
            categories[catId].count++;

            // Health
            if (stockStatus === 'Normal') stockHealth.normal++;
            else if (stockStatus === 'Faible') stockHealth.faible++;
            else if (stockStatus === 'Rupture') stockHealth.rupture++;
        });

        const brandList = Object.entries(brands)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        const categoryList = Object.entries(categories)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count);

        return {
            totalProducts: products.length,
            totalSKUs: totalQty,
            totalRetailValue: totalRetail,
            totalCost: totalCost,
            avgMargin: totalRetail > 0 ? Math.round((totalRetail - totalCost) / totalRetail * 100) : 0,
            brands: brandList,
            categories: categoryList,
            stockHealth
        };
    }
};
