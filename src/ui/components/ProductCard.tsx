import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../../core/schema';
import { useSettings } from '../features/settings/useSettings';
import { ProductAdapter } from '../../core/product-adapter';
import { Sparkline } from './Sparkline';

/** Convert ALL CAPS or mixed text to Title Case */
const titleCase = (s: string) =>
    s.toLowerCase().replace(/(?:^|\s|[-/])\S/g, c => c.toUpperCase());

interface ProductCardProps {
    product: Product;
    onClick: () => void;
    index?: number;
    inCompare?: boolean;
    onToggleCompare?: () => void;
}

/**
 * Product Card — dense commerce-grade tile.
 * Collapsed: scan-view (image, name, price, stock, 4 chips).
 * Expanded : full intelligence readout (specs, pros/cons, competitor prices, sources).
 *
 * Wrapped in React.memo with a custom comparator to prevent unnecessary re-renders
 * during batch AI enrichment (only the card whose product changed will re-render).
 */
const ProductCardInner = ({ product, onClick, index = 0, inCompare, onToggleCompare }: ProductCardProps) => {
    const settings = useSettings();
    const { currency, language } = settings.locale || { currency: 'DZD', language: 'fr-DZ' };
    const { cardLayout } = settings;
    const [expanded, setExpanded] = useState(false);

    const id = product.identity || ({} as any);
    const comm = product.commercial || ({} as any);
    const enrich = product.enrichment || ({} as any);
    const intel = enrich?.intelligence || product.knowledge?.insights;
    const tech = product.technical || ({} as any);

    const retailPrice = comm.priceRange?.typical || 0;
    const stockQty = (product.observations?.stock?.[0]?.v as number) ?? 0;
    const stockStatus = stockQty > 5 ? 'in-stock' : stockQty > 0 ? 'low-stock' : 'out-of-stock';
    const stockLabel = stockQty > 5 ? 'En stock' : stockQty > 0 ? 'Stock faible' : 'Rupture';

    const priceFmt = useMemo(
        () => new Intl.NumberFormat(language, {
            style: 'currency',
            currency: comm.priceRange?.currency || currency,
            maximumFractionDigits: 0,
        }),
        [language, currency, comm.priceRange?.currency],
    );

    const catLabel = ProductAdapter._categoryLabel(id?.category || 'other');
    const heroImage = product.visual?.heroImage || (enrich?.images && enrich.images[0]);

    // ── Competitor-price delta (if enriched) ──────────────────────────────────
    const priceDelta = useMemo(() => {
        const cps = (enrich?.competitorPrices || []).map((c: any) => Number(c.price)).filter((n: number) => Number.isFinite(n) && n > 0);
        if (!cps.length || !retailPrice) return null;
        const avg = cps.reduce((a: number, b: number) => a + b, 0) / cps.length;
        const diff = ((retailPrice - avg) / avg) * 100;
        return { avg, diff, n: cps.length };
    }, [enrich?.competitorPrices, retailPrice]);

    // ── Scan-strip chips (max 4) ──────────────────────────────────────────────
    const chips = useMemo(() => {
        const c: Array<{ label: string; type: string; title?: string }> = [];
        if (id.category) c.push({ label: catLabel, type: 'category' });
        if (id.brand) c.push({ label: id.brand, type: 'brand' });
        if (cardLayout.showSpecs && tech?.quickSpecs?.screenSize) c.push({ label: `${tech.quickSpecs.screenSize}"`, type: 'spec' });
        if (cardLayout.showMarketIntel && priceDelta) {
            const up = priceDelta.diff > 3;
            const down = priceDelta.diff < -3;
            c.push({
                label: `${up ? '▲' : down ? '▼' : '●'} ${Math.abs(priceDelta.diff).toFixed(0)}% vs marché`,
                type: up ? 'price-up' : down ? 'price-down' : 'price-fair',
                title: `Moy. marché : ${priceFmt.format(priceDelta.avg)} sur ${priceDelta.n} source${priceDelta.n > 1 ? 's' : ''}`,
            });
        } else if (cardLayout.showStock) {
            c.push({ label: `${stockQty} unité${stockQty !== 1 ? 's' : ''}`, type: 'stock' });
        }
        return c.slice(0, 4);
    }, [id, catLabel, tech, stockQty, priceDelta, priceFmt, cardLayout]);

    const hasIntel = !!(intel?.pros?.length || intel?.cons?.length || enrich?.description || enrich?.seoDescription);
    const sourceCount = enrich?.sources?.length || 0;
    const competitorCount = enrich?.competitorPrices?.length || 0;

    // Stock percentile bar (0–20 units = 0–100%)
    const stockPct = Math.min(100, (stockQty / 20) * 100);

    // ── Sales intelligence — lifted to parent, passed as props ────────────
    const { velocity, analytics } = product as any;
    const showSalesRow = cardLayout.showStock && (!!velocity || !!analytics);

    return (
        <motion.div
            className={`product-card-scan-layer ${expanded ? 'expanded' : ''} ${inCompare ? 'in-compare' : ''}`}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.3), type: 'spring', stiffness: 260, damping: 28 }}
            whileHover={{ y: -3 }}
        >
            {/* TOP — clickable to open modal */}
            <div className="card-top" onClick={onClick} style={{ cursor: 'pointer' }}>
                <div className="card-image-container">
                    {cardLayout.showImage && heroImage ? (
                        <img src={heroImage} alt={id?.name || 'Produit'} className="card-scan-img" loading="lazy" />
                    ) : (
                        <div className="card-scan-fallback" title={catLabel}>{ProductAdapter._categoryIcon(id?.category || 'other')}</div>
                    ) }
                </div>
                {cardLayout.showStock && (
                    <div className={`scan-status-badge ${stockStatus}`}>{stockLabel}</div>
                )}
                {cardLayout.showAIVerdict && (enrich?.intelligence || product.knowledge?.insights) && (
                    <div className="scan-ai-badge" title="Enrichi par IA">IA</div>
                )}
            </div>

            {/* CORE */}
            <div className="card-core" onClick={onClick} style={{ cursor: 'pointer' }}>
                <h3 className="scan-name" title={id?.name || 'Sans nom'}>{titleCase(id?.name || 'Sans nom')}</h3>
                <div className="scan-price-sku">
                    {cardLayout.showPrice && <span className="scan-price">{priceFmt.format(retailPrice)}</span>}
                    <span className="scan-sku">{id.sku || id.model || '—'}</span>
                </div>
                {/* Stock bar */}
                {cardLayout.showStock && (
                    <div className="scan-stock-bar" title={`${stockQty} unité${stockQty !== 1 ? 's' : ''}`}>
                        <div className={`scan-stock-fill ${stockStatus}`} style={{ width: `${stockPct}%` }} />
                    </div>
                )}

                {/* Sales intelligence row — only when sales data exists */}
                {showSalesRow && (
                    <div className="scan-sales-row">
                        {analytics?.tier && analytics.tier !== 'none' && (
                            <span className={`scan-tier tv-tier-${analytics.tier}`} title={`Tier ABC ${analytics.tier}`}>
                                {analytics.tier}
                            </span>
                        )}
                        {velocity && velocity.velocity > 0 && (
                            <span className="scan-velocity" title={`${velocity.velocity.toFixed(2)} unités/jour`}>
                                {velocity.velocity.toFixed(1)}/j
                            </span>
                        )}
                        {velocity?.reorderSignal === 'critical' && (
                            <span className="scan-doc tv-doc-critical">{Math.round(velocity.daysOfCover)}j couverture</span>
                        )}
                        {velocity?.reorderSignal === 'warning' && (
                            <span className="scan-doc tv-doc-warning">{Math.round(velocity.daysOfCover)}j couverture</span>
                        )}
                        {velocity?.reorderSignal === 'dead' && (
                            <span className="scan-doc tv-doc-dead">Inactif</span>
                        )}
                        {analytics?.daily30?.some((v: number) => v > 0) && (
                            <div className="scan-spark-wrap">
                                <Sparkline
                                    values={analytics.daily30}
                                    width={60}
                                    height={16}
                                    color={velocity && velocity.trend > 0.2 ? '#22c55e' : velocity && velocity.trend < -0.2 ? '#ef4444' : '#6366f1'}
                                    fill={velocity && velocity.trend > 0.2 ? 'rgba(34,197,94,0.18)' : velocity && velocity.trend < -0.2 ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.18)'}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* METADATA STRIP */}
            <div className="scan-metadata-strip">
                {chips.map((chip, i) => (
                    <span key={i} className={`scan-chip chip-${chip.type}`} title={chip.title}>
                        {chip.label}
                    </span>
                ))}
            </div>

            {/* EXPANDABLE INTELLIGENCE */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        className="scan-expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {cardLayout.showMarketing && (enrich?.description || enrich?.seoDescription) && (
                            <p className="scan-desc">{enrich.seoDescription || enrich.description}</p>
                        )}
                        {cardLayout.showAIVerdict && intel?.pros && intel.pros.length > 0 && (
                            <div className="scan-pros">
                                {intel.pros.slice(0, 3).map((p: string, i: number) => <span key={i}>✓ {p}</span>)}
                            </div>
                        )}
                        {cardLayout.showAIVerdict && intel?.cons && intel.cons.length > 0 && (
                            <div className="scan-cons">
                                {intel.cons.slice(0, 2).map((p: string, i: number) => <span key={i}>— {p}</span>)}
                            </div>
                        )}
                        {cardLayout.showMarketIntel && competitorCount > 0 && (
                            <div className="scan-market">
                                {competitorCount} prix concurrent{competitorCount > 1 ? 's' : ''}
                                {sourceCount > 0 && ` · ${sourceCount} source${sourceCount > 1 ? 's' : ''}`}
                            </div>
                        )}
                        {cardLayout.showSpecs && tech?.quickSpecs && (tech.quickSpecs.screenSize || tech.quickSpecs.refreshRate) && (
                            <div className="scan-specs">
                                {tech.quickSpecs.screenSize && <span>{tech.quickSpecs.screenSize}"</span>}
                                {tech.quickSpecs.refreshRate && <span>{tech.quickSpecs.refreshRate}</span>}
                                {tech.quickSpecs.resolution?.label && <span>{tech.quickSpecs.resolution.label}</span>}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ACTIONS — separated clearly */}
            <div className="scan-action-zone">
                <button
                    className={`scan-action-btn ${inCompare ? 'scan-action-active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleCompare?.(); }}
                >
                    {inCompare ? '✓ Sélectionné' : 'Comparer'}
                </button>
                {hasIntel && (
                    <button
                        className="scan-action-btn"
                        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                        title={expanded ? 'Réduire' : 'Afficher les détails IA'}
                    >
                        {expanded ? '▲ Moins' : '▼ Plus'}
                    </button>
                )}
                <button className="scan-action-btn primary" onClick={(e) => { e.stopPropagation(); onClick(); }}>
                    Détails
                </button>
            </div>
        </motion.div>
    );
};

/**
 * Custom comparator for React.memo.
 * Only re-renders when meaningful product data changes, not on every store tick.
 */
function arePropsEqual(prev: ProductCardProps, next: ProductCardProps): boolean {
    // Different product entirely
    if (prev.product.identity.id !== next.product.identity.id) return false;
    // Compare toggle changed
    if (prev.inCompare !== next.inCompare) return false;
    // Product was updated (lastUpdated is bumped by SchemaMapper on enrichment)
    if (prev.product.identity.lastUpdated !== next.product.identity.lastUpdated) return false;
    // Enrichment data appeared or changed
    const prevEnriched = !!(prev.product.enrichment?.competitorPrices?.length);
    const nextEnriched = !!(next.product.enrichment?.competitorPrices?.length);
    if (prevEnriched !== nextEnriched) return false;
    // Price changed
    if (prev.product.commercial?.priceRange?.typical !== next.product.commercial?.priceRange?.typical) return false;
    // Everything else is the same — skip re-render
    return true;
}

export const ProductCard = React.memo(ProductCardInner, arePropsEqual);
