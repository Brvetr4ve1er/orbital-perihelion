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

        return products.filter(p => {
            // 1. Category Filter
            if (category && category !== 'all' && p.identity.category !== category) return false;

            // 2. Brand Filter
            if (brand && brand !== 'all' && p.identity.brand !== brand) return false;

            // 3. Stock Status Filter
            if (stock && stock !== 'all') {
                const lp = ProductAdapter.toLegacy(p);
                if (lp.commercial.stockStatus !== stock) return false;
            }

            // 4. Search Query — use cached _searchIndex when present, build lazily otherwise
            if (q) {
                const idx = p._searchIndex || buildSearchIndex(p);
                return idx.includes(q);
            }

            return true;
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
            const lp = ProductAdapter.toLegacy(p);
            const comm = lp.commercial;

            totalRetail += (comm.retailPrice || 0) * (comm.stockQty || 0);
            totalCost += (comm.purchasePrice || 0) * (comm.stockQty || 0);
            totalQty += (comm.stockQty || 0);

            // Brand counts
            brands[lp.marque] = (brands[lp.marque] || 0) + 1;

            // Category counts
            const catId = lp.category.id;
            if (!categories[catId]) {
                categories[catId] = { label: lp.category.label, icon: lp.category.icon, count: 0 };
            }
            categories[catId].count++;

            // Health
            const status = comm.stockStatus;
            if (status === 'Normal') stockHealth.normal++;
            else if (status === 'Faible') stockHealth.faible++;
            else if (status === 'Rupture') stockHealth.rupture++;
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
            avgMargin: products.length ? Math.round((totalRetail - totalCost) / totalRetail * 100) : 0,
            brands: brandList,
            categories: categoryList,
            stockHealth
        };
    }
};
