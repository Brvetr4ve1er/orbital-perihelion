import React, { useState, useEffect, useCallback } from 'react';
import { inventoryStore } from '../state/store';
import { ProductValidator } from '../core/validator';
import { EnrichmentService } from '../services/enrichment';
import { Persistence } from '../services/persistence';
import { Dashboard } from './features/dashboard/Dashboard';
import { LLMConnector } from './components/LLMConnector';
import { EnrichmentQueuePanel } from './features/dashboard/EnrichmentQueuePanel';
import { TamboProvider } from '@tambo-ai/react';
import { Parser } from '../core/parser';
import { UniversalCSVParser } from '../core/universal-csv-parser';
import { LLMService } from '../services/llm';
import { SettingsPanel } from './features/settings/SettingsPanel';

// ─────────────────────────────────────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────────────────────────────────────

export const App = () => {
    const [state, setState] = useState(inventoryStore.getState());
    const [settingsOpen, setSettingsOpen] = useState(false);

    useEffect(() => {
        LLMService.ping();
        const unsubscribe = inventoryStore.subscribe(setState);

        // [PH4-B] Restore from IndexedDB (migrates from localStorage automatically)
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

        return () => { 
            unsubscribe(); 
        };
    }, []);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset the input so the same file can be re-imported if needed
        e.target.value = '';

        inventoryStore.importStarted();

        const reader = new FileReader();

        // [PH4-C] Offload parse → enrich → validate to a Web Worker
        // The main thread stays responsive throughout, even for large files
        const worker = new Worker(
            new URL('../workers/import.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                // Could update a finer-grained progress bar here in future
                console.log(`[Worker] Processing ${msg.current}/${msg.total}…`);
            } else if (msg.type === 'success') {
                inventoryStore.importSucceeded(msg.products, msg.report);
                Persistence.saveAll(msg.products).catch(err =>
                    console.error('[App] Failed to persist import:', err)
                );
                console.log(`[App] Import complete — ${msg.products.length} produits chargés.`);
                worker.terminate();
            } else if (msg.type === 'error') {
                inventoryStore.importFailed(msg.message);
                worker.terminate();
            }
        };

        worker.onerror = (e) => {
            inventoryStore.importFailed('Erreur interne du worker CSV.');
            console.error('[Worker] Fatal error:', e);
            worker.terminate();
        };

        reader.onload = (event) => {
            const text = event.target?.result as string;
            worker.postMessage({ csvText: text });
        };
        reader.onerror = () => {
            inventoryStore.importFailed('Impossible de lire le fichier.');
            worker.terminate();
        };
        reader.readAsText(file, 'utf-8');
    }, []);

    const isLoading = state.importStatus === 'loading';
    const hasError = state.importStatus === 'error';
    const hasProducts = state.products.length > 0;

    return (
        <TamboProvider 
            apiKey={import.meta.env.VITE_TAMBO_API_KEY || 'pkos-local-dev-key'}
            userKey={import.meta.env.VITE_TAMBO_USER_KEY || 'admin'}
        >
            <div className="app-container">
                <header className="header">
                    <div className="header-inner">
                        <div className="logo">
                            <div className="logo-icon">⚡</div>
                            <span className="logo-text">PKOS Intelligence</span>
                        </div>
                        <LLMConnector />
                        <button
                            className="header-icon-btn"
                            onClick={() => setSettingsOpen(true)}
                            title="Paramètres"
                        >
                            ⚙️
                        </button>
                        <div className="csv-actions">
                            <label className={`csv-btn csv-btn-upload ${isLoading ? 'csv-btn-disabled' : ''}`}>
                                {isLoading ? '⏳ Chargement…' : '📥 Importer CSV'}
                                <input
                                    id="csv-file-input"
                                    type="file"
                                    accept=".csv,.txt"
                                    style={{ display: 'none' }}
                                    disabled={isLoading}
                                    onChange={handleFileUpload}
                                />
                            </label>
                            {hasProducts && (
                                <span className="import-meta">
                                    {state.products.length} produits
                                </span>
                            )}
                            {hasProducts && <EnrichmentQueuePanel />}
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
                            <div className="empty-icon">⚠️</div>
                            <h2>Erreur d'importation</h2>
                            <p className="error-message">{state.importError}</p>
                        <p className="error-hint">
                            Le parseur universel accepte tout format CSV. Assurez-vous que le fichier contient une colonne de <strong>nom de produit</strong> (ex: Nom, Name, Designation, Libellé…)
                        </p>
                        </div>
                    )}

                    {!isLoading && !hasError && !hasProducts && (
                        <div className="empty-state">
                            <div className="empty-icon">📊</div>
                            <h2>Product Knowledge Operating System</h2>
                            <p>Importez votre fichier inventaire pour commencer.</p>
                            <p className="empty-hint">
                                Tout fichier CSV est accepté : virgule, point-virgule, tabulation. Colonnes reconnues automatiquement (nom, prix, stock, marque…)
                            </p>
                        </div>
                    )}

                    {!isLoading && hasProducts && state.importReport && (
                        <div className="import-toast" style={{ margin: '16px 24px', padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}>
                            ✅ <strong>Import complet :</strong> {state.importReport.total} produits validés. 
                            {state.importReport.missingBrand > 0 && <span style={{ marginLeft: '8px', color: '#fbbf24' }}>⚠️ {state.importReport.missingBrand} sans marque.</span>}
                            {state.importReport.missingPrice > 0 && <span style={{ marginLeft: '8px', color: '#fbbf24' }}>⚠️ {state.importReport.missingPrice} prix manquants.</span>}
                        </div>
                    )}

                    {!isLoading && hasProducts && <Dashboard />}
                </main>
                <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </div>
        </TamboProvider>
    );
};
