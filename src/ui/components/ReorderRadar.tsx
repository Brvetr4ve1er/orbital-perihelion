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
                    Réapprovisionnement
                    {queue.length > 0 && (
                        <span className="badge">{queue.length} à commander</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {salesCount === 0 ? 'Importer les ventes pour activer' : `${salesCount} enregistrement${salesCount !== 1 ? 's' : ''}`}
                </div>
            </div>

            {salesCount === 0 ? (
                <div className="reorder-radar-empty">
                    <p>Importez un historique de ventes pour détecter les ruptures à venir.</p>
                </div>
            ) : queue.length === 0 ? (
                <div className="reorder-radar-empty">
                    <p>Tous les produits ont une couverture suffisante.</p>
                </div>
            ) : (
                <div className="reorder-list">
                    {queue.map(({ product, velocity }) => {
                        const sig = velocity.reorderSignal;
                        const doc = Number.isFinite(velocity.daysOfCover) ? `${Math.round(velocity.daysOfCover)}j` : '—';
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
                                    {velocity.onHand} restant{velocity.onHand !== 1 ? 's' : ''}
                                </div>
                                <div className="reorder-row-velocity">
                                    {velocity.velocity.toFixed(2)}/j
                                </div>
                                <div className={`reorder-row-doc ${sig === 'critical' ? 'critical' : 'warning'}`}>
                                    {doc}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
