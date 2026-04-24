import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { inventoryStore } from '../../../state/store';
import { Engine } from '../../../core/engine';
import { KPIStrip } from '../../components/KPIStrip';
import { FilterBar, SortMode } from '../../components/FilterBar';
import { ProductCard } from '../../components/ProductCard';
import { ProductIntelligenceUI } from './ProductIntelligenceUI';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ReorderRadar } from '../../components/ReorderRadar';
import { DeadStock } from '../../components/DeadStock';
import { SalesKPIStrip } from '../../components/SalesKPIStrip';
import { RevenueChart } from '../../components/RevenueChart';
import { CategoryLeaderboard } from '../../components/CategoryLeaderboard';
import { InsightsFeed } from '../../components/InsightsFeed';
import { Product } from '../../../core/schema';

// Heavy / tab-specific views — code-split so the initial grid paint stays cheap.
const TableView   = lazy(() => import('./TableView').then(m => ({ default: m.TableView })));
const TreeView    = lazy(() => import('./TreeView').then(m => ({ default: m.TreeView })));
const CompareView = lazy(() => import('./CompareView').then(m => ({ default: m.CompareView })));
const GraphView   = lazy(() => import('../../../graph/components/GraphView').then(m => ({ default: m.GraphView })));

const ViewFallback = () => (
    <div className="view-fallback">
        <div className="loading-spinner" />
        <p>Loading view…</p>
    </div>
);

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
    const [sortBy, setSortBy] = useState<SortMode>('smart');

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
        const base = Engine.filterProducts(
            state.products,
            state.searchQuery,
            state.activeFilters
        );
        if (sortBy === 'smart') return base;
        const stockOf = (p: Product) => (p.observations?.stock?.[0]?.v as number) ?? 0;
        const priceOf = (p: Product) => p.commercial?.priceRange?.typical || 0;
        const marginOf = (p: Product) =>
            (p.commercial?.priceRange?.typical || 0) - (p.commercial?.priceRange?.min || 0);
        const sorted = [...base];
        sorted.sort((a, b) => {
            switch (sortBy) {
                case 'name':        return (a.identity.name || '').localeCompare(b.identity.name || '');
                case 'price_asc':   return priceOf(a) - priceOf(b);
                case 'price_desc':  return priceOf(b) - priceOf(a);
                case 'stock_asc':   return stockOf(a) - stockOf(b);
                case 'stock_desc':  return stockOf(b) - stockOf(a);
                case 'margin_desc': return marginOf(b) - marginOf(a);
                default:            return 0;
            }
        });
        return sorted;
    }, [state.products, state.searchQuery, state.activeFilters, sortBy]);

    const stats = useMemo(() => Engine.calculateStats(state.products), [state.products]);

    // Graph projection is lazy-loaded with the GraphView, so we defer its import too.
    const [graphData, setGraphData] = useState<any>(null);
    useEffect(() => {
        if (view !== 'graph') { setGraphData(null); return; }
        let cancel = false;
        import('../../../services/graph-projection').then(m => {
            if (!cancel) setGraphData(m.projectProductsToGraph(filteredProducts));
        });
        return () => { cancel = true; };
    }, [view, filteredProducts]);

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

            <SalesKPIStrip products={state.products} />

            <InsightsFeed products={state.products} onPickProduct={setSelectedProduct} />

            <RevenueChart products={state.products} />

            <div className="intel-panels intel-panels-3">
                <ReorderRadar products={state.products} onPickProduct={setSelectedProduct} />
                <DeadStock products={state.products} onPickProduct={setSelectedProduct} />
                <CategoryLeaderboard products={state.products} />
            </div>

            <FilterBar
                searchQuery={state.searchQuery}
                setSearchQuery={(q) => inventoryStore.setSearchQuery(q)}
                activeFilters={state.activeFilters}
                setFilters={(f) => inventoryStore.setFilters(f)}
                stats={stats}
                sortBy={sortBy}
                setSortBy={setSortBy}
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
                <Suspense fallback={<ViewFallback />}>
                    <TableView
                        products={filteredProducts}
                        onSelect={setSelectedProduct}
                        compareIds={compareIds}
                        onToggleCompare={toggleCompare}
                    />
                </Suspense>
            )}

            {view === 'tree' && (
                <Suspense fallback={<ViewFallback />}>
                    <TreeView products={filteredProducts} onSelect={setSelectedProduct} />
                </Suspense>
            )}

            {view === 'graph' && graphData && (
                <div className="graph-mount">
                    <ErrorBoundary>
                        <Suspense fallback={<ViewFallback />}>
                            <GraphView data={graphData} />
                        </Suspense>
                    </ErrorBoundary>
                </div>
            )}

            {view === 'compare' && (
                <Suspense fallback={<ViewFallback />}>
                    <CompareView
                        products={state.products}
                        compareIds={compareIds}
                        onRemove={(id) => setCompareIds(prev => prev.filter(x => x !== id))}
                        onClearAll={clearCompare}
                        onSwitchToGrid={() => setView('grid')}
                    />
                </Suspense>
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
