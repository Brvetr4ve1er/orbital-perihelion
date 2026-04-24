/**
 * Reorder Radar — surfaces products that will run out based on sales velocity.
 * Critical = <7 days of cover or OOS with demand. Warning = <21 days.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { getReorderQueue, invalidateVelocityCache } from '../../services/velocity';
import { SalesService } from '../../services/sales';

interface Props {
    products: Product[];
    onPickProduct?: (p: Product) => void;
    limit?: number;
}

export const ReorderRadar = ({ products, onPickProduct, limit = 8 }: Props) => {
    // Re-render when sales change
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => {
        invalidateVelocityCache();
        setTick(t => t + 1);
    }), []);

    const queue = useMemo(() => getReorderQueue(products, limit), [products, limit]);
    const salesCount = SalesService.getCached().length;

    return (
        <section className="reorder-radar">
            <div className="reorder-radar-header">
                <div className="reorder-radar-title">
                    🎯 Reorder Radar
                    {queue.length > 0 && (
                        <span className="badge">{queue.length} to reorder</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {salesCount === 0 ? 'Import sales CSV to activate' : `${salesCount} sales records`}
                </div>
            </div>

            {salesCount === 0 ? (
                <div className="reorder-radar-empty">
                    Click <strong>📊 Sales</strong> in the header to import your order history.<br />
                    Supports Shopify, WooCommerce, Square, and generic POS exports.
                </div>
            ) : queue.length === 0 ? (
                <div className="reorder-radar-empty">
                    ✅ All products have adequate cover. Nothing urgent to reorder.
                </div>
            ) : (
                <div className="reorder-list">
                    {queue.map(({ product, velocity }) => {
                        const sig = velocity.reorderSignal;
                        const doc = Number.isFinite(velocity.daysOfCover) ? `${Math.round(velocity.daysOfCover)}d` : '—';
                        return (
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
                                    {velocity.onHand} left
                                </div>
                                <div className="reorder-row-velocity">
                                    {velocity.velocity.toFixed(2)}/d
                                </div>
                                <div className={`reorder-row-doc ${sig === 'critical' ? 'critical' : 'warning'}`}>
                                    {sig === 'critical' ? '🔥' : '⚠'} {doc}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
