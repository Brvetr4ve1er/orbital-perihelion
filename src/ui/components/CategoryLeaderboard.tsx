/**
 * CategoryLeaderboard — ranks categories by 30-day revenue with trend arrows
 * and a tiny inline bar showing share of total. Click a row to filter the
 * catalog down to that category.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { getCategoryPerformance, invalidateAnalyticsCache } from '../../services/analytics';
import { SalesService } from '../../services/sales';
import { inventoryStore } from '../../state/store';
import { Sparkline } from './Sparkline';

interface Props { products: Product[]; }

export const CategoryLeaderboard = ({ products }: Props) => {
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => {
        invalidateAnalyticsCache();
        setTick(t => t + 1);
    }), []);

    const salesCount = SalesService.getCached().length;
    const rows = useMemo(() => getCategoryPerformance(products), [products]);

    if (salesCount === 0) return null;

    const total = rows.reduce((s, r) => s + r.revenue30d, 0);
    const priceFmt = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 });

    const filterTo = (cat: string) => {
        const cur = inventoryStore.getState().activeFilters;
        inventoryStore.setFilters({ ...cur, category: cur.category === cat ? 'all' : cat });
    };

    return (
        <section className="reorder-radar cat-leaderboard">
            <div className="reorder-radar-header">
                <div className="reorder-radar-title">
                    Performance par catégorie
                    <span className="badge" style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                        30j
                    </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {rows.length} active{rows.length !== 1 ? 's' : ''} · {priceFmt.format(total)}
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="reorder-radar-empty">
                    <p>Aucune vente par catégorie sur les 30 derniers jours.</p>
                </div>
            ) : (
                <div className="cat-list">
                    {rows.slice(0, 8).map(r => {
                        const share = total > 0 ? (r.revenue30d / total) * 100 : 0;
                        const tPct = Math.round(r.trendPct * 100);
                        return (
                            <div key={r.category} className="cat-row" onClick={() => filterTo(r.category)}>
                                <div className="cat-row-name">
                                    <span className="cat-row-label">{r.label}</span>
                                    <span className="cat-row-sub">
                                        {r.units30d} unité{r.units30d !== 1 ? 's' : ''} · {r.productCount} réf.
                                    </span>
                                </div>
                                <div className="cat-row-bar">
                                    <div className="cat-row-bar-fill" style={{ width: `${share}%` }} />
                                </div>
                                <div className="cat-row-spark">
                                    <Sparkline values={r.daily} width={60} height={18} />
                                </div>
                                <div className="cat-row-rev">
                                    <strong>{priceFmt.format(r.revenue30d)}</strong>
                                    {Math.abs(tPct) > 5 && (
                                        <span className={`cat-row-trend ${r.trendPct > 0 ? 'up' : 'down'}`}>
                                            {r.trendPct > 0 ? '▲' : '▼'} {Math.abs(tPct)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
