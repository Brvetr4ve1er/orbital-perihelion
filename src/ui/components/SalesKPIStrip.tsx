/**
 * SalesKPIStrip — KPIs dérivés des ventes (CA 30j, panier moyen, top vendeur, tendance).
 * Ne s'affiche pas tant qu'il n'y a pas de données de vente.
 */
import React, { useEffect, useState } from 'react';
import { Product } from '../../core/schema';
import { getSalesKPIs, invalidateAnalyticsCache } from '../../services/analytics';
import { SalesService } from '../../services/sales';

interface Props { products: Product[]; }

export const SalesKPIStrip = ({ products }: Props) => {
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => {
        invalidateAnalyticsCache();
        setTick(t => t + 1);
    }), []);

    const salesCount = SalesService.getCached().length;
    if (salesCount === 0) return null;

    const kpis = getSalesKPIs(products);
    const priceFmt = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 });
    const trendPct = Math.round(kpis.trendPct * 100);
    const trendColor = kpis.trendPct > 0.05 ? '#22c55e' : kpis.trendPct < -0.05 ? '#ef4444' : '#94a3b8';
    const trendIcon  = kpis.trendPct > 0.05 ? '▲' : kpis.trendPct < -0.05 ? '▼' : '▬';

    return (
        <section className="kpi-strip kpi-strip-sales">
            <div className="kpi-card kpi-revenue">
                <div className="kpi-label">Chiffre d'affaires (30j)</div>
                <div className="kpi-value">{priceFmt.format(kpis.revenue30d)}</div>
                <div className="kpi-sub" style={{ color: trendColor }}>
                    {trendIcon} {Math.abs(trendPct)}% vs 23j précédents
                </div>
            </div>

            <div className="kpi-card kpi-cost">
                <div className="kpi-label">Unités vendues (30j)</div>
                <div className="kpi-value">{kpis.units30d.toLocaleString()}</div>
                <div className="kpi-sub">{kpis.orders30d} jour{kpis.orders30d !== 1 ? 's' : ''} de commande</div>
            </div>

            <div className="kpi-card kpi-ai">
                <div className="kpi-label">Panier moyen</div>
                <div className="kpi-value">{priceFmt.format(kpis.aov)}</div>
                <div className="kpi-sub">Valeur moyenne par commande</div>
            </div>

            <div className="kpi-card kpi-health" style={{ gridColumn: 'span 2' }}>
                <div className="kpi-label">Meilleure vente (30j)</div>
                {kpis.topSeller ? (
                    <>
                        <div className="kpi-value" style={{ fontSize: '1.1em', fontWeight: 600, lineHeight: 1.2 }}>
                            {kpis.topSeller.name}
                        </div>
                        <div className="kpi-sub">{kpis.topSeller.units} unité{kpis.topSeller.units !== 1 ? 's' : ''} écoulée{kpis.topSeller.units !== 1 ? 's' : ''}</div>
                    </>
                ) : (
                    <div className="kpi-sub">Aucune donnée</div>
                )}
            </div>
        </section>
    );
};
