/**
 * Settings Service — centralized user preferences.
 * Persisted to localStorage (small payload, sync access).
 * Observable: components subscribe via useSettings hook.
 */

export type ThemeMode = 'dark' | 'light' | 'glass';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Locale = 'fr-DZ' | 'fr-FR' | 'en-US' | 'ar-DZ';
export type ScraperProvider = 'firecrawl' | 'duckduckgo' | 'both' | 'none';

export interface Settings {
    theme: {
        mode: ThemeMode;
        accentColor: string;
        density: Density;
    };
    llm: {
        url: string;
        model: string;
        key: string;
        temperature: number;
        maxTokens: number;
        systemPrompt: string;
    };
    scraping: {
        provider: ScraperProvider;
        firecrawlKey: string;
        maxSourcesPerProduct: number;
        timeoutMs: number;
    };
    enrichment: {
        autoEnrichOnImport: boolean;
        retryOnValidationError: boolean;
        retryAttempts: number;
        priorityBrands: string[];
    };
    locale: {
        currency: string;
        language: Locale;
    };
    cardLayout: {
        showImage: boolean;
        showPrice: boolean;
        showStock: boolean;
        showSpecs: boolean;
        showMarketIntel: boolean;
        showMarketing: boolean;
        showAIVerdict: boolean;
    };
    performance: {
        graphLodThreshold: number;
        cacheCapMb: number;
    };
}

export const DEFAULT_SETTINGS: Settings = {
    theme: { mode: 'dark', accentColor: '#7c4dff', density: 'comfortable' },
    llm: {
        url: '/api/llm',
        model: 'local-model',
        key: '',
        temperature: 0.3,
        maxTokens: 1024,
        systemPrompt: 'You are a product intelligence assistant. Output strict JSON only.',
    },
    scraping: {
        provider: 'duckduckgo',
        firecrawlKey: '',
        maxSourcesPerProduct: 5,
        timeoutMs: 15000,
    },
    enrichment: {
        autoEnrichOnImport: false,
        retryOnValidationError: true,
        retryAttempts: 2,
        priorityBrands: [],
    },
    locale: { currency: 'DZD', language: 'fr-DZ' },
    cardLayout: {
        showImage: true,
        showPrice: true,
        showStock: true,
        showSpecs: true,
        showMarketIntel: true,
        showMarketing: true,
        showAIVerdict: true,
    },
    performance: { graphLodThreshold: 5000, cacheCapMb: 200 },
};

const STORAGE_KEY = 'pkos_settings_v1';

type Listener = (s: Settings) => void;

class SettingsStore {
    private state: Settings;
    private listeners = new Set<Listener>();

    constructor() {
        this.state = this.load();
    }

    private load(): Settings {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULT_SETTINGS);
            const parsed = JSON.parse(raw);
            return this.merge(DEFAULT_SETTINGS, parsed);
        } catch {
            return structuredClone(DEFAULT_SETTINGS);
        }
    }

    private merge(base: any, patch: any): any {
        const out: any = Array.isArray(base) ? [...base] : { ...base };
        for (const k of Object.keys(patch || {})) {
            const bv = (base as any)[k];
            const pv = patch[k];
            if (bv && typeof bv === 'object' && !Array.isArray(bv) && pv && typeof pv === 'object') {
                out[k] = this.merge(bv, pv);
            } else if (pv !== undefined) {
                out[k] = pv;
            }
        }
        return out;
    }

    private persist() {
        try {
            const clone = structuredClone(this.state);
            clone.llm.key = '';
            clone.scraping.firecrawlKey = '';
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clone));
        } catch (e) {
            console.error('[Settings] Failed to persist:', e);
        }
    }

    private notify() {
        for (const l of this.listeners) l(this.state);
    }

    getState(): Settings {
        return this.state;
    }

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    update<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
        this.state = {
            ...this.state,
            [section]: { ...this.state[section], ...patch },
        };
        this.persist();
        this.applyTheme();
        this.notify();
    }

    replace(next: Settings) {
        this.state = this.merge(DEFAULT_SETTINGS, next);
        this.persist();
        this.applyTheme();
        this.notify();
    }

    reset() {
        this.state = structuredClone(DEFAULT_SETTINGS);
        this.persist();
        this.applyTheme();
        this.notify();
    }

    applyTheme() {
        const { theme } = this.state;
        const root = document.documentElement;
        root.style.setProperty('--accent-primary', theme.accentColor);
        root.dataset.theme = theme.mode;
        root.dataset.density = theme.density;
    }
}

export const settingsStore = new SettingsStore();
settingsStore.applyTheme();
