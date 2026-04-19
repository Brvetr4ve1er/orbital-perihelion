import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { inventoryStore } from '../../../state/store';
import { Engine } from '../../../core/engine';
import { KPIStrip } from '../../components/KPIStrip';
import { FilterBar } from '../../components/FilterBar';
import { ProductCard } from '../../components/ProductCard';
import { ProductIntelligenceUI } from './ProductIntelligenceUI';
import { TreeView } from './TreeView';
import { CompareView } from './CompareView';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { TableView } from './TableView';
import { GraphView } from '../../../graph/components/GraphView';
import { projectProductsToGraph } from '../../../services/graph-projection';
import { Product } from '../../../core/schema';

type ViewMode = 'grid' | 'tree' | 'graph' | 'table' | 'compare';

const VIEW_TABS: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'grid',    label: 'Grid',    icon: '▦' },
    { id: 'table',   label: 'Table',   icon: '▤' },
    { id: 'tree',    label: 'Tree',    icon: '🗂' },
    { id: 'graph',   label: 'Graph',   icon: '🕸' },
    { id: 'compare', label: 'Compare', icon: '⚖' },
];

const MAX_COMPARE = 4;

export const Dashboard = () => {
    const [state, setState] = useState(inventoryStore.getState());
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [view, setView] = useState<ViewMode>('grid');
    const [compareIds, setCompareIds] = useState<string[]>([]);

    useEffect(() => {
        return inventoryStore.subscribe((newState) => {
            setState(newState);
            // Keep the open modal in sync when AI enrichment updates the product
            setSelectedProduct(prev => {
                if (!prev) return null;
                const fresh = newState.products.find(p => p.identity.id === prev.identity.id);
                return fresh ?? prev;
            });
        });
    }, []);

    const filteredProducts = useMemo(() => {
        return Engine.filterProducts(
            state.products,
            state.searchQuery,
            state.activeFilters
        );
    }, [state.products, state.searchQuery, state.activeFilters]);

    const stats = useMemo(() => Engine.calculateStats(state.products), [state.products]);

    const graphData = useMemo(
        () => (view === 'graph' ? projectProductsToGraph(filteredProducts) : null),
        [view, filteredProducts]
    );

    const toggleCompare = useCallback((id: string) => {
        setCompareIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= MAX_COMPARE) return prev; // cap at 4
            return [...prev, id];
        });
    }, []);

    const clearCompare = useCallback(() => setCompareIds([]), []);

    const compareSet = useMemo(() => new Set(compareIds), [compareIds]);

    return (
        <div className="dashboard">
            {stats && <KPIStrip stats={stats} />}

            <FilterBar
                searchQuery={state.searchQuery}
                setSearchQuery={(q) => inventoryStore.setSearchQuery(q)}
                activeFilters={state.activeFilters}
                setFilters={(f) => inventoryStore.setFilters(f)}
                stats={stats}
            />

            <div className="view-switcher">
                <div className="results-count">
                    <strong>{filteredProducts.length}</strong> produits
                    {state.products.length !== filteredProducts.length && (
                        <span> sur {state.products.length}</span>
                    )}
                    {compareIds.length > 0 && (
                        <span className="compare-indicator"> · {compareIds.length} to compare</span>
                    )}
                </div>
                <div className="view-tabs">
                    {VIEW_TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`view-tab ${view === tab.id ? 'active' : ''}`}
                            onClick={() => setView(tab.id)}
                        >
                            <span className="view-tab-icon">{tab.icon}</span>
                            <span className="view-tab-label">{tab.label}</span>
                            {tab.id === 'compare' && compareIds.length > 0 && (
                                <span className="view-tab-badge">{compareIds.length}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {view === 'grid' && (
                <div className="product-grid">
                    {filteredProducts.map((p, i) => (
                        <ProductCard
                            key={p.identity.id}
                            product={p}
                            index={i}
                            onClick={() => setSelectedProduct(p)}
                            inCompare={compareSet.has(p.identity.id)}
                            onToggleCompare={() => toggleCompare(p.identity.id)}
                        />
                    ))}
                </div>
            )}

            {view === 'table' && (
                <TableView
                    products={filteredProducts}
                    onSelect={setSelectedProduct}
                    compareIds={compareIds}
                    onToggleCompare={toggleCompare}
                />
            )}

            {view === 'tree' && (
                <TreeView products={filteredProducts} onSelect={setSelectedProduct} />
            )}

            {view === 'graph' && graphData && (
                <div className="graph-mount">
                    <ErrorBoundary>
                        <GraphView data={graphData} />
                    </ErrorBoundary>
                </div>
            )}

            {view === 'compare' && (
                <CompareView
                    products={state.products}
                    compareIds={compareIds}
                    onRemove={(id) => setCompareIds(prev => prev.filter(x => x !== id))}
                    onClearAll={clearCompare}
                    onSwitchToGrid={() => setView('grid')}
                />
            )}

            {selectedProduct && (
                <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setSelectedProduct(null)}>✕</button>
                        <ProductIntelligenceUI product={selectedProduct} />
                    </div>
                </div>
            )}
        </div>
    );
};
