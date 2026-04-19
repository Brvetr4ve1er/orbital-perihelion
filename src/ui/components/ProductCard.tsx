import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Product } from '../../core/schema';
import { ProductAdapter } from '../../core/product-adapter';
import { useSettings } from '../features/settings/useSettings';

interface ProductCardProps {
    product: Product;
    onClick: () => void;
    index?: number;
    inCompare?: boolean;
    onToggleCompare?: () => void;
}

// Liquid glass + Framer Motion + AOS. Designed to surface every lens
// the schema offers (identity, visual, commercial, marketing, intelligence).
export const ProductCard = ({ product, onClick, index = 0, inCompare, onToggleCompare }: ProductCardProps) => {
    const settings = useSettings();
    const layout = settings.cardLayout;
    const { currency, language } = settings.locale;

    const lp = ProductAdapter.toLegacy(product);
    const comm = lp.commercial;

    const gallery = useMemo(() => {
        const imgs: string[] = [];
        if (product.visual?.heroImage) imgs.push(product.visual.heroImage);
        for (const g of product.visual?.gallery || []) if (g && !imgs.includes(g)) imgs.push(g);
        for (const e of product.enrichment?.images || []) if (e && !imgs.includes(e)) imgs.push(e);
        return imgs;
    }, [product]);

    const [slide, setSlide] = useState(0);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => { setSlide(0); }, [product.identity.id]);

    const priceFmt = useMemo(
        () => new Intl.NumberFormat(language, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }),
        [language, currency],
    );

    const insights = product.knowledge?.insights;
    const enrichIntel = product.enrichment?.intelligence;
    const pros: string[] = insights?.pros || enrichIntel?.pros || [];
    const cons: string[] = insights?.cons || enrichIntel?.cons || [];
    const competitorPrices = product.enrichment?.competitorPrices || [];
    const cheapestComp = competitorPrices.length
        ? competitorPrices.reduce((a: any, b: any) => (a.price < b.price ? a : b))
        : null;
    const pricePosition = computePricePosition(comm.retailPrice, competitorPrices);

    const stockClass = comm.stockStatus === 'Normal'
        ? 'badge-stock'
        : comm.stockStatus === 'Faible' ? 'badge-faible' : 'badge-rupture';

    // Marketing copy from schema (unused in legacy card — now surfaced)
    const hook = (product as any).marketing?.hookLine as string | undefined;
    const tagline = (product as any).marketing?.tagline as string | undefined;

    const nextSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSlide(s => (s + 1) % gallery.length);
    };
    const prevSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSlide(s => (s - 1 + gallery.length) % gallery.length);
    };

    return (
        <motion.div
            className="product-card pc-glass"
            onClick={onClick}
            data-aos="fade-up"
            data-aos-delay={Math.min(index * 35, 350)}
            whileHover={{ y: -4, scale: 1.012 }}
            whileTap={{ scale: 0.995 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            layout
        >
            {/* liquid glass refraction layers */}
            <div className="pc-glass-sheen" aria-hidden />
            <div className="pc-glass-glow" aria-hidden />

            {layout.showImage && (
                <div className="card-image-wrap">
                    {gallery.length ? (
                        <>
                            <AnimatePresence initial={false} mode="wait">
                                <motion.img
                                    key={gallery[slide]}
                                    src={gallery[slide]}
                                    className="card-image"
                                    alt={lp.name}
                                    initial={{ opacity: 0, scale: 1.04 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </AnimatePresence>
                            {gallery.length > 1 && (
                                <>
                                    <button className="pc-slide-btn pc-slide-prev" onClick={prevSlide} aria-label="Previous">‹</button>
                                    <button className="pc-slide-btn pc-slide-next" onClick={nextSlide} aria-label="Next">›</button>
                                    <div className="pc-slide-dots">
                                        {gallery.map((_, i) => (
                                            <span key={i} className={`pc-dot ${i === slide ? 'active' : ''}`} />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="card-category-icon">{lp.category.icon}</div>
                    )}
                    {onToggleCompare && (
                        <button
                            className={`pc-compare-btn ${inCompare ? 'pc-compare-active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
                            title={inCompare ? 'Remove from compare' : 'Add to compare'}
                        >
                            {inCompare ? '✓ Compare' : '⚖ Compare'}
                        </button>
                    )}
                    <div className="card-badges">
                        {layout.showStock && <span className={`badge ${stockClass}`}>{comm.stockStatus}</span>}
                        {lp.primarySpec && <span className="badge badge-spec">{lp.primarySpec}</span>}
                        {pricePosition && (
                            <span className={`badge pc-pos pc-pos-${pricePosition}`}>
                                {pricePosition === 'budget' ? '💰 Budget' : pricePosition === 'premium' ? '👑 Premium' : '⚖︎ Midrange'}
                            </span>
                        )}
                    </div>
                    {lp.category.label && <div className="badge-panel">{lp.category.label}</div>}
                </div>
            )}

            <div className="card-body">
                <div className="card-brand">{lp.marque}</div>
                <h3 className="card-name">{lp.name}</h3>
                <div className="card-model">{lp.sku}</div>

                {layout.showMarketing && (hook || tagline) && (
                    <div className="pc-marketing" title={tagline || hook}>
                        {hook ? `✨ ${hook}` : `📣 ${tagline}`}
                    </div>
                )}

                {layout.showPrice && (
                    <div className="card-commercial">
                        <div className="card-price-row">
                            <div className="card-price">{priceFmt.format(comm.retailPrice || 0)}</div>
                            {layout.showStock && <div className="card-wholesale">Stock: {comm.stockQty}</div>}
                        </div>
                        {layout.showMarketIntel && cheapestComp && (
                            <div className="pc-market-strip" title={`Vu sur ${cheapestComp.source}`}>
                                <span className="pc-mi-label">Marché</span>
                                <span className="pc-mi-price">{priceFmt.format(cheapestComp.price)}</span>
                                <span className={`pc-mi-delta ${deltaClass(comm.retailPrice, cheapestComp.price)}`}>
                                    {deltaLabel(comm.retailPrice, cheapestComp.price)}
                                </span>
                            </div>
                        )}
                        {product.consensus?.margin && (
                            <div className="card-margin-bar">
                                <div className="margin-track">
                                    <div
                                        className="margin-fill"
                                        style={{
                                            width: `${Math.min(100, (Number(product.consensus.margin.v) / 1000) * 100)}%`,
                                            background: 'var(--accent-green, #22c55e)',
                                        }}
                                    />
                                </div>
                                <div className="margin-label">{String(product.consensus.margin.v)}</div>
                            </div>
                        )}
                    </div>
                )}

                {layout.showAIVerdict && (pros.length > 0 || cons.length > 0) && (
                    <>
                        <button
                            className="pc-expand-btn"
                            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                        >
                            <span>🧠 Verdict IA</span>
                            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>▾</motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                            {expanded && (
                                <motion.div
                                    className="pc-verdict"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22, ease: 'easeOut' }}
                                >
                                    {pros.slice(0, 3).map((p, i) => (
                                        <div key={`pro-${i}`} className="pc-verdict-row pc-pro">
                                            <span className="pc-bullet">＋</span>{p}
                                        </div>
                                    ))}
                                    {cons.slice(0, 2).map((c, i) => (
                                        <div key={`con-${i}`} className="pc-verdict-row pc-con">
                                            <span className="pc-bullet">−</span>{c}
                                        </div>
                                    ))}
                                    {(insights as any)?.fit && (
                                        <div className="pc-fit">{(insights as any).fit}</div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}

                {!layout.showAIVerdict && pros.length > 0 && (
                    <div className="feature-tag" style={{ marginTop: 8, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        🧠 {pros[0]}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ── helpers ──────────────────────────────────────────────────────────────────

function computePricePosition(
    our: number,
    competitors: Array<{ price: number }> = [],
): 'budget' | 'midrange' | 'premium' | null {
    if (!our || competitors.length === 0) return null;
    const prices = competitors.map(c => c.price).filter(p => typeof p === 'number' && p > 0);
    if (!prices.length) return null;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (our < avg * 0.9) return 'budget';
    if (our > avg * 1.1) return 'premium';
    return 'midrange';
}

function deltaClass(our: number, theirs: number): string {
    if (!our || !theirs) return '';
    const d = (our - theirs) / theirs;
    if (d > 0.05) return 'pc-mi-up';
    if (d < -0.05) return 'pc-mi-down';
    return 'pc-mi-flat';
}

function deltaLabel(our: number, theirs: number): string {
    if (!our || !theirs) return '';
    const pct = Math.round(((our - theirs) / theirs) * 100);
    if (pct === 0) return '=';
    return pct > 0 ? `+${pct}%` : `${pct}%`;
}
