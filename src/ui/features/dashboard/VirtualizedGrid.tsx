/**
 * VirtualizedGrid — renders ProductCards inside a windowed container.
 *
 * Uses @tanstack/react-virtual to only mount the visible rows.
 * The grid adapts to the container width using the same CSS breakpoints
 * as the original `.product-grid` (minmax 300px columns).
 *
 * At 5,000 products this renders ~20 cards instead of 5,000.
 */
import { useRef, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ProductCard } from '../../components/ProductCard';
import { Product } from '../../../core/schema';

// Card height estimate — matches .product-card CSS (padding, content, margin)
const CARD_HEIGHT = 220;
const CARD_MIN_WIDTH = 300;
const GAP = 16;

interface VirtualizedGridProps {
    products: Product[];
    compareSet: Set<string>;
    onSelect: (p: Product) => void;
    onToggleCompare: (id: string) => void;
}

export const VirtualizedGrid = ({ products, compareSet, onSelect, onToggleCompare }: VirtualizedGridProps) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [columns, setColumns] = useState(3);

    // Recompute column count when container resizes
    useEffect(() => {
        const el = parentRef.current;
        if (!el) return;

        const computeCols = () => {
            const width = el.clientWidth;
            const cols = Math.max(1, Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP)));
            setColumns(cols);
        };
        computeCols();

        const observer = new ResizeObserver(computeCols);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const rowCount = Math.ceil(products.length / columns);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => CARD_HEIGHT + GAP,
        overscan: 3,
    });

    const getRowProducts = useCallback((rowIndex: number) => {
        const start = rowIndex * columns;
        return products.slice(start, start + columns);
    }, [products, columns]);

    // If there are very few products, skip virtualization entirely
    if (products.length <= columns * 6) {
        return (
            <div className="product-grid">
                {products.map((p, i) => (
                    <ProductCard
                        key={p.identity.id}
                        product={p}
                        index={i}
                        onClick={() => onSelect(p)}
                        inCompare={compareSet.has(p.identity.id)}
                        onToggleCompare={() => onToggleCompare(p.identity.id)}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="virtualized-grid-container"
            style={{
                height: 'calc(100vh - 400px)',
                minHeight: '480px',
                overflow: 'auto',
                paddingTop: '1rem',
            }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map(virtualRow => {
                    const rowProducts = getRowProducts(virtualRow.index);
                    return (
                        <div
                            key={virtualRow.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                                gap: `${GAP}px`,
                            }}
                        >
                            {rowProducts.map((p, i) => (
                                <ProductCard
                                    key={p.identity.id}
                                    product={p}
                                    index={virtualRow.index * columns + i}
                                    onClick={() => onSelect(p)}
                                    inCompare={compareSet.has(p.identity.id)}
                                    onToggleCompare={() => onToggleCompare(p.identity.id)}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
