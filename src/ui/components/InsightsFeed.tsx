/**
 * InsightsFeed — narrates what matters on the dashboard.
 *
 * Reads from the insights service and renders a ranked list of cards. Clicking
 * a card that carries a productId opens the detail modal via onPickProduct;
 * a card with only a category narrows the global category filter.
 */
import { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { computeInsights, Insight } from '../../services/insights';
import { SalesService } from '../../services/sales';
import { inventoryStore } from '../../state/store';

interface Props {
    products: Product[];
    onPickProduct?: (p: Product) => void;
}

export const InsightsFeed = ({ products, onPickProduct }: Props) => {
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => setTick(t => t + 1)), []);

    const salesCount = SalesService.getCached().length;
    const insights = useMemo(
        () => computeInsights(products, 8),
        // salesCount forces recompute on sales refresh — upstream caches handle cost
        [products, salesCount],
    );

    const handleClick = (ins: Insight) => {
        if (ins.productId) {
            const p = products.find(x => x.identity.id === ins.productId);
            if (p && onPickProduct) onPickProduct(p);
            return;
        }
        if (ins.category) {
            const cur = inventoryStore.getState().activeFilters;
            inventoryStore.setFilters({
                ...cur,
                category: cur.category === ins.category ? 'all' : ins.category,
            });
        }
    };

    if (insights.length === 0) return null;

    return (
        <section className="insights-feed">
            <div className="insights-feed-header">
                <div className="insights-feed-title">
                    Insights
                    <span className="badge" style={{ background: 'rgba(165,180,252,0.18)', color: '#a5b4fc' }}>
                        auto
                    </span>
                </div>
                <div className="insights-feed-sub">
                    {insights.length} observation{insights.length !== 1 ? 's' : ''}
                </div>
            </div>

            <div className="insights-list">
                {insights.map(ins => {
                    const clickable = !!(ins.productId || ins.category);
                    return (
                        <button
                            key={ins.id}
                            className={`insight-card insight-${ins.severity}${clickable ? ' clickable' : ''}`}
                            onClick={clickable ? () => handleClick(ins) : undefined}
                            disabled={!clickable}
                            type="button"
                        >
                            <span className="insight-icon">{ins.icon}</span>
                            <div className="insight-body">
                                <div className="insight-headline">{ins.headline}</div>
                                <div className="insight-text">{ins.body}</div>
                            </div>
                            {ins.metric && <span className="insight-metric">{ins.metric}</span>}
                        </button>
                    );
                })}
            </div>
        </section>
    );
};
