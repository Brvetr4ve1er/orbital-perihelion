import React, { useMemo, useState } from 'react';
import { Product } from '../../../core/schema';

interface TreeViewProps {
    products: Product[];
    onSelect: (p: Product) => void;
}

interface BrandBucket {
    brand: string;
    products: Product[];
}

interface CategoryBucket {
    category: string;
    icon: string;
    brands: BrandBucket[];
    total: number;
}

const CATEGORY_ICONS: Record<string, string> = {
    tv: '📺',
    washing_machine: '🧺',
    fridge: '🧊',
    refrigerator: '🧊',
    mixer: '🥣',
    blender: '🥤',
    microwave: '🍱',
    oven: '🔥',
    smartphone: '📱',
    laptop: '💻',
    speaker: '🔊',
    headphones: '🎧',
    uncategorized: '📦',
};

function formatPrice(v: number | null | undefined): string {
    if (!v) return '—';
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(v);
}

export const TreeView: React.FC<TreeViewProps> = ({ products, onSelect }) => {
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
    const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());

    const tree = useMemo<CategoryBucket[]>(() => {
        const byCat = new Map<string, Map<string, Product[]>>();
        for (const p of products) {
            const cat = (p.identity?.category || 'uncategorized').toLowerCase();
            const brand = (p.identity?.brand || 'Unknown').trim() || 'Unknown';
            if (!byCat.has(cat)) byCat.set(cat, new Map());
            const brands = byCat.get(cat)!;
            if (!brands.has(brand)) brands.set(brand, []);
            brands.get(brand)!.push(p);
        }
        const out: CategoryBucket[] = [];
        for (const [cat, brands] of byCat) {
            const brandBuckets: BrandBucket[] = [];
            let total = 0;
            for (const [brand, list] of brands) {
                brandBuckets.push({ brand, products: list });
                total += list.length;
            }
            brandBuckets.sort((a, b) => b.products.length - a.products.length);
            out.push({
                category: cat,
                icon: CATEGORY_ICONS[cat] || '📦',
                brands: brandBuckets,
                total,
            });
        }
        out.sort((a, b) => b.total - a.total);
        return out;
    }, [products]);

    const toggleCat = (c: string) => {
        const next = new Set(expandedCats);
        next.has(c) ? next.delete(c) : next.add(c);
        setExpandedCats(next);
    };
    const toggleBrand = (key: string) => {
        const next = new Set(expandedBrands);
        next.has(key) ? next.delete(key) : next.add(key);
        setExpandedBrands(next);
    };

    return (
        <div className="tree-view">
            {tree.map(cat => {
                const catOpen = expandedCats.has(cat.category);
                return (
                    <div key={cat.category} className={`tree-cat ${catOpen ? 'open' : ''}`}>
                        <button
                            className="tree-row tree-row-cat"
                            onClick={() => toggleCat(cat.category)}
                        >
                            <span className="tree-chevron">{catOpen ? '▾' : '▸'}</span>
                            <span className="tree-icon">{cat.icon}</span>
                            <span className="tree-label">{cat.category}</span>
                            <span className="tree-count">{cat.total}</span>
                        </button>
                        {catOpen && (
                            <div className="tree-children">
                                {cat.brands.map(b => {
                                    const key = `${cat.category}::${b.brand}`;
                                    const brandOpen = expandedBrands.has(key);
                                    return (
                                        <div key={key} className={`tree-brand ${brandOpen ? 'open' : ''}`}>
                                            <button
                                                className="tree-row tree-row-brand"
                                                onClick={() => toggleBrand(key)}
                                            >
                                                <span className="tree-chevron">{brandOpen ? '▾' : '▸'}</span>
                                                <span className="tree-label">{b.brand}</span>
                                                <span className="tree-count">{b.products.length}</span>
                                            </button>
                                            {brandOpen && (
                                                <div className="tree-children">
                                                    {b.products.map(p => (
                                                        <button
                                                            key={p.identity.id}
                                                            className="tree-row tree-row-product"
                                                            onClick={() => onSelect(p)}
                                                        >
                                                            <span className="tree-dot">•</span>
                                                            <span className="tree-label">{p.identity.name}</span>
                                                            <span className="tree-meta">{formatPrice(p.consensus?.price_retail?.v as number)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            {tree.length === 0 && (
                <div className="tree-empty">No products to display.</div>
            )}
        </div>
    );
};
