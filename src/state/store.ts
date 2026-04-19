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
