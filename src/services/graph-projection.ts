import { Product } from '../core/schema';
import type { GraphData, GraphNode, GraphLink } from '../graph/types';

/**
 * Projects the product catalog into a GraphData structure for the physics graph.
 * Creates Category → Brand → Product hierarchy with link weighting.
 */
export function projectProductsToGraph(products: Product[]): GraphData {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const seenCategories = new Map<string, number>();
    const seenBrands = new Map<string, number>();

    for (const p of products) {
        const id = p.identity?.id;
        if (!id) continue;

        const brand = (p.identity.brand || 'Unknown').trim() || 'Unknown';
        const category = (p.identity.category || 'uncategorized').trim() || 'uncategorized';
        const brandId = `brand:${brand.toLowerCase()}`;
        const catId = `cat:${category.toLowerCase()}`;

        seenCategories.set(catId, (seenCategories.get(catId) || 0) + 1);
        seenBrands.set(brandId, (seenBrands.get(brandId) || 0) + 1);

        nodes.push({
            id: `prod:${id}`,
            label: p.identity.name || id,
            group: 'product',
            degree: 2,
            meta: {
                productId: id,
                brand,
                category,
                price: p.consensus?.price_retail?.v ?? null,
                stock: p.consensus?.stock?.v ?? null,
            },
        });

        links.push({
            id: `l:${id}:brand`,
            source: `prod:${id}`,
            target: brandId,
            strength: 'normal',
        });
        links.push({
            id: `l:${id}:cat`,
            source: `prod:${id}`,
            target: catId,
            strength: 'weak',
        });
    }

    for (const [catId, count] of seenCategories) {
        nodes.push({
            id: catId,
            label: catId.replace(/^cat:/, ''),
            group: 'category',
            degree: count,
        });
    }
    for (const [brandId, count] of seenBrands) {
        nodes.push({
            id: brandId,
            label: brandId.replace(/^brand:/, ''),
            group: 'brand',
            degree: count,
        });
    }

    return { nodes, links };
}
