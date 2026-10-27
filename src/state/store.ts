import { Product } from '../core/schema';
import { ValidationReport } from '../core/validator';
import { Persistence } from '../services/persistence';
import { invalidateVelocityCache } from '../services/velocity';
import { invalidateForecastCache } from '../services/forecast';

/** Invalidates all derived analytics caches. Call after any product mutation. */
function bustAnalyticsCaches() {
    invalidateVelocityCache();
    invalidateForecastCache();
}

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
    /** Monotonically-increasing timestamp — bumped on every product mutation.
     *  Used as cache invalidation key by analytics/velocity/forecast services.
     *  Changes even when products.length stays the same (e.g. enrichment, price edit). */
    lastMutated: number;
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
        lastMutated: 0,
    };

    private listeners: Set<Listener> = new Set();

    getState() {
        return this.state;
    }

    private setState(newState: Partial<State>) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
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
    importSucceeded(newProducts: Product[], report: ValidationReport | null = null) {
        const existing = [...this.state.products];
        const existingBySku = new Map<string, number>();
        const existingByBarcode = new Map<string, number>();
        
        existing.forEach((p, index) => {
            if (p.identity.sku) existingBySku.set(p.identity.sku, index);
            if (p.enrichment?.barcode) existingByBarcode.set(p.enrichment.barcode, index);
        });

        for (const np of newProducts) {
            let matchIndex = -1;
            if (np.identity.sku && existingBySku.has(np.identity.sku)) {
                matchIndex = existingBySku.get(np.identity.sku)!;
            } else if (np.enrichment?.barcode && existingByBarcode.has(np.enrichment.barcode)) {
                matchIndex = existingByBarcode.get(np.enrichment.barcode)!;
            }

            if (matchIndex >= 0) {
                // Deduplicate: Keep the existing ID so IDB updates instead of duplicating
                np.identity.id = existing[matchIndex].identity.id;
                existing[matchIndex] = np;
            } else {
                existing.push(np);
            }
        }

        this.setState({
            products: existing,
            filteredProducts: existing,
            importStatus: 'success',
            importError: null,
            importReport: report,
            lastMutated: Date.now(),
        });
        bustAnalyticsCaches();
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
        this.setState({ products, lastMutated: Date.now() });
        bustAnalyticsCaches();
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
        const changed: Product[] = [];
        const products = this.state.products.map(p => {
            if (!idSet.has(p.identity.id)) return p;
            const pr = p.commercial?.priceRange;
            if (!pr || !pr.typical) return p;
            const updated = {
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
            changed.push(updated);
            return updated;
        });
        this.setState({ products, lastMutated: Date.now() });
        bustAnalyticsCaches();
        if (changed.length > 0) {
            Persistence.putMany(changed).catch(e =>
                console.error('[Store] Failed to persist bulk price:', e)
            );
        }
    }

    deleteProducts(ids: string[]) {
        if (!ids.length) return;
        const idSet = new Set(ids);
        const products = this.state.products.filter(p => !idSet.has(p.identity.id));
        this.setState({ products, lastMutated: Date.now() });
        bustAnalyticsCaches();
        Persistence.deleteMany(ids).catch(e =>
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
