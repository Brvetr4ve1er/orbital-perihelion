import { useMemo } from 'react';
import { Product } from '../../../core/schema';
import { ProductAdapter } from '../../../core/product-adapter';
import { useSettings } from '../settings/useSettings';

interface CompareViewProps {
    products: Product[];
    compareIds: string[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
    onSwitchToGrid: () => void;
}

// ── Row definitions ──────────────────────────────────────────────────────────
const ROW_DEFS: { key: string; label: string; icon: string; type: 'text' | 'numeric' | 'image' | 'list' }[] = [
    { key: 'image',        label: 'Image',         icon: '🖼',  type: 'image' },
    { key: 'brand',        label: 'Brand',         icon: '🏷',  type: 'text' },
    { key: 'model',        label: 'Model',         icon: '📐',  type: 'text' },
    { key: 'category',     label: 'Category',      icon: '📂',  type: 'text' },
    { key: 'price',        label: 'Price',         icon: '💰',  type: 'numeric' },
    { key: 'pricePos',     label: 'Price Position', icon: '📊',  type: 'text' },
    { key: 'stock',        label: 'Stock',         icon: '📦',  type: 'numeric' },
    { key: 'margin',       label: 'Margin',        icon: '📈',  type: 'numeric' },
    { key: 'specs',        label: 'Key Specs',     icon: '⚙️',  type: 'text' },
    { key: 'pros',         label: 'Pros',          icon: '✅',  type: 'list' },
    { key: 'cons',         label: 'Cons',          icon: '⚠️',  type: 'list' },
    { key: 'marketPrice',  label: 'Market Price',  icon: '🌐',  type: 'numeric' },
    { key: 'sourceCount',  label: 'Sources',       icon: '🔗',  type: 'numeric' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractRowValue(p: Product, lp: any, key: string): any {
    switch (key) {
        case 'image':       return p.visual?.heroImage || '';
        case 'brand':       return p.identity.brand;
        case 'model':       return p.identity.model;
        case 'category':    return lp.category?.label || p.identity.category;
        case 'price':       return lp.commercial.retailPrice || 0;
        case 'pricePos':    return computePricePosition(lp.commercial.retailPrice, p.enrichment?.competitorPrices || []);
        case 'stock':       return lp.commercial.stockQty || 0;
        case 'margin':      return lp.commercial.margin || 0;
        case 'specs': {
            const qs = p.technical?.quickSpecs;
            const parts: string[] = [];
            if (qs?.screenSize)   parts.push(`${qs.screenSize}"`);
            if (qs?.panelType)    parts.push(qs.panelType);
            if (qs?.refreshRate)  parts.push(qs.refreshRate);
            return parts.join(' • ') || '—';
        }
        case 'pros':        return (p.knowledge?.insights?.pros || p.enrichment?.intelligence?.pros || []);
        case 'cons':        return (p.knowledge?.insights?.cons || p.enrichment?.intelligence?.cons || []);
        case 'marketPrice': {
            const cp = p.enrichment?.competitorPrices || [];
            if (!cp.length) return null;
            return Math.min(...cp.map((c: any) => c.price).filter((x: any) => typeof x === 'number' && x > 0));
        }
        case 'sourceCount': return (p.enrichment?.sources || []).length;
        default:            return '—';
    }
}

function computePricePosition(our: number, comps: any[]): string | null {
    if (!our || !comps?.length) return null;
    const prices = comps.map((c: any) => c.price).filter((p: number) => typeof p === 'number' && p > 0);
    if (!prices.length) return null;
    const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    if (our < avg * 0.9) return 'budget';
    if (our > avg * 1.1) return 'premium';
    return 'midrange';
}

function highlightNumeric(values: (number | null)[]): ('min' | 'max' | 'mid' | 'na')[] {
    const nums = values.filter((v): v is number => typeof v === 'number' && v > 0);
    if (nums.length < 2) return values.map(() => 'na');
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return values.map(v => {
        if (typeof v !== 'number' || v <= 0) return 'na';
        if (v === min) return 'min';
        if (v === max) return 'max';
        return 'mid';
    });
}

// ── Component ────────────────────────────────────────────────────────────────

export const CompareView = ({
    products,
    compareIds,
    onRemove,
    onClearAll,
    onSwitchToGrid,
}: CompareViewProps) => {
    const settings = useSettings();
    const { currency, language } = settings.locale;

    const priceFmt = useMemo(
        () => new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }),
        [language, currency],
    );

    const selected = useMemo(
        () => compareIds
            .map(id => products.find(p => p.identity.id === id))
            .filter((p): p is Product => !!p),
        [products, compareIds],
    );

    const legacies = useMemo(
        () => selected.map(p => ProductAdapter.toLegacy(p)),
        [selected],
    );

    // ── Not enough products ──
    if (selected.length < 2) {
        return (
            <div className="cmp-empty">
                <div className="cmp-empty-icon">⚖️</div>
                <h3>Compare Products</h3>
                <p>Select 2–4 products from the grid to compare them side by side.</p>
                <p className="cmp-empty-count">
                    {compareIds.length === 0
                        ? 'No products selected yet.'
                        : `${compareIds.length} product selected — need at least 2.`}
                </p>
                <button className="cmp-cta" onClick={onSwitchToGrid}>
                    ▦ Pick from Grid
                </button>
            </div>
        );
    }

    const n = selected.length;

    return (
        <div className="cmp-wrap">
            <div className="cmp-toolbar">
                <span className="cmp-toolbar-label">Comparing {n} products</span>
                <button className="cmp-clear-btn" onClick={onClearAll}>
                    ✕ Clear All
                </button>
            </div>

            <div className="cmp-grid" style={{ '--n': n } as React.CSSProperties}>
                {/* Header row — product thumbnails + names */}
                <div className="cmp-row cmp-header-row">
                    <div className="cmp-label-col" />
                    {selected.map((p) => (
                        <div key={p.identity.id} className="cmp-cell cmp-header-cell">
                            {p.visual?.heroImage && (
                                <img
                                    src={p.visual.heroImage}
                                    alt={p.identity.name}
                                    className="cmp-header-img"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <div className="cmp-header-name">{p.identity.name}</div>
                            <button
                                className="cmp-remove-btn"
                                onClick={() => onRemove(p.identity.id)}
                                title="Remove from comparison"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>

                {/* Data rows */}
                {ROW_DEFS.filter(r => r.key !== 'image').map(row => {
                    const values = selected.map((p, i) => extractRowValue(p, legacies[i], row.key));
                    const isNumeric = row.type === 'numeric';
                    const highlights = isNumeric ? highlightNumeric(values as number[]) : [];
                    const distinctValues = new Set(values.map(v => JSON.stringify(v)));
                    const isDiff = distinctValues.size > 1;

                    return (
                        <div key={row.key} className={`cmp-row ${isDiff ? 'cmp-diff' : ''}`}>
                            <div className="cmp-label-col">
                                <span className="cmp-label-icon">{row.icon}</span>
                                <span>{row.label}</span>
                            </div>
                            {values.map((val, i) => {
                                const hl = isNumeric ? highlights[i] : 'na';
                                return (
                                    <div
                                        key={i}
                                        className={`cmp-cell ${hl === 'min' ? 'cmp-hl-min' : hl === 'max' ? 'cmp-hl-max' : ''}`}
                                    >
                                        {row.type === 'list' ? (
                                            <ul className="cmp-list">
                                                {(Array.isArray(val) ? val : []).slice(0, 3).map((item: string, j: number) => (
                                                    <li key={j}>{item}</li>
                                                ))}
                                                {(!val || (Array.isArray(val) && val.length === 0)) && <span className="cmp-na">—</span>}
                                            </ul>
                                        ) : row.key === 'price' || row.key === 'marketPrice' ? (
                                            <span className="cmp-value-num">
                                                {typeof val === 'number' && val > 0 ? priceFmt.format(val) : '—'}
                                            </span>
                                        ) : row.key === 'margin' ? (
                                            <span className="cmp-value-num">{val}%</span>
                                        ) : row.key === 'pricePos' ? (
                                            val ? (
                                                <span className={`cmp-pos-pill cmp-pos-${val}`}>
                                                    {val === 'budget' ? '💰 Budget' : val === 'premium' ? '👑 Premium' : '⚖️ Midrange'}
                                                </span>
                                            ) : <span className="cmp-na">—</span>
                                        ) : (
                                            <span>{val != null ? String(val) : '—'}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
