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
    { id: 'smart',       label: 'Tri intelligent' },
    { id: 'name',        label: 'Nom A → Z' },
    { id: 'price_asc',   label: 'Prix croissant' },
    { id: 'price_desc',  label: 'Prix décroissant' },
    { id: 'stock_desc',  label: 'Stock décroissant' },
    { id: 'stock_asc',   label: 'Stock croissant' },
    { id: 'margin_desc', label: 'Meilleure marge' },
];

const STOCK_FILTERS: { id: string; label: string }[] = [
    { id: 'all',     label: 'Tous' },
    { id: 'Normal',  label: 'En stock' },
    { id: 'Faible',  label: 'Stock faible' },
    { id: 'Rupture', label: 'Rupture' },
];

const QUICK_VIEWS: { id: string; label: string; hint: string }[] = [
    { id: 'dead_stock',   label: 'Stock mort',        hint: 'Produits avec surplus (≥10 unités sans mouvement)' },
    { id: 'no_image',     label: 'Sans image',        hint: 'Aucune image — enrichir ou télécharger' },
    { id: 'not_enriched', label: 'Non enrichi',       hint: 'Jamais analysé par le pipeline IA' },
    { id: 'low_margin',   label: 'Marge faible',      hint: 'Marge ≤ 15%' },
];

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
            list.push({ id: 'category', key: 'category', label: cat ? cat.label : activeFilters.category });
        }
        if (activeFilters.brand && activeFilters.brand !== 'all') {
            list.push({ id: 'brand', key: 'brand', label: `Marque : ${activeFilters.brand}` });
        }
        return list;
    }, [activeFilters, categories]);

    const removeFilter = (key: string) => {
        setFilters({ ...activeFilters, [key]: 'all' });
    };

    return (
        <section className="query-engine-container">
            {/* 1. Barre de recherche + tri */}
            <div className="query-search-zone">
                <div className="query-input-wrapper">
                    <span className="query-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </span>
                    <input
                        type="text"
                        className="query-input"
                        placeholder="Rechercher un produit, SKU ou catégorie…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="query-clear" onClick={() => setSearchQuery('')}>✕</button>
                    )}
                    <kbd className="query-kbd">⌘K</kbd>
                </div>
                {setSortBy && (
                    <select
                        className="sort-dropdown"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortMode)}
                        title="Ordre de tri"
                    >
                        {SORT_OPTIONS.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* 2. Filtres rapides : statut stock */}
            <div className="stock-quick-row">
                <span className="filter-section-label">Statut</span>
                {STOCK_FILTERS.map(s => (
                    <button
                        key={s.id}
                        className={`stock-pill ${(activeFilters.stock || 'all') === s.id ? 'active' : ''}`}
                        onClick={() => setFilters({ ...activeFilters, stock: s.id })}
                    >
                        <span>{s.label}</span>
                    </button>
                ))}
                <span className="stock-divider" />
                <span className="filter-section-label">Vue rapide</span>
                {QUICK_VIEWS.map(v => (
                    <button
                        key={v.id}
                        className={`stock-pill quick-view ${activeFilters.view === v.id ? 'active' : ''}`}
                        onClick={() => setFilters({ ...activeFilters, view: activeFilters.view === v.id ? undefined : v.id })}
                        title={v.hint}
                    >
                        <span>{v.label}</span>
                    </button>
                ))}
            </div>

            {/* 3. Filtres actifs */}
            {activeFilterList.length > 0 && (
                <div className="active-filters-row">
                    <span className="active-label">Filtres actifs :</span>
                    {activeFilterList.map(f => (
                        <button key={f.id} className="active-chip" onClick={() => removeFilter(f.key)}>
                            {f.label} <span className="chip-remove">✕</span>
                        </button>
                    ))}
                    <button className="clear-all-btn" onClick={() => setFilters({})}>Réinitialiser</button>
                </div>
            )}

            {/* 4. Filtres à facettes */}
            <div className="faceted-filters">
                <div className="facet-group">
                    <span className="facet-label">Catégories</span>
                    <div className="facet-options">
                        {categories.slice(0, 8).map((cat: any) => (
                            <button
                                key={cat.id}
                                className={`facet-pill ${activeFilters.category === cat.id ? 'active' : ''}`}
                                onClick={() => setFilters({ ...activeFilters, category: cat.id === activeFilters.category ? 'all' : cat.id })}
                            >
                                <span className="facet-pill-label">{cat.label}</span>
                                <span className="facet-pill-count">{cat.count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="facet-group">
                    <span className="facet-label">Marques</span>
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
