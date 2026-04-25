import React, { useState, useMemo } from 'react';
import { Product } from '../../../core/schema';
import { getSalesKPIs } from '../../../services/analytics';
import { getVelocityMap } from '../../../services/velocity';

interface EcommercePanelProps {
    products: Product[];
}

export const EcommercePanel = ({ products }: EcommercePanelProps) => {
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;

    // Real metrics from analytics engine
    const kpis = useMemo(() => getSalesKPIs(products), [products]);
    const velMap = useMemo(() => getVelocityMap(products), [products]);

    // Products ready to push: have hero image OR AI-enriched description
    const readyToSync = useMemo(
        () => products.filter(p => p.visual?.heroImage || p.enrichment?.intelligence || p.enrichment?.description),
        [products]
    );

    // Low-stock products: critical or warning signal
    const lowStockCount = useMemo(() => {
        let count = 0;
        for (const [, v] of velMap) {
            if (v.reorderSignal === 'critical' || v.reorderSignal === 'warning') count++;
        }
        return count;
    }, [velMap]);

    const pageCount = Math.ceil(readyToSync.length / PAGE_SIZE);
    const visibleRows = readyToSync.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const fmtDZD = (n: number) => n > 0 ? `${Math.round(n).toLocaleString('fr-DZ')} DZD` : '—';
    const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

    return (
        <div className="ecommerce-panel" style={{ padding: '24px', color: '#fff' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', margin: '0 0 8px 0' }}>E-Commerce & CRM</h2>
                    <p style={{ color: '#9898a8', margin: 0, fontSize: '0.9rem' }}>
                        Synchronisation catalogue · Métriques en temps réel · Gestion des stocks critiques
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 14px', background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px',
                        fontSize: '0.8rem', color: '#fcd34d'
                    }}>
                        ⚠ Sync API non configurée
                    </div>
                    <button
                        disabled
                        title="Configurez l'API Shopify/WooCommerce dans les paramètres pour activer la synchronisation"
                        style={{
                            background: '#7c4dff', color: '#fff', border: 'none',
                            padding: '10px 20px', borderRadius: '8px', cursor: 'not-allowed',
                            fontWeight: 600, opacity: 0.45,
                        }}
                    >
                        Pousser vers Catalogue
                    </button>
                </div>
            </div>

            {/* Real KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                <KPICard label="Produits Enrichis" value={String(readyToSync.length)} color="#22c55e"
                    sub={`sur ${products.length} au total`} />
                <KPICard label="CA 30 jours" value={fmtDZD(kpis.revenue30d)} color="#3b82f6"
                    sub={`Tendance ${fmtPct(kpis.trendPct)}`} />
                <KPICard label="Unités Vendues (30j)" value={String(kpis.units30d)} color="#7c4dff"
                    sub={kpis.topSeller ? `Top: ${kpis.topSeller.name.slice(0, 22)}…` : 'Importer les ventes'} />
                <KPICard label="Stock Critique" value={String(lowStockCount)} color={lowStockCount > 0 ? '#f59e0b' : '#22c55e'}
                    sub="SKUs en alerte de rupture" />
            </div>

            {/* Enriched Product Table */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}>
                    Produits Prêts pour le Web
                    <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: '#9898a8', fontWeight: 400 }}>
                        {readyToSync.length} produits
                    </span>
                </h3>
                {pageCount > 1 && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.82rem', color: '#9898a8' }}>
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px 10px', borderRadius: '6px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
                            ‹
                        </button>
                        <span>Page {page + 1} / {pageCount}</span>
                        <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px 10px', borderRadius: '6px', cursor: page === pageCount - 1 ? 'not-allowed' : 'pointer', opacity: page === pageCount - 1 ? 0.4 : 1 }}>
                            ›
                        </button>
                    </div>
                )}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left', color: '#9898a8' }}>
                            <th style={{ padding: '12px 16px', width: '52px' }}>Image</th>
                            <th style={{ padding: '12px 16px' }}>Produit</th>
                            <th style={{ padding: '12px 16px', width: '120px' }}>SKU</th>
                            <th style={{ padding: '12px 16px', width: '130px' }}>Prix</th>
                            <th style={{ padding: '12px 16px', width: '110px' }}>Stock</th>
                            <th style={{ padding: '12px 16px', width: '120px' }}>Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map(p => {
                            const hero = p.visual?.heroImage || p.enrichment?.images?.[0];
                            const vel = velMap.get(p.identity.id);
                            const stockSignal = vel?.reorderSignal || 'ok';
                            const stockLabel = { critical: '🔴 Critique', warning: '🟡 Faible', ok: '🟢 OK', dead: '⚫ Mort' }[stockSignal];
                            const hasAI = !!(p.enrichment?.intelligence || p.enrichment?.description);
                            const hasImage = !!hero;

                            return (
                                <tr key={p.identity.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '10px 16px' }}>
                                        {hero
                                            ? <div style={{ width: '40px', height: '40px', background: '#000', borderRadius: '4px', overflow: 'hidden' }}>
                                                <img src={hero} alt={p.identity.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                                              </div>
                                            : <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>📦</div>
                                        }
                                    </td>
                                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                                        <div style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.identity.brand} {p.identity.name}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 16px', color: '#9898a8', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                        {p.identity.sku || '—'}
                                    </td>
                                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                                        {p.commercial?.priceRange?.typical ? `${p.commercial.priceRange.typical.toLocaleString('fr-DZ')} DZD` : '—'}
                                    </td>
                                    <td style={{ padding: '10px 16px', fontSize: '0.8rem' }}>
                                        {stockLabel}
                                    </td>
                                    <td style={{ padding: '10px 16px' }}>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {hasAI && <span style={{ background: 'rgba(124,77,255,0.15)', color: '#b9a9ff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>IA ✓</span>}
                                            {hasImage && <span style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Image ✓</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {readyToSync.length === 0 && (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#888' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📦</div>
                        <div style={{ fontSize: '0.95rem', marginBottom: '6px' }}>Aucun produit enrichi</div>
                        <div style={{ fontSize: '0.82rem', color: '#666' }}>Utilisez l'Agent IA pour enrichir des produits d'abord.</div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Pure KPI display card — no fake data
const KPICard = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ color: '#9898a8', fontSize: '0.8rem', marginBottom: '8px', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color, marginBottom: '4px', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: '#666' }}>{sub}</div>
    </div>
);
