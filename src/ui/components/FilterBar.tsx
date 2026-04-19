import React from 'react';

interface FilterProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    activeFilters: Record<string, any>;
    setFilters: (f: Record<string, any>) => void;
    stats: any;
}

export const FilterBar = ({
    searchQuery,
    setSearchQuery,
    activeFilters,
    setFilters,
    stats
}: FilterProps) => {

    const brands = stats?.brands || [];
    const categories = stats?.categories || [];

    return (
        <section className="controls-section">
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Rechercher un produit, marque..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="filters">
                <div className="filter-group">
                    <span className="filter-group-label">Catégories</span>
                    <div className="filter-pills">
                        <button
                            className={`filter-pill ${!activeFilters.category || activeFilters.category === 'all' ? 'active' : ''}`}
                            onClick={() => setFilters({ ...activeFilters, category: 'all' })}
                        >
                            Tout
                        </button>
                        {categories.map((cat: any) => (
                            <button
                                key={cat.id}
                                className={`filter-pill ${activeFilters.category === cat.id ? 'active' : ''}`}
                                onClick={() => setFilters({ ...activeFilters, category: cat.id })}
                            >
                                {cat.icon} {cat.label} ({cat.count})
                            </button>
                        ))}
                    </div>
                </div>

                <div className="filter-divider" />

                <div className="filter-group">
                    <span className="filter-group-label">Marques</span>
                    <div className="filter-pills">
                        <button
                            className={`filter-pill ${!activeFilters.brand || activeFilters.brand === 'all' ? 'active' : ''}`}
                            onClick={() => setFilters({ ...activeFilters, brand: 'all' })}
                        >
                            Tout
                        </button>
                        {brands.slice(0, 10).map((b: any) => (
                            <button
                                key={b.name}
                                className={`filter-pill ${activeFilters.brand === b.name ? 'active' : ''}`}
                                onClick={() => setFilters({ ...activeFilters, brand: b.name })}
                            >
                                {b.name} ({b.count})
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
