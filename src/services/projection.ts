import { Product } from '../core/schema';
import { ProductAdapter } from '../core/product-adapter';

/**
 * Projection Service
 * Ported from legacy projection-layer.js.
 * Handles transformations for UI and specialized views.
 */
export const ProjectionService = {
    private_cache: new Map<string, any>(),

    invalidate() {
        this.private_cache.clear();
    },

    /**
     * Projects CPO to Legacy v1.0 shape.
     */
    toLegacy(product: Product) {
        if (!product) return null;
        const key = `legacy_${product._meta?.fp || 'raw'}`;

        if (this.private_cache.has(key)) return this.private_cache.get(key);

        const projected = ProductAdapter.toLegacy(product);
        this.private_cache.set(key, projected);
        return projected;
    },

    /**
     * Projects CPO to KPI (Financial/Stock) view.
     */
    toKpiView(product: Product) {
        if (!product) return null;
        const key = `kpi_${product._meta?.fp || 'raw'}`;

        if (this.private_cache.has(key)) return this.private_cache.get(key);

        const consensus = product.consensus || {};
        const fv = (k: string, def: any = null) => {
            return (consensus[k] && (consensus[k] as any).v !== undefined) ? (consensus[k] as any).v : def;
        };

        const retail = fv('price_retail', 0);

        const projected = {
            retailPrice: retail,
            priceFormatted: new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(retail),
            marginFormatted: fv('margin') ? `${fv('margin')} DZD` : '-',
            markupFormatted: fv('markup') ? `${fv('markup')}%` : '-',
            stockStatus: fv('stock_status', 'Unknown'),
            stockClass: (fv('stock', 0) < 5) ? 'low-stock' : 'normal-stock',
            confidence: (consensus['price_retail'] as any)?.c || 0
        };

        this.private_cache.set(key, projected);
        return projected;
    }
};
