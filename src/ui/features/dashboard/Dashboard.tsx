import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useDeferredValue } from 'react';
import { inventoryStore } from '../../../state/store';
import { Engine } from '../../../core/engine';
import { KPIStrip } from '../../components/KPIStrip';
import { FilterBar, SortMode } from '../../components/FilterBar';
import { ProductCard } from '../../components/ProductCard';
import { VirtualizedGrid } from './VirtualizedGrid';
import { ProductIntelligenceUI } from './ProductIntelligenceUI';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ReorderRadar } from '../../components/ReorderRadar';
import { DeadStock } from '../../components/DeadStock';
import { SalesKPIStrip } from '../../components/SalesKPIStrip';
import { RevenueChart } from '../../components/RevenueChart';
import { CategoryLeaderboard } from '../../components/CategoryLeaderboard';
import { InsightsFeed } from '../../components/InsightsFeed';
import { Product } from '../../../core/schema';
import { SalesService } from '../../../services/sales';
import { getVelocityMap } from '../../../services/velocity';
import { getAnalyticsMap } from '../../../services/analytics';

// Heavy / tab-specific views — code-split so the initial grid paint stays cheap.
const TableView   = lazy(() => import('./TableView').then(m => ({ default: m.TableView })));
const TreeView    = lazy(() => import('./TreeView').then(m => ({ default: m.TreeView })));
const CompareView = lazy(() => import('./CompareView').then(m => ({ default: m.CompareView })));
const GraphView   = lazy(() => import('../../../graph/components/GraphView').then(m => ({ default: m.GraphView })));
const EcommercePanel = lazy(() => import('../ecommerce/EcommercePanel').then(m => ({ default: m.EcommercePanel })));

const ViewFallback = () => (
    <div className="view-fallback">
        <div className="loading-spinner" />
        <p>Chargement…</p>
    </div>
);

type ViewMode = 'grid' | 'tree' | 'graph' | 'table' | 'compare' | 'ecommerce';

// Grouped view tabs: Vues principales / Outils avancés / Modules
const VIEW_GROUPS: { label: string; tabs: { id: ViewMode; label: string }[] }[] = [
    {
        label: 'Vues',
        tabs: [
            { id: 'grid',    label: 'Grille' },
            { id: 'table',   label: 'Tableau' },
        ],
    },
    {
        label: 'Outils',
        tabs: [
            { id: 'tree',    label: 'Arborescence' },
            { id: 'graph',   label: 'Graphe' },
            { id: 'compare', label: 'Comparer' },
        ],
    },
    {
        label: 'Modules',
        tabs: [
            { id: 'ecommerce', label: 'CRM' },
        ],
    },
];

const MAX_COMPARE = 4;

export const Dashboard = () => {
    const [state, setState] = useState(inventoryStore.getState());
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [view, setView] = useState<ViewMode>('grid');
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<SortMode>('smart');

    useEffect(() => {
        const unsub = inventoryStore.subscribe((newState) => {
            setState(newState);
            // Keep the open modal in sync when AI enrichment updates the product
            setSelectedProduct(prev => {
                if (!prev) return null;
                const fresh = newState.products.find(p => p.identity.id === prev.identity.id);
                return fresh ?? prev;
            });
        });
        return () => { unsub(); };
    }, []);

    const deferredSearch = useDeferredValue(state.searchQuery);

    const filteredProducts = useMemo(() => {
        const base = Engine.filterProducts(
            state.products,
            deferredSearch,
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
    }, [state.products, deferredSearch, state.activeFilters, sortBy]);

    // ── Sales velocity/analytics — computed once, stamped onto products ───
    // This replaces 500+ individual SalesService subscriptions inside ProductCard.
    const [salesTick, setSalesTick] = useState(0);
    useEffect(() => {
        const unsub = SalesService.subscribe(() => setSalesTick((t: number) => t + 1));
        return () => { unsub(); };
    }, []);

    const enrichedProducts = useMemo(() => {
        try {
            const velocityMap = getVelocityMap(state.products);
            const analyticsMap = getAnalyticsMap(state.products);
            return filteredProducts.map(p => {
                const v = velocityMap.get(p.identity.id);
                const a = analyticsMap.get(p.identity.id);
                if (!v && !a) return p;
                return { ...p, velocity: v, analytics: a };
            });
        } catch (e) {
            console.warn('[Dashboard] Enrichment computation failed:', e);
            return filteredProducts;
        }
    }, [filteredProducts, state.products, salesTick]);

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

    console.log('[Dashboard] Rendering with products:', state.products.length, 'Filtered:', filteredProducts.length);

    return (
        <div className="dashboard">
            <ErrorBoundary>
                {stats && <KPIStrip stats={stats} />}
            </ErrorBoundary>

            <ErrorBoundary>
                <SalesKPIStrip products={state.products} />
            </ErrorBoundary>

            <ErrorBoundary>
                <InsightsFeed products={state.products} onPickProduct={setSelectedProduct} />
            </ErrorBoundary>

            <ErrorBoundary>
                <RevenueChart products={state.products} />
            </ErrorBoundary>

            <div className="intel-panels intel-panels-3">
                <ErrorBoundary><ReorderRadar products={state.products} onPickProduct={setSelectedProduct} /></ErrorBoundary>
                <ErrorBoundary><DeadStock products={state.products} onPickProduct={setSelectedProduct} /></ErrorBoundary>
                <ErrorBoundary><CategoryLeaderboard products={state.products} /></ErrorBoundary>
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
                    <strong>{filteredProducts.length}</strong> produit{filteredProducts.length !== 1 ? 's' : ''}
                    {state.products.length !== filteredProducts.length && (
                        <span> sur {state.products.length}</span>
                    )}
                    {compareIds.length > 0 && (
                        <span className="compare-indicator"> · {compareIds.length} à comparer</span>
                    )}
                </div>
                <div className="view-tabs-grouped">
                    {VIEW_GROUPS.map(group => (
                        <div key={group.label} className="view-tab-group">
                            <span className="view-tab-group-label">{group.label}</span>
                            {group.tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`view-tab ${view === tab.id ? 'active' : ''}`}
                                    onClick={() => setView(tab.id)}
                                >
                                    <span className="view-tab-label">{tab.label}</span>
                                    {tab.id === 'compare' && compareIds.length > 0 && (
                                        <span className="view-tab-badge">{compareIds.length}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {view === 'grid' && (
                <ErrorBoundary>
                    <VirtualizedGrid
                        products={enrichedProducts}
                        compareSet={compareSet}
                        onSelect={setSelectedProduct}
                        onToggleCompare={toggleCompare}
                    />
                </ErrorBoundary>
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

            {view === 'ecommerce' && (
                <Suspense fallback={<ViewFallback />}>
                    <EcommercePanel products={state.products} />
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
