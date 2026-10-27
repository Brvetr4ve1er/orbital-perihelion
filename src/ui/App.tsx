import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { inventoryStore } from '../state/store';
import { Persistence } from '../services/persistence';
import { Dashboard } from './features/dashboard/Dashboard';
import { LLMConnector } from './components/LLMConnector';
import { EnrichmentQueuePanel } from './features/dashboard/EnrichmentQueuePanel';
// TamboProvider removed — was wrapping the entire tree but never consumed
import { LLMService } from '../services/llm';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { Toaster } from './components/Toaster';
import { ConfirmHost, confirm } from './components/ConfirmDialog';
import { CommandPalette, Command } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { toasts } from '../services/toast';
import { Welcome } from './components/Welcome';
import { GuidedTour, resetTour } from './components/GuidedTour';
import { generateSampleProducts, generateStressTestProducts } from '../services/sample-data';
import { downloadCSV, downloadShopifyCSV, downloadJSON } from '../services/csv-export';
import { EnrichmentQueue } from '../services/enrichment-queue';
import { Product } from '../core/schema';
import { SalesService, parseSalesCSV } from '../services/sales';

// ─────────────────────────────────────────────────────────────────────────────
// App Root — Shopify-style admin shell
// ─────────────────────────────────────────────────────────────────────────────

export const App = () => {
    const [state, setState] = useState(inventoryStore.getState());
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [, setFocusedProduct] = useState<Product | null>(null);
    const [tourForceOpen, setTourForceOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        LLMService.ping().catch(e => console.warn('[App] LLM ping failed:', e));
        SalesService.loadAll().catch(e => console.warn('[App] Sales load failed:', e));
        const unsubscribe = inventoryStore.subscribe(setState);
        Persistence.loadAll().then(products => {
            if (products.length > 0) {
                if (!products[0].identity) {
                    console.warn('[App] Legacy data detected in IDB. Clearing.');
                    Persistence.clear();
                } else {
                    inventoryStore.importSucceeded(products);
                }
            }
        }).catch(e => console.error('[App] Failed to restore inventory:', e));
        return () => { unsubscribe(); };
    }, []);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        inventoryStore.importStarted();
        const progressId = toasts.progress('Importing CSV', file.name);

        const reader = new FileReader();
        const worker = new Worker(
            new URL('../workers/import.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (evt) => {
            const msg = evt.data;
            if (msg.type === 'progress') {
                toasts.update(progressId, { message: `Processing ${msg.current}/${msg.total}…` });
            } else if (msg.type === 'success') {
                console.log('[App] Import success:', msg.products?.length, 'products');
                inventoryStore.importSucceeded(msg.products, msg.report);
                Persistence.saveAll(msg.products).catch(err =>
                    console.error('[App] Failed to persist import:', err)
                );
                toasts.dismiss(progressId);
                toasts.success(`Imported ${msg.products.length} products`, 'Ready to explore');
                worker.terminate();
            } else if (msg.type === 'error') {
                console.error('[App] Import worker error:', msg.message);
                inventoryStore.importFailed(msg.message);
                toasts.dismiss(progressId);
                toasts.error('Import failed', msg.message);
                worker.terminate();
            }
        };

        worker.onerror = () => {
            inventoryStore.importFailed('Erreur interne du worker CSV.');
            toasts.dismiss(progressId);
            toasts.error('Worker error', 'CSV worker crashed');
            worker.terminate();
        };

        reader.onload = (event) => {
            worker.postMessage({ csvText: event.target?.result as string });
        };
        reader.onerror = () => {
            inventoryStore.importFailed('Impossible de lire le fichier.');
            toasts.dismiss(progressId);
            toasts.error('File read failed');
            worker.terminate();
        };
        reader.readAsText(file, 'utf-8');
    }, []);

    const isLoading = state.importStatus === 'loading';
    const hasError = state.importStatus === 'error';
    const hasProducts = state.products.length > 0;

    // ── Actions ───────────────────────────────────────────────────────────────
    const loadSampleData = useCallback(() => {
        const products = generateSampleProducts();
        inventoryStore.importSucceeded(products);
        Persistence.saveAll(products).catch(err => console.error(err));
        toasts.success(`Loaded ${products.length} sample products`, 'Explore every view');
    }, []);

    const loadStressData = useCallback(() => {
        const progressId = toasts.progress('Generating stress test data', '5,000 products');
        setTimeout(() => {
            const products = generateStressTestProducts(5000);
            inventoryStore.importSucceeded(products);
            // Too large to persist synchronously without lag, so we'll save it asynchronously or skip
            Persistence.saveAll(products).catch(err => console.error(err));
            toasts.dismiss(progressId);
            toasts.success(`Loaded ${products.length} stress products`, 'Ready to test limits');
        }, 100);
    }, []);

    const exportAll = useCallback(() => {
        if (!state.products.length) {
            toasts.warning('Nothing to export');
            return;
        }
        downloadCSV(state.products);
        toasts.success(`Exported ${state.products.length} products`);
    }, [state.products]);

    const exportShopify = useCallback(() => {
        if (!state.products.length) {
            toasts.warning('Nothing to export');
            return;
        }
        downloadShopifyCSV(state.products);
        toasts.success(`Exported ${state.products.length} products`, 'Ready to import into Shopify');
    }, [state.products]);

    const exportJSON = useCallback(() => {
        if (!state.products.length) {
            toasts.warning('Nothing to export');
            return;
        }
        downloadJSON(state.products);
        toasts.success(`Cold storage export complete`, `${state.products.length} products saved`);
    }, [state.products]);

    const enrichAll = useCallback(() => {
        if (!state.products.length) return;
        EnrichmentQueue.enqueueAll();
        EnrichmentQueue.start();
        toasts.info('Enrichment started', 'Watch the queue panel');
    }, [state.products]);

    const clearAll = useCallback(async () => {
        const ok = await confirm({
            title: 'Clear entire catalog?',
            message: `This will delete all ${state.products.length} products. Cannot be undone.`,
            confirmLabel: 'Clear all',
            destructive: true,
        });
        if (!ok) return;
        inventoryStore.deleteProducts(state.products.map(p => p.identity.id));
        await Persistence.clear();
        toasts.success('Catalog cleared');
    }, [state.products]);

    const triggerImport = useCallback(() => {
        document.getElementById('csv-file-input')?.click();
    }, []);

    // ── Sales CSV import ────────────────────────────────────────────────────
    const handleSalesUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const progressId = toasts.progress('Importing sales', file.name);
        try {
            const text = await file.text();
            const { rows, diagnostic } = parseSalesCSV(text);
            if (!rows.length) {
                toasts.dismiss(progressId);
                toasts.error('No sales rows detected', diagnostic);
                return;
            }
            await SalesService.addMany(rows);
            toasts.dismiss(progressId);
            toasts.success(`Imported ${rows.length} sales`, diagnostic);
        } catch (err: any) {
            toasts.dismiss(progressId);
            toasts.error('Sales import failed', err?.message || String(err));
        }
    }, []);

    const triggerSalesImport = useCallback(() => {
        document.getElementById('sales-file-input')?.click();
    }, []);

    const clearSales = useCallback(async () => {
        const ok = await confirm({
            title: 'Clear sales history?',
            message: 'Deletes all sales records. Products are not affected.',
            confirmLabel: 'Clear sales',
            destructive: true,
        });
        if (!ok) return;
        await SalesService.clear();
        toasts.success('Sales history cleared');
    }, []);

    // ── Commands for the palette ──────────────────────────────────────────────
    const commands: Command[] = useMemo(() => [
        { id: 'import-csv', label: 'Import CSV', icon: '📥', section: 'actions', shortcut: '⌘I', run: triggerImport },
        { id: 'import-sales', label: 'Import sales CSV', icon: '📊', section: 'actions', hint: 'Shopify / Woo / Square', run: triggerSalesImport },
        { id: 'load-sample', label: 'Load sample data', icon: '✨', section: 'actions', hint: '24 products', run: loadSampleData },
        { id: 'load-stress', label: 'Load stress test data', icon: '🔥', section: 'data', hint: '5,000 products', run: loadStressData },
        { id: 'export-csv', label: 'Export all to CSV', icon: '⬇', section: 'actions', shortcut: '⌘E', run: exportAll },
        { id: 'export-shopify', label: 'Export to Shopify CSV', icon: '🛍', section: 'actions', hint: 'Matches Shopify Products import spec', run: exportShopify },
        { id: 'export-json', label: 'Export Cold Storage Backup (JSON)', icon: '💾', section: 'actions', hint: 'Full state export', run: exportJSON },
        { id: 'enrich-all', label: 'Enrich all products with AI', icon: '✨', section: 'actions', run: enrichAll },
        { id: 'clear-all', label: 'Clear entire catalog', icon: '🗑', section: 'actions', run: clearAll },
        { id: 'clear-sales', label: 'Clear sales history', icon: '🗑', section: 'actions', run: clearSales },
        { id: 'settings', label: 'Ouvrir les paramètres', icon: '⚙️', section: 'navigation', shortcut: '⌘,', run: () => setSettingsOpen(true) },
        { id: 'shortcuts', label: 'Afficher les raccourcis clavier', icon: '⌨', section: 'navigation', shortcut: '?', run: () => setShortcutsOpen(true) },
        { id: 'tour', label: 'Refaire la visite guidée', icon: '🧭', section: 'navigation', hint: 'Tour de l\'interface en 4 étapes',
          run: () => { resetTour(); setTourForceOpen(true); } },
    ], [triggerImport, triggerSalesImport, loadSampleData, loadStressData, exportAll, exportShopify, exportJSON, enrichAll, clearAll, clearSales]);

    const onPickProduct = useCallback((p: Product) => {
        setFocusedProduct(p);
        toasts.info(p.identity.name, 'Selected — open the grid to view');
    }, []);

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    useKeyboardShortcuts(useMemo(() => [
        { combo: 'mod+k', description: 'Open command palette', allowInInput: true,
          handler: (e) => { e.preventDefault(); setPaletteOpen(true); } },
        { combo: '/', description: 'Focus search',
          handler: (e) => { e.preventDefault(); searchInputRef.current?.focus(); } },
        { combo: '?', description: 'Show shortcuts',
          handler: (e) => { e.preventDefault(); setShortcutsOpen(true); } },
        { combo: 'mod+e', description: 'Export CSV', allowInInput: true,
          handler: (e) => { e.preventDefault(); exportAll(); } },
        { combo: 'mod+,', description: 'Open settings', allowInInput: true,
          handler: (e) => { e.preventDefault(); setSettingsOpen(true); } },
        { combo: 'Escape', description: 'Close modal', allowInInput: true,
          handler: () => {
              if (paletteOpen) setPaletteOpen(false);
              else if (shortcutsOpen) setShortcutsOpen(false);
              else if (settingsOpen) setSettingsOpen(false);
          } },
    ], [paletteOpen, shortcutsOpen, settingsOpen, exportAll]));

    return (
            <div className="app-container">
                {/* Shopify-style 3-zone header */}
                <header className="header header-shopify">
                    <div className="header-inner">
                        <div className="header-zone header-left">
                            <div className="logo" title="Tableau de bord">
                                <div className="logo-icon">⚡</div>
                                <span className="logo-text">Shopifoo</span>
                            </div>
                        </div>

                        <div className="header-zone header-center">
                            <button
                                className="global-search"
                                onClick={() => setPaletteOpen(true)}
                                aria-label="Search or run command"
                                data-tour-id="search"
                            >
                                <span className="gs-icon">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                </span>
                                <span className="gs-placeholder">Rechercher un produit, une action…</span>
                                <kbd className="gs-kbd">⌘K</kbd>
                            </button>
                        </div>

                        <div className="header-zone header-right">
                            {hasProducts && <EnrichmentQueuePanel />}
                            <button
                                className="header-icon-btn"
                                onClick={() => setShortcutsOpen(true)}
                                data-tip="Raccourcis clavier"
                                aria-label="Raccourcis clavier"
                            >⌨</button>
                            <button
                                className="header-icon-btn"
                                onClick={() => setSettingsOpen(true)}
                                data-tip="Paramètres"
                                aria-label="Paramètres"
                            >⚙️</button>
                            <label className="btn btn-ghost" title="Importer un fichier de ventes">
                                <span aria-hidden>📊</span>&nbsp;Ventes
                                <input
                                    id="sales-file-input"
                                    type="file"
                                    accept=".csv,.txt"
                                    style={{ display: 'none' }}
                                    onChange={handleSalesUpload}
                                />
                            </label>
                            <label className={`btn btn-primary ${isLoading ? 'is-disabled' : ''}`}>
                                <span aria-hidden>📥</span>&nbsp;{isLoading ? 'Importation…' : 'Importer'}
                                <input
                                    id="csv-file-input"
                                    type="file"
                                    accept=".csv,.txt"
                                    style={{ display: 'none' }}
                                    disabled={isLoading}
                                    onChange={handleFileUpload}
                                />
                            </label>
                            <div className="header-llm-quiet">
                                <LLMConnector />
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    {isLoading && (
                        <div className="loading-state">
                            <div className="loading-spinner" />
                            <p>Analyse du fichier en cours…</p>
                        </div>
                    )}

                    {!isLoading && hasError && (
                        <div className="empty-state">
                            <h2>Erreur d'importation</h2>
                            <p className="error-message">{state.importError}</p>
                            <div className="empty-actions">
                                <button className="btn btn-primary" onClick={triggerImport}>Réessayer</button>
                                <button className="btn btn-ghost" onClick={loadSampleData}>Données de démonstration</button>
                            </div>
                        </div>
                    )}

                    {!isLoading && !hasError && !hasProducts && (
                        <Welcome
                            onTrySample={loadSampleData}
                            onImportCSV={triggerImport}
                        />
                    )}

                    {!isLoading && hasProducts && (
                        <ErrorBoundary>
                            <Dashboard />
                        </ErrorBoundary>
                    )}
                </main>

                {/* Floating overlays */}
                <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
                <CommandPalette
                    open={paletteOpen}
                    onClose={() => setPaletteOpen(false)}
                    commands={commands}
                    products={state.products}
                    onPickProduct={onPickProduct}
                />
                <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
                <GuidedTour
                    eligible={hasProducts && !isLoading}
                    forceOpen={tourForceOpen}
                    onClose={() => setTourForceOpen(false)}
                />
                <Toaster />
                <ConfirmHost />
            </div>
    );
};
