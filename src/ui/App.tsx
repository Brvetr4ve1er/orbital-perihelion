import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { inventoryStore } from '../state/store';
import { Persistence } from '../services/persistence';
import { Dashboard } from './features/dashboard/Dashboard';
import { LLMConnector } from './components/LLMConnector';
import { EnrichmentQueuePanel } from './features/dashboard/EnrichmentQueuePanel';
import { TamboProvider } from '@tambo-ai/react';
import { LLMService } from '../services/llm';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { Toaster } from './components/Toaster';
import { ConfirmHost, confirm } from './components/ConfirmDialog';
import { CommandPalette, Command } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { toasts } from '../services/toast';
import { generateSampleProducts } from '../services/sample-data';
import { downloadCSV, downloadShopifyCSV } from '../services/csv-export';
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
    const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        LLMService.ping();
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
                inventoryStore.importSucceeded(msg.products, msg.report);
                Persistence.saveAll(msg.products).catch(err =>
                    console.error('[App] Failed to persist import:', err)
                );
                toasts.dismiss(progressId);
                toasts.success(`Imported ${msg.products.length} products`, 'Ready to explore');
                worker.terminate();
            } else if (msg.type === 'error') {
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
        { id: 'export-csv', label: 'Export all to CSV', icon: '⬇', section: 'actions', shortcut: '⌘E', run: exportAll },
        { id: 'export-shopify', label: 'Export to Shopify CSV', icon: '🛍', section: 'actions', hint: 'Matches Shopify Products import spec', run: exportShopify },
        { id: 'enrich-all', label: 'Enrich all products with AI', icon: '✨', section: 'actions', run: enrichAll },
        { id: 'clear-all', label: 'Clear entire catalog', icon: '🗑', section: 'actions', run: clearAll },
        { id: 'clear-sales', label: 'Clear sales history', icon: '🗑', section: 'actions', run: clearSales },
        { id: 'settings', label: 'Open settings', icon: '⚙️', section: 'navigation', shortcut: '⌘,', run: () => setSettingsOpen(true) },
        { id: 'shortcuts', label: 'Show keyboard shortcuts', icon: '⌨', section: 'navigation', shortcut: '?', run: () => setShortcutsOpen(true) },
    ], [triggerImport, triggerSalesImport, loadSampleData, exportAll, exportShopify, enrichAll, clearAll, clearSales]);

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
        <TamboProvider
            apiKey={import.meta.env.VITE_TAMBO_API_KEY || 'pkos-local-dev-key'}
            userKey={import.meta.env.VITE_TAMBO_USER_KEY || 'admin'}
        >
            <div className="app-container">
                {/* Shopify-style 3-zone header */}
                <header className="header header-shopify">
                    <div className="header-inner">
                        <div className="header-zone header-left">
                            <div className="logo">
                                <div className="logo-icon">⚡</div>
                                <span className="logo-text">PKOS</span>
                            </div>
                        </div>

                        <div className="header-zone header-center">
                            <button
                                className="global-search"
                                onClick={() => setPaletteOpen(true)}
                                aria-label="Search or run command"
                            >
                                <span className="gs-icon">🔎</span>
                                <span className="gs-placeholder">Search products or run command</span>
                                <kbd className="gs-kbd">⌘K</kbd>
                            </button>
                        </div>

                        <div className="header-zone header-right">
                            <LLMConnector />
                            {hasProducts && <EnrichmentQueuePanel />}
                            <button
                                className="header-icon-btn"
                                onClick={() => setShortcutsOpen(true)}
                                title="Keyboard shortcuts (?)"
                            >⌨</button>
                            <button
                                className="header-icon-btn"
                                onClick={() => setSettingsOpen(true)}
                                title="Settings (⌘,)"
                            >⚙️</button>
                            <label className="btn btn-ghost" title="Import sales CSV (Shopify / Woo / Square)">
                                📊 Sales
                                <input
                                    id="sales-file-input"
                                    type="file"
                                    accept=".csv,.txt"
                                    style={{ display: 'none' }}
                                    onChange={handleSalesUpload}
                                />
                            </label>
                            <label className={`btn btn-primary ${isLoading ? 'is-disabled' : ''}`}>
                                {isLoading ? '⏳ Importing…' : '📥 Import CSV'}
                                <input
                                    id="csv-file-input"
                                    type="file"
                                    accept=".csv,.txt"
                                    style={{ display: 'none' }}
                                    disabled={isLoading}
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </div>
                    </div>
                </header>

                <main>
                    {isLoading && (
                        <div className="loading-state">
                            <div className="loading-spinner" />
                            <p>Parsing your CSV…</p>
                        </div>
                    )}

                    {!isLoading && hasError && (
                        <div className="empty-state">
                            <div className="empty-icon">⚠️</div>
                            <h2>Import failed</h2>
                            <p className="error-message">{state.importError}</p>
                            <p className="error-hint">
                                The universal parser accepts any CSV format. Make sure your file has a product-name column (Nom, Name, Designation, Libellé…).
                            </p>
                            <div className="empty-actions">
                                <button className="btn btn-primary" onClick={triggerImport}>📥 Try another file</button>
                                <button className="btn btn-ghost" onClick={loadSampleData}>✨ Load sample data</button>
                            </div>
                        </div>
                    )}

                    {!isLoading && !hasError && !hasProducts && (
                        <div className="empty-state">
                            <div className="empty-icon">📊</div>
                            <h2>Welcome to PKOS</h2>
                            <p>Product Knowledge Operating System — import your catalog to begin.</p>
                            <div className="empty-actions">
                                <button className="btn btn-primary btn-lg" onClick={triggerImport}>📥 Import CSV</button>
                                <button className="btn btn-ghost btn-lg" onClick={loadSampleData}>✨ Try with sample data</button>
                            </div>
                            <p className="empty-hint">
                                Any CSV format works — comma, semicolon, tab. Columns auto-detected (name, price, stock, brand…).
                                <br/>Press <kbd>⌘K</kbd> anywhere to search or run commands.
                            </p>
                        </div>
                    )}

                    {!isLoading && hasProducts && <Dashboard />}
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
                <Toaster />
                <ConfirmHost />
            </div>
        </TamboProvider>
    );
};
