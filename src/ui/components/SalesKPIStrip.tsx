/**
 * SalesKPIStrip — sales-derived KPIs (revenue 30d, AOV, top seller, trend).
 * Renders nothing when there is no sales data yet.
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
                <div className="kpi-label">Revenue (30d)</div>
                <div className="kpi-value">{priceFmt.format(kpis.revenue30d)}</div>
                <div className="kpi-sub" style={{ color: trendColor }}>
                    {trendIcon} {Math.abs(trendPct)}% vs prior 23d
                </div>
            </div>

            <div className="kpi-card kpi-cost">
                <div className="kpi-label">Units sold (30d)</div>
                <div className="kpi-value">{kpis.units30d.toLocaleString()}</div>
                <div className="kpi-sub">{kpis.orders30d} order-days</div>
            </div>

            <div className="kpi-card kpi-ai">
                <div className="kpi-label">AOV</div>
                <div className="kpi-value">{priceFmt.format(kpis.aov)}</div>
                <div className="kpi-sub">Avg basket</div>
            </div>

            <div className="kpi-card kpi-health" style={{ gridColumn: 'span 2' }}>
                <div className="kpi-label">Top Seller (30d)</div>
                {kpis.topSeller ? (
                    <>
                        <div className="kpi-value" style={{ fontSize: '1.1em', fontWeight: 600, lineHeight: 1.2 }}>
                            {kpis.topSeller.name}
                        </div>
                        <div className="kpi-sub">{kpis.topSeller.units} units moved</div>
                    </>
                ) : (
                    <div className="kpi-sub">No data</div>
                )}
            </div>
        </section>
    );
};
