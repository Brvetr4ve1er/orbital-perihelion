import React, { useMemo } from 'react';

interface FilterProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    activeFilters: Record<string, any>;
    setFilters: (f: Record<string, any>) => void;
    stats: any;
    sortBy?: SortMode;
    setSortBy?: (mode: SortMode) => void;
}

export type SortMode = 'smart' | 'name' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'margin_desc';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
    { id: 'smart',       label: 'Smart ranking' },
    { id: 'name',        label: 'Name A → Z' },
    { id: 'price_asc',   label: 'Price: low → high' },
    { id: 'price_desc',  label: 'Price: high → low' },
    { id: 'stock_desc',  label: 'Stock: high → low' },
    { id: 'stock_asc',   label: 'Stock: low → high' },
    { id: 'margin_desc', label: 'Highest margin' },
];

const STOCK_FILTERS: { id: string; label: string; icon: string }[] = [
    { id: 'all',     label: 'All',          icon: '●' },
    { id: 'Normal',  label: 'In stock',     icon: '🟢' },
    { id: 'Faible',  label: 'Low',          icon: '🟡' },
    { id: 'Rupture', label: 'Out of stock', icon: '🔴' },
];

const QUICK_VIEWS: { id: string; label: string; icon: string; hint: string }[] = [
    { id: 'dead_stock',   label: 'Dead stock',       icon: '💀', hint: 'Overstock (≥10 units sitting)' },
    { id: 'no_image',     label: 'Missing image',    icon: '🖼',  hint: 'No hero image — enrich or upload' },
    { id: 'not_enriched', label: 'No AI yet',        icon: '✨', hint: 'Never enriched by the AI pipeline' },
    { id: 'low_margin',   label: 'Low margin',       icon: '💸', hint: 'Margin ≤ 15%' },
];

/**
 * 🔎 Modern Search Engine (Query Engine UI)
 */
export const FilterBar = ({
    searchQuery,
    setSearchQuery,
    activeFilters,
    setFilters,
    stats,
    sortBy = 'smart',
    setSortBy,
}: FilterProps) => {

    const brands = stats?.brands || [];
    const categories = stats?.categories || [];

    // Active filter chips logic
    const activeFilterList = useMemo(() => {
        const list: Array<{ id: string; key: string; label: string }> = [];
        if (activeFilters.category && activeFilters.category !== 'all') {
            const cat = categories.find((c: any) => c.id === activeFilters.category);
            list.push({ id: 'category', key: 'category', label: cat ? `${cat.icon} ${cat.label}` : activeFilters.category });
        }
        if (activeFilters.brand && activeFilters.brand !== 'all') {
            list.push({ id: 'brand', key: 'brand', label: `Marque: ${activeFilters.brand}` });
        }
        return list;
    }, [activeFilters, categories]);

    const removeFilter = (key: string) => {
        setFilters({ ...activeFilters, [key]: 'all' });
    };

    return (
        <section className="query-engine-container">
            {/* 1. Primary Search Bar + Sort */}
            <div className="query-search-zone">
                <div className="query-input-wrapper">
                    <span className="query-icon">🔎</span>
                    <input
                        type="text"
                        className="query-input"
                        placeholder="Search name, SKU, category or use fuzzy matching..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="query-clear" onClick={() => setSearchQuery('')}>✕</button>
                    )}
                </div>
                {setSortBy && (
                    <select
                        className="sort-dropdown"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortMode)}
                        title="Sort order"
                    >
                        {SORT_OPTIONS.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* 1.5 Stock-status quick filters */}
            <div className="stock-quick-row">
                {STOCK_FILTERS.map(s => (
                    <button
                        key={s.id}
                        className={`stock-pill ${(activeFilters.stock || 'all') === s.id ? 'active' : ''}`}
                        onClick={() => setFilters({ ...activeFilters, stock: s.id })}
                    >
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                    </button>
                ))}
                <span className="stock-divider" />
                {QUICK_VIEWS.map(v => (
                    <button
                        key={v.id}
                        className={`stock-pill quick-view ${activeFilters.view === v.id ? 'active' : ''}`}
                        onClick={() => setFilters({ ...activeFilters, view: activeFilters.view === v.id ? undefined : v.id })}
                        title={v.hint}
                    >
                        <span>{v.icon}</span>
                        <span>{v.label}</span>
                    </button>
                ))}
            </div>

            {/* 2. Active Filter Chips */}
            {activeFilterList.length > 0 && (
                <div className="active-filters-row">
                    <span className="active-label">Active Filters:</span>
                    {activeFilterList.map(f => (
                        <button key={f.id} className="active-chip" onClick={() => removeFilter(f.key)}>
                            {f.label} <span className="chip-remove">✕</span>
                        </button>
                    ))}
                    <button className="clear-all-btn" onClick={() => setFilters({})}>Clear All</button>
                </div>
            )}

            {/* 3. Faceted Filter Panel */}
            <div className="faceted-filters">
                <div className="facet-group">
                    <span className="facet-label">Categories</span>
                    <div className="facet-options">
                        {categories.slice(0, 8).map((cat: any) => (
                            <button
                                key={cat.id}
                                className={`facet-pill ${activeFilters.category === cat.id ? 'active' : ''}`}
                                onClick={() => setFilters({ ...activeFilters, category: cat.id === activeFilters.category ? 'all' : cat.id })}
                            >
                                <span className="facet-pill-icon">{cat.icon}</span>
                                <span className="facet-pill-label">{cat.label}</span>
                                <span className="facet-pill-count">{cat.count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="facet-group">
                    <span className="facet-label">Brands</span>
                    <div className="facet-options">
                        {brands.slice(0, 10).map((b: any) => (
                            <button
                                key={b.name}
                                className={`facet-pill ${activeFilters.brand === b.name ? 'active' : ''}`}
                                onClick={() => setFilters({ ...activeFilters, brand: b.name === activeFilters.brand ? 'all' : b.name })}
                            >
                                {b.name} <span className="facet-pill-count">{b.count}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
