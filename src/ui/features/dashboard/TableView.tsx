import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import { Product } from '../../../core/schema';
import { ProductAdapter } from '../../../core/product-adapter';
import { useSettings } from '../settings/useSettings';
import { inventoryStore } from '../../../state/store';
import { toasts } from '../../../services/toast';
import { confirm } from '../../components/ConfirmDialog';
import { downloadCSV, downloadShopifyCSV } from '../../../services/csv-export';
import { EnrichmentQueue } from '../../../services/enrichment-queue';
import { getVelocityMap, ProductVelocity } from '../../../services/velocity';
import { getAnalyticsMap, ProductAnalytics, ABCTier } from '../../../services/analytics';
import { Sparkline } from '../../components/Sparkline';

interface TableViewProps {
    products: Product[];
    onSelect: (p: Product) => void;
    compareIds?: string[];
    onToggleCompare?: (id: string) => void;
}

type SortDir = 'asc' | 'desc';
type SortKey = 'name' | 'brand' | 'category' | 'sku' | 'price' | 'stock' | 'margin' | 'pricePosition' | 'competitors' | 'enriched' | 'velocity' | 'daysOfCover' | 'tier' | 'revenue30d';

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
    { key: 'velocity',      label: '30d trend',   width: '100px', align: 'center' },
    { key: 'daysOfCover',   label: 'DoC',         width: '80px', align: 'right' },
    { key: 'tier',          label: 'ABC',         width: '50px', align: 'center' },
    { key: 'revenue30d',    label: 'Rev 30d',     width: '100px', align: 'right' },
    { key: 'margin',        label: 'Margin',      width: '70px', align: 'right' },
    { key: 'pricePosition', label: 'Position',    width: '90px', align: 'center' },
    { key: 'competitors',   label: 'Comp.',       width: '60px', align: 'center' },
    { key: 'enriched',      label: 'Enriched',    width: '70px', align: 'center' },
];

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
    velocity: number;
    daysOfCover: number;
    reorderSignal: ProductVelocity['reorderSignal'] | 'none';
    trend: number;
    tier: ABCTier;
    revenue30d: number;
    daily30: number[];
}

function buildRow(p: Product, v?: ProductVelocity, a?: ProductAnalytics): RowData {
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
        velocity: v?.velocity ?? 0,
        daysOfCover: Number.isFinite(v?.daysOfCover ?? Infinity) ? (v!.daysOfCover) : 9999,
        reorderSignal: v?.reorderSignal ?? 'none',
        trend: v?.trend ?? 0,
        tier: a?.tier ?? 'none',
        revenue30d: a?.revenue30d ?? 0,
        daily30: a?.daily30 ?? [],
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
const MAX_COMPARE = 4;

export const TableView = ({ products, onSelect, compareIds, onToggleCompare }: TableViewProps) => {
    const settings = useSettings();
    const { currency, language } = settings.locale;
    const parentRef = useRef<HTMLDivElement>(null);

    const [sortKey, setSortKey] = useState<SortKey>('price');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const priceFmt = useMemo(
        () => new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }),
        [language, currency],
    );

    const rows = useMemo(() => {
        const vmap = getVelocityMap(products);
        const amap = getAnalyticsMap(products);
        const data = products.map(p => buildRow(p, vmap.get(p.identity.id), amap.get(p.identity.id)));
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

    const toggleRow = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const allSelected = rows.length > 0 && selected.size === rows.length;
    const someSelected = selected.size > 0 && !allSelected;

    const toggleAll = useCallback(() => {
        setSelected(prev => {
            if (prev.size === rows.length) return new Set();
            return new Set(rows.map(r => r.product.identity.id));
        });
    }, [rows]);

    const clearSelection = useCallback(() => setSelected(new Set()), []);

    const selectedProducts = useMemo(
        () => rows.filter(r => selected.has(r.product.identity.id)).map(r => r.product),
        [rows, selected]
    );

    const handleBulkExport = () => {
        downloadCSV(selectedProducts);
        toasts.success(`Exported ${selectedProducts.length} products to CSV`);
    };

    const handleBulkShopifyExport = () => {
        downloadShopifyCSV(selectedProducts);
        toasts.success(`Exported ${selectedProducts.length} products for Shopify`);
    };

    const handleBulkEnrich = async () => {
        EnrichmentQueue.enqueueAll();
        EnrichmentQueue.start();
        toasts.info(`Enriching ${selectedProducts.length} products`, 'Check the queue panel for progress');
        clearSelection();
    };

    const handleBulkCompare = () => {
        if (!onToggleCompare) return;
        const toAdd = selectedProducts.slice(0, MAX_COMPARE - (compareIds?.length || 0));
        toAdd.forEach(p => {
            if (!compareSet.has(p.identity.id)) onToggleCompare(p.identity.id);
        });
        toasts.success(`Added ${toAdd.length} to compare`);
        clearSelection();
    };

    const handleBulkPrice = async () => {
        const raw = window.prompt(
            `Adjust price for ${selectedProducts.length} products.\nEnter a percentage (e.g. 10 = +10%, -15 = discount 15%):`,
            '0',
        );
        if (raw == null) return;
        const pct = parseFloat(raw);
        if (!Number.isFinite(pct) || pct === 0) {
            toasts.warning('No change', 'Enter a non-zero number.');
            return;
        }
        const ok = await confirm({
            title: `Apply ${pct > 0 ? '+' : ''}${pct}% to ${selectedProducts.length} products?`,
            message: pct > 0
                ? `Prices will be raised by ${pct}%.`
                : `Prices will be discounted by ${Math.abs(pct)}%.`,
            confirmLabel: 'Apply',
        });
        if (!ok) return;
        inventoryStore.bulkAdjustPrice(selectedProducts.map(p => p.identity.id), pct);
        toasts.success(`Adjusted ${selectedProducts.length} prices`);
        clearSelection();
    };

    const handleBulkDelete = async () => {
        const ok = await confirm({
            title: `Delete ${selectedProducts.length} products?`,
            message: 'This cannot be undone. Products will be removed from your catalog.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        const ids = selectedProducts.map(p => p.identity.id);
        inventoryStore.deleteProducts(ids);
        toasts.success(`Deleted ${ids.length} products`);
        clearSelection();
    };

    return (
        <div className="tv-container">
            {/* Header */}
            <div className="tv-header" style={{ gridTemplateColumns: `36px 36px ${gridTemplate}` }}>
                <div className="tv-th tv-th-check">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleAll}
                        aria-label="Select all"
                    />
                </div>
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
                <div className="tv-spacer" style={{ height: virtualizer.getTotalSize() }}>
                    {virtualizer.getVirtualItems().map(vRow => {
                        const row = rows[vRow.index];
                        const inCompare = compareSet.has(row.product.identity.id);
                        const isSelected = selected.has(row.product.identity.id);
                        return (
                            <div
                                key={row.product.identity.id}
                                className={`tv-row ${vRow.index % 2 === 0 ? 'tv-row-even' : ''} ${inCompare ? 'tv-row-compare' : ''} ${isSelected ? 'tv-row-selected' : ''}`}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: ROW_HEIGHT,
                                    transform: `translateY(${vRow.start}px)`,
                                    gridTemplateColumns: `36px 36px ${gridTemplate}`,
                                }}
                                onClick={() => onSelect(row.product)}
                            >
                                <div className="tv-td tv-td-check" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleRow(row.product.identity.id)}
                                        aria-label={`Select ${row.name}`}
                                    />
                                </div>
                                <div className="tv-td tv-td-thumb">
                                    {row.heroImage ? (
                                        <img src={row.heroImage} alt="" className="tv-thumb" loading="lazy"
                                             onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                        <span className="tv-thumb-placeholder">📦</span>
                                    )}
                                </div>
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
                                <div className="tv-td">{row.brand}</div>
                                <div className="tv-td">{row.categoryLabel}</div>
                                <div className="tv-td tv-td-mono">{row.sku}</div>
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.price > 0 ? priceFmt.format(row.price) : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    <span className={`tv-stock-dot tv-stock-${row.stockStatus === 'Normal' ? 'ok' : row.stockStatus === 'Faible' ? 'warn' : 'danger'}`} />
                                    {row.stock}
                                </div>
                                <div className="tv-td tv-td-spark" title={row.velocity > 0 ? `${row.velocity.toFixed(2)}/day · 7d: ${(row.velocity * 7).toFixed(1)} units` : 'No 30-day sales'}>
                                    {row.daily30.some(v => v > 0) ? (
                                        <>
                                            <Sparkline
                                                values={row.daily30}
                                                color={row.trend > 0.2 ? '#22c55e' : row.trend < -0.2 ? '#ef4444' : '#6366f1'}
                                                fill={row.trend > 0.2 ? 'rgba(34,197,94,0.15)' : row.trend < -0.2 ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)'}
                                            />
                                            <span className="tv-spark-label">{row.velocity.toFixed(2)}/d</span>
                                        </>
                                    ) : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.reorderSignal === 'critical' && <span className="tv-doc tv-doc-critical" title="Reorder now">🔥 {Math.round(row.daysOfCover)}d</span>}
                                    {row.reorderSignal === 'warning'  && <span className="tv-doc tv-doc-warning"  title="Reorder soon">⚠ {Math.round(row.daysOfCover)}d</span>}
                                    {row.reorderSignal === 'ok'       && (row.daysOfCover < 9999 ? `${Math.round(row.daysOfCover)}d` : '—')}
                                    {row.reorderSignal === 'dead'     && <span className="tv-doc tv-doc-dead"     title="Dead stock (no sales in 90d)">💀</span>}
                                    {row.reorderSignal === 'none'     && '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.tier !== 'none' ? (
                                        <span className={`tv-tier tv-tier-${row.tier}`} title={`ABC classification — tier ${row.tier}`}>
                                            {row.tier}
                                        </span>
                                    ) : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.revenue30d > 0 ? priceFmt.format(row.revenue30d) : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'right' }}>
                                    {row.margin > 0 ? `${row.margin}%` : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.pricePosition !== '—' ? (
                                        <span className={`tv-pos-pill tv-pos-${row.pricePosition}`}>
                                            {row.pricePosition === 'budget' ? '💰' : row.pricePosition === 'premium' ? '👑' : '⚖️'}
                                        </span>
                                    ) : '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.competitors || '—'}
                                </div>
                                <div className="tv-td" style={{ textAlign: 'center' }}>
                                    {row.enriched ? <span className="tv-enriched-check">✓</span> : <span className="tv-enriched-x">✗</span>}
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

            {/* Bulk action bar */}
            <AnimatePresence>
                {selected.size > 0 && (
                    <motion.div
                        className="bulk-bar"
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    >
                        <div className="bulk-count">
                            <strong>{selected.size}</strong> selected
                            <button className="bulk-clear" onClick={clearSelection}>Clear</button>
                        </div>
                        <div className="bulk-actions">
                            <button className="btn btn-ghost" onClick={handleBulkEnrich}>
                                ✨ Enrich
                            </button>
                            {onToggleCompare && (
                                <button className="btn btn-ghost" onClick={handleBulkCompare}
                                        disabled={(compareIds?.length || 0) >= MAX_COMPARE}>
                                    ⚖ Compare
                                </button>
                            )}
                            <button className="btn btn-ghost" onClick={handleBulkPrice}>
                                💲 Adjust price
                            </button>
                            <button className="btn btn-ghost" onClick={handleBulkExport}>
                                ⬇ Export CSV
                            </button>
                            <button className="btn btn-ghost" onClick={handleBulkShopifyExport}>
                                🛍 Shopify
                            </button>
                            <button className="btn btn-danger" onClick={handleBulkDelete}>
                                🗑 Delete
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
