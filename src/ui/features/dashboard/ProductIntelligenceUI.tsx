import React, { useMemo, useState } from 'react';
import { Product } from '../../../core/schema';
import { ProductAdapter } from '../../../core/product-adapter';
import { LLMService } from '../../../services/llm';
import { inventoryStore } from '../../../state/store';

/**
 * Adaptive UI Component for PKOS - Powered by Tambo AI.
 */

const SpecsBlock = ({ specs }: { specs: Record<string, any> }) => (
    <div className="modal-section" style={{ marginBottom: '24px' }}>
        <div className="modal-section-title" style={{ fontSize: '0.75rem', color: '#9898a8', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>⚙️ Spécifications Techniques</div>
        <div className="modal-specs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {Object.entries(specs).map(([k, v]) => (
                <div key={k} className="modal-spec">
                    <div className="modal-spec-label" style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase' }}>{k}</div>
                    <div className="modal-spec-value" style={{ fontWeight: 600 }}>{String(v)}</div>
                </div>
            ))}
        </div>
    </div>
);

const InsightsBlock = ({ pros, cons, buyerFit }: { pros: string[], cons: string[], buyerFit: string }) => (
    <div className="modal-section" style={{ marginBottom: '24px' }}>
        <div className="modal-section-title" style={{ fontSize: '0.75rem', color: '#9898a8', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>🤖 Analyse Intelligence</div>
        <div className="intel-buyer-fit" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(124, 77, 255, 0.05)', border: '1px solid rgba(124, 77, 255, 0.1)', marginBottom: '12px' }}>
            <div className="intel-buyer-label" style={{ fontSize: '0.65rem', color: '#7c4dff', textTransform: 'uppercase', marginBottom: '4px' }}>Verdict</div>
            <div className="intel-buyer-text" style={{ fontSize: '0.9rem', color: '#fff' }}>{buyerFit}</div>
        </div>
        <div className="pros-cons-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="pros-panel" style={{ padding: '12px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.05)' }}>
                <div className="pros-title" style={{ color: '#22c55e', fontWeight: 700, marginBottom: '8px' }}>✅ Avantages</div>
                {pros.map((x, i) => <div key={i} style={{ fontSize: '0.85rem', marginBottom: '4px' }}>✔ {x}</div>)}
            </div>
            <div className="cons-panel" style={{ padding: '12px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)' }}>
                <div className="cons-title" style={{ color: '#ef4444', fontWeight: 700, marginBottom: '8px' }}>⚠️ Faiblesses</div>
                {cons.map((x, i) => <div key={i} style={{ fontSize: '0.85rem', marginBottom: '4px' }}>✖ {x}</div>)}
            </div>
        </div>
    </div>
);

const PricingBlock = ({ prices, retailPrice }: { prices: any[], retailPrice: number }) => (
    <div className="modal-section" style={{ marginBottom: '24px' }}>
        <div className="modal-section-title" style={{ fontSize: '0.75rem', color: '#9898a8', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
            📊 Prix Concurrence 
            <span className="enriched-badge" style={{ background: '#7c4dff', color: '#fff', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>IA Web Scraping</span>
        </div>
        <div className="competitor-table" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="comp-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 16px', background: 'rgba(255,255,255,0.05)', fontSize: '0.7rem', color: '#888' }}>
                <span>Source</span><span>Prix</span><span>Écart</span>
            </div>
            {prices.map((c, i) => {
                const diff = retailPrice - c.price;
                const pct = retailPrice > 0 ? Math.round(diff / retailPrice * 100) : 0;
                return (
                    <div key={i} className="comp-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', alignItems: 'center' }}>
                        <span>{c.source}</span>
                        <span style={{ fontWeight: 600 }}>{new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(c.price)}</span>
                        <span style={{ color: diff > 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{diff > 0 ? '+' : ''}{pct}%</span>
                    </div>
                );
            })}
        </div>
    </div>
);

export const ProductIntelligenceUI = ({ product }: { product: Product }) => {
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichError, setEnrichError] = useState<string | null>(null);

    const lp = ProductAdapter.toLegacy(product);
    const enrichment = product.knowledge?.insights;
    const competitorPrices = product.enrichment?.competitorPrices;
    const consensusSpecs = product.consensus;

    const thickness = useMemo(() => {
        let score = 0;
        if (product.identity.id) score++;
        if (consensusSpecs && Object.keys(consensusSpecs).length > 5) score++;
        if (enrichment) score++;
        if (product.enrichment?.competitorPrices && product.enrichment.competitorPrices.length > 0) score++;
        return Math.min(score, 3);
    }, [product, enrichment, consensusSpecs]);

    const formattedPrice = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(lp.commercial.retailPrice);

    const handleEnrich = async () => {
        setIsEnriching(true);
        setEnrichError(null);
        try {
            const result = await LLMService.enrichProduct(product);
            
            // Map the LLM JSON into the product schema
            const updated = { ...product };
            updated.knowledge = updated.knowledge || {};
            updated.knowledge.insights = result.ai_insights || {};
            
            updated.enrichment = updated.enrichment || {};
            if (result.competitorPrices) {
                updated.enrichment.competitorPrices = result.competitorPrices;
            }
            if (result.description) {
                updated.enrichment.seoDescription = result.description;
            }
            if (result.specs) {
                updated.consensus = updated.consensus || {};
                Object.entries(result.specs).forEach(([k, v]) => {
                    updated.consensus![k] = { v, c: 0.9, flag: 'llm_verified' };
                });
            }

            // Persist back to the store
            inventoryStore.updateProduct(updated);
        } catch (err: any) {
            console.error(err);
            setEnrichError(err.message || 'Erreur LLM');
        } finally {
            setIsEnriching(false);
        }
    };

    return (
        <div className="tambo-adaptive-container" style={{ color: '#fff' }}>
            
            {/* Header / Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{lp.name}</h2>
                <button 
                    onClick={handleEnrich} 
                    disabled={isEnriching}
                    style={{ background: '#7c4dff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: isEnriching ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: isEnriching ? 0.7 : 1 }}>
                    {isEnriching ? '⏳ Analyse en cours...' : '🔍 Enrichir avec l\'IA'}
                </button>
            </div>
            
            {enrichError && (
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
                    ⚠️ {enrichError}
                </div>
            )}
            {/* Image Showcase */}
            {product.enrichment?.images && product.enrichment.images.length > 0 && (
                <div className="modal-image-showcase" style={{ marginBottom: '24px', borderRadius: '16px', overflow: 'hidden', height: '220px', background: '#000', position: 'relative' }}>
                    <img
                        src={product.enrichment.images[0]}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        alt={lp.name}
                    />
                </div>
            )}

            {/* Identity Header */}
            <div className="modal-section" style={{ marginBottom: '24px' }}>
                <div className="modal-section-title" style={{ fontSize: '0.75rem', color: '#9898a8', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                    📋 Identité Produit
                </div>
                <div className="modal-specs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div className="modal-spec">
                        <div className="modal-spec-label">Catégorie</div>
                        <div className="modal-spec-value">{lp.category.icon} {lp.category.label}</div>
                    </div>
                    <div className="modal-spec">
                        <div className="modal-spec-label">Marque</div>
                        <div className="modal-spec-value highlight">{lp.marque}</div>
                    </div>
                    <div className="modal-spec">
                        <div className="modal-spec-label">SKU</div>
                        <div className="modal-spec-value">{lp.sku}</div>
                    </div>
                    {product.enrichment?.barcode && (
                        <div className="modal-spec">
                            <div className="modal-spec-label">Code Barre / EAN</div>
                            <div className="modal-spec-value" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{product.enrichment.barcode}</div>
                        </div>
                    )}
                    {product.enrichment?.mpn && product.enrichment.mpn !== lp.sku && (
                        <div className="modal-spec">
                            <div className="modal-spec-label">Référence Fabricant</div>
                            <div className="modal-spec-value" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{product.enrichment.mpn}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Commercial Info */}
            <div className="modal-section" style={{ marginBottom: '24px' }}>
                <div className="modal-section-title">💰 Information Commerciale</div>
                <div className="commercial-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="comm-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="comm-label">Prix Détail</div>
                        <div className="comm-value comm-big" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formattedPrice}</div>
                    </div>
                    <div className="comm-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="comm-label">Marge</div>
                        <div className="comm-value comm-big" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{lp.commercial.margin}%</div>
                    </div>
                </div>
            </div>

            {/* Intelligence Section */}
            {enrichment && (
                <div style={{ border: '1px solid rgba(124, 77, 255, 0.15)', borderRadius: '16px', padding: '16px', marginBottom: '16px', background: 'rgba(124, 77, 255, 0.03)' }}>
                    <InsightsBlock
                        pros={enrichment.pros}
                        cons={enrichment.cons}
                        buyerFit={enrichment.fit}
                    />
                </div>
            )}

            {/* Specs Section */}
            {consensusSpecs && (
                <div style={{ border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <SpecsBlock specs={Object.fromEntries(Object.entries(consensusSpecs).map(([k, v]) => [k, (v as any).v]))} />
                </div>
            )}

            {/* Competitor Prices */}
            {competitorPrices && competitorPrices.length > 0 && (
                <PricingBlock prices={competitorPrices} retailPrice={lp.commercial.retailPrice} />
            )}
        </div>
    );
};
