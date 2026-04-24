/**
 * Dead Stock — inverse of the Reorder Radar. Surfaces products with
 * stock on hand but no sales in 90 days. These are clearance candidates.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { getDeadStock, invalidateVelocityCache } from '../../services/velocity';
import { SalesService } from '../../services/sales';
import { ProductAdapter } from '../../core/product-adapter';

interface Props {
    products: Product[];
    onPickProduct?: (p: Product) => void;
    limit?: number;
}

export const DeadStock = ({ products, onPickProduct, limit = 8 }: Props) => {
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => {
        invalidateVelocityCache();
        setTick(t => t + 1);
    }), []);

    const salesCount = SalesService.getCached().length;
    const queue = useMemo(() => getDeadStock(products, limit), [products, limit]);

    // Tied-up capital = sum(purchase_price * units)
    const tiedCapital = useMemo(() => {
        let total = 0;
        for (const { product, velocity } of queue) {
            const lp = ProductAdapter.toLegacy(product);
            const cost = (lp.commercial as any).purchasePrice || lp.commercial.retailPrice * 0.6 || 0;
            total += cost * velocity.onHand;
        }
        return total;
    }, [queue]);

    if (salesCount === 0) return null; // No point showing this without sales data

    return (
        <section className="reorder-radar">
            <div className="reorder-radar-header">
                <div className="reorder-radar-title">
                    💀 Dead Stock
                    {queue.length > 0 && (
                        <span className="badge" style={{ background: 'rgba(120,113,108,0.25)', color: '#d6d3d1' }}>
                            {queue.length} items
                        </span>
                    )}
                </div>
                {tiedCapital > 0 && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        ~{Math.round(tiedCapital).toLocaleString()} DZD tied up
                    </div>
                )}
            </div>

            {queue.length === 0 ? (
                <div className="reorder-radar-empty">
                    ✅ No dead stock detected. Every product is moving.
                </div>
            ) : (
                <div className="reorder-list">
                    {queue.map(({ product, velocity }) => (
                        <div
                            key={product.identity.id}
                            className="reorder-row"
                            onClick={() => onPickProduct?.(product)}
                        >
                            <div className="reorder-row-name">
                                {product.identity.name}
                                <div className="brand">{product.identity.brand}</div>
                            </div>
                            <div className="reorder-row-stock">
                                {velocity.onHand} units
                            </div>
                            <div className="reorder-row-velocity" style={{ color: '#94a3b8' }}>
                                0 sales 90d
                            </div>
                            <div className="reorder-row-doc" style={{ color: '#d6d3d1' }}>
                                💀 discount
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
