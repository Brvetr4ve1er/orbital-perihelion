import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Product } from '../../../core/schema';
import { ProductAdapter } from '../../../core/product-adapter';
import { useSettings } from '../settings/useSettings';

interface TableViewProps {
    products: Product[];
    onSelect: (p: Product) => void;
    compareIds?: string[];
    onToggleCompare?: (id: string) => void;
}

type SortDir = 'asc' | 'desc';
type SortKey = 'name' | 'brand' | 'category' | 'sku' | 'price' | 'stock' | 'margin' | 'pricePosition' | 'competitors' | 'enriched';

interface ColumnDef {
    key: SortKey;
    label: string;
    width: string;
    align?: 'left' | 'right' | 'center';
}

const COLUMNS: ColumnDef[] = [
    { key: 'name',          label: 'Product',     width: 'minmax(200px, 2fr)' },
    { key: 'brand',         label: 'Brand',       width: 'minmax(90px, 1fr)' },
    { key: 'category',      label: 'Category',    width: 'minmax(100px, 1fr)' },
    { key: 'sku',           label: 'SKU',         width: 'minmax(80px, 1fr)' },
    { key: 'price',         label: 'Price',       width: '110px', align: 'right' },
    { key: 'stock',         label: 'Stock',       width: '70px', align: 'right' },
    { key: 'margin',        label: 'Margin',      width: '70px', align: 'right' },
    { key: 'pricePosition', label: 'Position',    width: '90px', align: 'center' },
    { key: 'competitors',   label: 'Comp.',       width: '60px', align: 'center' },
    { key: 'enriched',      label: 'Enriched',    width: '70px', align: 'center' },
];

// ── Precompute sortable row data ───────────────────────────────────────
interface RowData {
    product: Product;
    name: string;
    brand: string;
    category: string;
    categoryLabel: string;
    sku: string;
    price: number;
    stock: number;
    margin: number;
    pricePosition: string;
    competitors: number;
    enriched: boolean;
    heroImage: string;
    stockStatus: string;
}

function buildRow(p: Product): RowData {
    const lp = ProductAdapter.toLegacy(p);
    const compPrices = p.enrichment?.competitorPrices || [];
    return {
        product: p,
        name: p.identity.name,
        brand: p.identity.brand,
        category: p.identity.category,
        categoryLabel: lp.category?.label || p.identity.category,
        sku: p.identity.sku || '',
        price: lp.commercial.retailPrice || 0,
        stock: lp.commercial.stockQty || 0,
        margin: lp.commercial.margin || 0,
        pricePosition: computePP(lp.commercial.retailPrice, compPrices),
        competitors: compPrices.length,
        enriched: !!(p.enrichment?.competitorPrices?.length || p.enrichment?.intelligence || p.knowledge?.insights),
        heroImage: p.visual?.heroImage || '',
        stockStatus: lp.commercial.stockStatus,
    };
}

function computePP(our: number, comps: any[]): string {
    if (!our || !comps?.length) return '—';
    const prices = comps.map((c: any) => c.price).filter((x: number) => typeof x === 'number' && x > 0);
    if (!prices.length) return '—';
    const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    if (our < avg * 0.9) return 'budget';
    if (our > avg * 1.1) return 'premium';
    return 'midrange';
}

const ROW_HEIGHT = 44;

export const TableView = ({ products, onSelect, compareIds, onToggleCompare }: TableViewProps) => {
    const settings = useSettings();
    const { currency, language } = settings.locale;
    const parentRef = useRef<HTMLDivElement>(null);

    const [sortKey, setSortKey] = useState<SortKey>('price');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const priceFmt = useMemo(
        () => new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }),
        [language, currency],
    );

    // Build + sort rows
    const rows = useMemo(() => {
        const data = products.map(buildRow);
        data.sort((a, b) => {
            let av: any = (a as any)[sortKey];
            let bv: any = (b as any)[sortKey];
            if (typeof av === 'string') av = av.toLowerCase();
            if (typeof bv === 'string') bv = bv.toLowerCase();
            if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [products, sortKey, sortDir]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 12,
    });

    const handleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return key;
            }
            setSortDir('desc');
            return key;
        });
    }, []);

    const gridTemplate = COLUMNS.map(c => c.width).join(' ');
    const compareSet = useMemo(() => new Set(compareIds || []), [compareIds]);

    return (
        <div className="tv-container">
            {/* Header */}
            <div className="tv-header" style={{ gridTemplateColumns: `36px ${gridTemplate}` }}>
                <div className="tv-th tv-th-check">#</div>
                {COLUMNS.map(col => (
                    <div
                        key={col.key}
                        className={`tv-th ${sortKey === col.key ? 'tv-th-active' : ''}`}
                        style={{ textAlign: col.align || 'left' }}
                        onClick={() => handleSort(col.key)}
                    >
                        {col.label}
                        {sortKey === col.key && (
                            <span className="tv-sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                    </div>
                ))}
            </div>

            {/* Virtualized body */}
            <div ref={parentRef} className="tv-body">
                <div
                    className="tv-spacer"
                    style={{ height: virtualizer.getTotalSize() }}
                >
                    {virtualizer.getVirtualItems().map(vRow => {
                        const row = rows[vRow.index];
                        const inCompare = compareSet.has(row.product.identity.id);
                        return (
                            <div
                                key={row.product.identity.id}
                                className={`tv-row ${vRow.index % 2 === 0 ? 'tv-row-even' : ''} ${inCompare ? 'tv-row-compare' : ''}`}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: ROW_HEIGHT,
                                    transform: `translateY(${vRow.start}px)`,
                                    gridTemplateColumns: `36px ${gridTemplate}`,
                                }}
                                onClick={() => onSelect(row.product)}
                            >
                                {/* Thumbnail */}
                                <div className="tv-td tv-td-thumb">
                                    {row.heroImage ? (
                                        <img
                                            src={row.heroImage}
                                            alt=""
                                            className="tv-thumb"
                                            loading="lazy"
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <span className="tv-thumb-placeholder">📦</span>
                                    )}
                                </div>

                                {/* Name */}
                                <div className="tv-td tv-td-name">
                                    <span className="tv-name-text">{row.name}</span>
                                    {onToggleCompare && (
                                        <button
                                            className={`tv-cmp-btn ${inCompare ? 'tv-cmp-active' : ''}`}
                                            onClick={e => { e.stopPropagation(); onToggleCompare(row.product.identity.id); }}
                                            title={inCompare ? 'Remove from compare' : 'Add to compare'}
                                        >
                                            {inCompare ? '✓' : '⚖'}
                                        </button>
                                    )}
                                </div>

                                {/* Brand */}
                                <div className="tv-td">{row.brand}</div>

                                {/* Category */}
                                <div className="tv-td">{row.categoryLabel}</div>

                                {/* SKU */}
                                <div className="tv-td tv-td-mono">{row.sku}</div>

                                {/* Price */}
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.price > 0 ? priceFmt.format(row.price) : '—'}
                                </div>

                                {/* Stock */}
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    <span className={`tv-stock-dot tv-stock-${row.stockStatus === 'Normal' ? 'ok' : row.stockStatus === 'Faible' ? 'warn' : 'danger'}`} />
                                    {row.stock}
                                </div>

                                {/* Margin */}
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.margin > 0 ? `${row.margin}%` : '—'}
                                </div>

                                {/* Price position */}
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.pricePosition !== '—' ? (
                                        <span className={`tv-pos-pill tv-pos-${row.pricePosition}`}>
                                            {row.pricePosition === 'budget' ? '💰' : row.pricePosition === 'premium' ? '👑' : '⚖️'}
                                        </span>
                                    ) : '—'}
                                </div>

                                {/* Competitors */}
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.competitors || '—'}
                                </div>

                                {/* Enriched */}
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.enriched ? (
                                        <span className="tv-enriched-check">✓</span>
                                    ) : (
                                        <span className="tv-enriched-x">✗</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="tv-footer">
                <span>{rows.length} products</span>
                <span className="tv-footer-sort">
                    Sorted by <strong>{COLUMNS.find(c => c.key === sortKey)?.label}</strong> {sortDir === 'asc' ? '↑' : '↓'}
                </span>
            </div>
        </div>
    );
};
