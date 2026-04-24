import { Product } from '../core/schema';
import { ValidationReport } from '../core/validator';
import { Persistence } from '../services/persistence';

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

export type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

interface State {
    products: Product[];
    filteredProducts: Product[];
    searchQuery: string;
    activeFilters: Record<string, string | string[]>;
    importStatus: ImportStatus;
    importError: string | null;
    importReport: ValidationReport | null;
}

type Listener = (state: State) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Store (Observer pattern — single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

class Store {
    private state: State = {
        products: [],
        filteredProducts: [],
        searchQuery: '',
        activeFilters: {},
        importStatus: 'idle',
        importError: null,
        importReport: null,
    };

    private listeners: Set<Listener> = new Set();

    getState() {
        return this.state;
    }

    private setState(newState: Partial<State>) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }

    // ── Domain Actions ────────────────────────────────────────────────────────

    /** Called when a file is selected and parsing begins. */
    importStarted() {
        this.setState({ importStatus: 'loading', importError: null });
    }

    /** Called when parsing + enrichment completes successfully. */
    importSucceeded(products: Product[], report: ValidationReport | null = null) {
        this.setState({
            products,
            filteredProducts: products,
            importStatus: 'success',
            importError: null,
            importReport: report,
        });
    }

    /** Called when any stage of import fails. */
    importFailed(message: string) {
        this.setState({ importStatus: 'error', importError: message });
    }

    /** Dispatches an updated product back through the store (correct way to mutate). */
    updateProduct(updated: Product) {
        const products = this.state.products.map(p =>
            p.identity.id === updated.identity.id ? updated : p
        );
        // NOTE: Only update `products` here. `filteredProducts` is derived by the
        // Dashboard via useMemo(Engine.filterProducts) so we must NOT overwrite it
        // here — doing so would clear any active search/filter the user has set.
        this.setState({ products });
        // [PH4-B] Persist via IndexedDB (updateOne is far cheaper than saveAll)
        Persistence.updateOne(updated).catch(e =>
            console.error('[Store] Failed to persist product update:', e)
        );
    }

    /**
     * Apply a percentage markup/markdown to the typical retail price of many products at once.
     * pct is a percent delta: +10 = raise 10%, -15 = mark down 15%.
     */
    bulkAdjustPrice(ids: string[], pct: number) {
        if (!ids.length || !Number.isFinite(pct)) return;
        const idSet = new Set(ids);
        const factor = 1 + pct / 100;
        const products = this.state.products.map(p => {
            if (!idSet.has(p.identity.id)) return p;
            const pr = p.commercial?.priceRange;
            if (!pr || !pr.typical) return p;
            return {
                ...p,
                commercial: {
                    ...p.commercial,
                    priceRange: {
                        ...pr,
                        typical: Math.round(pr.typical * factor),
                        min: pr.min != null ? Math.round(pr.min * factor) : pr.min,
                        max: pr.max != null ? Math.round(pr.max * factor) : pr.max,
                    },
                },
            };
        });
        this.setState({ products });
        Persistence.saveAll(products).catch(e =>
            console.error('[Store] Failed to persist bulk price:', e)
        );
    }

    /** Delete products by id (single or bulk). Persists the change to IDB. */
    deleteProducts(ids: string[]) {
        if (!ids.length) return;
        const idSet = new Set(ids);
        const products = this.state.products.filter(p => !idSet.has(p.identity.id));
        this.setState({ products });
        Persistence.saveAll(products).catch(e =>
            console.error('[Store] Failed to persist delete:', e)
        );
    }

    // ── Filter / Search Actions ───────────────────────────────────────────────

    setSearchQuery(query: string) {
        this.setState({ searchQuery: query });
    }

    setFilters(filters: Record<string, string | string[]>) {
        this.setState({ activeFilters: filters });
    }

    // ── Legacy compat shims (remove after full migration) ────────────────────

    /** @deprecated Use importSucceeded() instead */
    setProducts(products: Product[]) {
        this.importSucceeded(products);
    }

    /** @deprecated Use importStarted() instead */
    setLoading(isLoading: boolean) {
        if (isLoading) this.importStarted();
    }

    /** @deprecated Use importFailed() instead */
    setError(error: string | null) {
        if (error) this.importFailed(error);
    }
}

export const inventoryStore = new Store();
