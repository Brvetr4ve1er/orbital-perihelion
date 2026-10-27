import React, { useState } from 'react';
import { settingsStore, DEFAULT_SETTINGS, ThemeMode, Density, Locale, ScraperProvider } from '../../../services/settings';
import { useSettings } from './useSettings';
import { Persistence } from '../../../services/persistence';

interface Props {
    open: boolean;
    onClose: () => void;
}

type TabId = 'theme' | 'llm' | 'scraping' | 'enrichment' | 'locale' | 'card' | 'performance' | 'backup';

const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'theme', label: 'Theme', icon: '🎨' },
    { id: 'llm', label: 'LLM', icon: '🧠' },
    { id: 'scraping', label: 'Scraping', icon: '🌐' },
    { id: 'enrichment', label: 'Enrichment', icon: '✨' },
    { id: 'locale', label: 'Locale', icon: '🌍' },
    { id: 'card', label: 'Card Layout', icon: '🃏' },
    { id: 'performance', label: 'Performance', icon: '⚡' },
    { id: 'backup', label: 'Backup', icon: '💾' },
];

const CARD_LAYOUT_FIELDS: Array<{
    key: keyof ReturnType<typeof useSettings>['cardLayout'];
    label: string;
    description: string;
}> = [
    { key: 'showImage', label: 'Image produit', description: 'Affiche l’image principale dans les cartes et le panneau produit.' },
    { key: 'showPrice', label: 'Prix', description: 'Affiche le prix de vente dans les cartes et le détail produit.' },
    { key: 'showStock', label: 'Stock', description: 'Affiche la quantité, la jauge de stock et les signaux de couverture.' },
    { key: 'showSpecs', label: 'Spécifications', description: 'Affiche les specs rapides dans les cartes et la fiche produit.' },
    { key: 'showMarketIntel', label: 'Marché', description: 'Affiche la concurrence, les écarts de prix et les sources trouvées.' },
    { key: 'showMarketing', label: 'Marketing', description: 'Affiche la description marketing et le contenu SEO.' },
    { key: 'showAIVerdict', label: 'Verdict IA', description: 'Affiche pros, cons, buyer fit et badges d’enrichissement.' },
];

export const SettingsPanel: React.FC<Props> = ({ open, onClose }) => {
    const settings = useSettings();
    const [tab, setTab] = useState<TabId>('theme');
    const [importMsg, setImportMsg] = useState<string | null>(null);

    if (!open) return null;

    const exportAll = async () => {
        const products = await Persistence.loadAll();
        const safeSettings = structuredClone(settings);
        safeSettings.llm.key = '';
        safeSettings.scraping.firecrawlKey = '';
        const payload = { settings: safeSettings, products, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pkos-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (data.settings) settingsStore.replace(data.settings);
                if (Array.isArray(data.products)) {
                    await Persistence.saveAll(data.products);
                    setImportMsg(`Imported ${data.products.length} products. Reload to see them.`);
                } else {
                    setImportMsg('Settings imported. Products not found in file.');
                }
            } catch (err: any) {
                setImportMsg(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };

    const wipeAll = async () => {
        if (!confirm('Wipe all products AND settings? This cannot be undone.')) return;
        await Persistence.clear();
        settingsStore.reset();
        setImportMsg('All data cleared. Reload the page.');
    };

    const applyCardPreset = (preset: 'focused' | 'balanced' | 'dense') => {
        if (preset === 'focused') {
            settingsStore.update('cardLayout', {
                showImage: true,
                showPrice: true,
                showStock: true,
                showSpecs: false,
                showMarketIntel: false,
                showMarketing: false,
                showAIVerdict: false,
            });
            return;
        }
        if (preset === 'dense') {
            settingsStore.update('cardLayout', {
                showImage: false,
                showPrice: true,
                showStock: true,
                showSpecs: true,
                showMarketIntel: true,
                showMarketing: false,
                showAIVerdict: true,
            });
            return;
        }
        settingsStore.update('cardLayout', {
            showImage: true,
            showPrice: true,
            showStock: true,
            showSpecs: true,
            showMarketIntel: true,
            showMarketing: true,
            showAIVerdict: true,
        });
    };

    return (
        <div className="modal-overlay modal-overlay--safe" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <header className="settings-header">
                    <h2>⚙️ Settings</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </header>
                <div className="settings-body">
                    <nav className="settings-tabs">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                className={`settings-tab ${tab === t.id ? 'active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                <span>{t.icon}</span> {t.label}
                            </button>
                        ))}
                    </nav>
                    <section className="settings-content">
                        {tab === 'theme' && (
                            <div className="settings-section">
                                <h3>Appearance</h3>
                                <Field label="Mode">
                                    <select
                                        value={settings.theme.mode}
                                        onChange={e => settingsStore.update('theme', { mode: e.target.value as ThemeMode })}
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                        <option value="glass">Glass</option>
                                    </select>
                                </Field>
                                <Field label="Accent color">
                                    <input
                                        type="color"
                                        value={settings.theme.accentColor}
                                        onChange={e => settingsStore.update('theme', { accentColor: e.target.value })}
                                    />
                                </Field>
                                <Field label="Density">
                                    <select
                                        value={settings.theme.density}
                                        onChange={e => settingsStore.update('theme', { density: e.target.value as Density })}
                                    >
                                        <option value="compact">Compact</option>
                                        <option value="comfortable">Comfortable</option>
                                        <option value="spacious">Spacious</option>
                                    </select>
                                </Field>
                            </div>
                        )}

                        {tab === 'llm' && (
                            <div className="settings-section">
                                <h3>Local / Online LLM</h3>
                                <Field label="Endpoint URL">
                                    <input value={settings.llm.url} onChange={e => settingsStore.update('llm', { url: e.target.value })} />
                                </Field>
                                <Field label="Model">
                                    <input value={settings.llm.model} onChange={e => settingsStore.update('llm', { model: e.target.value })} />
                                </Field>
                                <Field label="API Key">
                                    <input type="password" value={settings.llm.key} onChange={e => settingsStore.update('llm', { key: e.target.value })} />
                                </Field>
                                <Field label={`Temperature (${settings.llm.temperature})`}>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={settings.llm.temperature}
                                        onChange={e => settingsStore.update('llm', { temperature: parseFloat(e.target.value) })}
                                    />
                                </Field>
                                <Field label="Max tokens">
                                    <input type="number" min="64" max="8192"
                                        value={settings.llm.maxTokens}
                                        onChange={e => settingsStore.update('llm', { maxTokens: parseInt(e.target.value) || 1024 })}
                                    />
                                </Field>
                                <Field label="System prompt" vertical>
                                    <textarea
                                        rows={4}
                                        value={settings.llm.systemPrompt}
                                        onChange={e => settingsStore.update('llm', { systemPrompt: e.target.value })}
                                    />
                                </Field>
                            </div>
                        )}

                        {tab === 'scraping' && (
                            <div className="settings-section">
                                <h3>Web Scraping</h3>
                                <Field label="Provider">
                                    <select
                                        value={settings.scraping.provider}
                                        onChange={e => settingsStore.update('scraping', { provider: e.target.value as ScraperProvider })}
                                    >
                                        <option value="none">None</option>
                                        <option value="duckduckgo">DuckDuckGo (local proxy)</option>
                                        <option value="firecrawl">Firecrawl</option>
                                        <option value="both">Both (Firecrawl primary)</option>
                                    </select>
                                </Field>
                                <Field label="Firecrawl API key">
                                    <input
                                        type="password"
                                        value={settings.scraping.firecrawlKey}
                                        onChange={e => settingsStore.update('scraping', { firecrawlKey: e.target.value })}
                                        placeholder="fc-..."
                                    />
                                </Field>
                                <Field label="Max sources per product">
                                    <input type="number" min="1" max="20"
                                        value={settings.scraping.maxSourcesPerProduct}
                                        onChange={e => settingsStore.update('scraping', { maxSourcesPerProduct: parseInt(e.target.value) || 5 })}
                                    />
                                </Field>
                                <Field label="Timeout (ms)">
                                    <input type="number" min="2000" max="60000" step="500"
                                        value={settings.scraping.timeoutMs}
                                        onChange={e => settingsStore.update('scraping', { timeoutMs: parseInt(e.target.value) || 15000 })}
                                    />
                                </Field>
                            </div>
                        )}

                        {tab === 'enrichment' && (
                            <div className="settings-section">
                                <h3>Enrichment Pipeline</h3>
                                <Toggle
                                    label="Auto-enrich on import"
                                    checked={settings.enrichment.autoEnrichOnImport}
                                    onChange={v => settingsStore.update('enrichment', { autoEnrichOnImport: v })}
                                />
                                <Toggle
                                    label="Retry on validation error"
                                    checked={settings.enrichment.retryOnValidationError}
                                    onChange={v => settingsStore.update('enrichment', { retryOnValidationError: v })}
                                />
                                <Field label="Retry attempts">
                                    <input type="number" min="0" max="5"
                                        value={settings.enrichment.retryAttempts}
                                        onChange={e => settingsStore.update('enrichment', { retryAttempts: parseInt(e.target.value) || 0 })}
                                    />
                                </Field>
                                <Field label="Priority brands (comma separated)" vertical>
                                    <input
                                        value={settings.enrichment.priorityBrands.join(', ')}
                                        onChange={e => settingsStore.update('enrichment', {
                                            priorityBrands: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                        })}
                                        placeholder="Samsung, LG, Sony"
                                    />
                                </Field>
                            </div>
                        )}

                        {tab === 'locale' && (
                            <div className="settings-section">
                                <h3>Locale & Currency</h3>
                                <Field label="Currency">
                                    <select
                                        value={settings.locale.currency}
                                        onChange={e => settingsStore.update('locale', { currency: e.target.value })}
                                    >
                                        <option value="DZD">DZD — Algerian Dinar</option>
                                        <option value="EUR">EUR — Euro</option>
                                        <option value="USD">USD — US Dollar</option>
                                        <option value="GBP">GBP — British Pound</option>
                                        <option value="MAD">MAD — Moroccan Dirham</option>
                                    </select>
                                </Field>
                                <Field label="Language">
                                    <select
                                        value={settings.locale.language}
                                        onChange={e => settingsStore.update('locale', { language: e.target.value as Locale })}
                                    >
                                        <option value="fr-DZ">Français (Algérie)</option>
                                        <option value="fr-FR">Français (France)</option>
                                        <option value="en-US">English (US)</option>
                                        <option value="ar-DZ">العربية</option>
                                    </select>
                                </Field>
                            </div>
                        )}

                        {tab === 'card' && (
                            <div className="settings-section">
                                <h3>Personnalisation des cartes produit</h3>
                                <p className="settings-help">
                                    Ces options contrôlent ce que les cartes produit et la fiche produit affichent vraiment.
                                    Utilisez un preset si vous voulez un résultat rapide, puis affinez chaque bloc.
                                </p>
                                <div className="settings-actions settings-actions--presets">
                                    <button className="btn-secondary" onClick={() => applyCardPreset('focused')}>Vue focalisée</button>
                                    <button className="btn-secondary" onClick={() => applyCardPreset('balanced')}>Vue équilibrée</button>
                                    <button className="btn-secondary" onClick={() => applyCardPreset('dense')}>Vue dense</button>
                                </div>
                                <div className="settings-card-grid">
                                    {CARD_LAYOUT_FIELDS.map(field => (
                                        <label key={field.key} className="settings-card-toggle">
                                            <div className="settings-card-toggle-main">
                                                <div>
                                                    <div className="settings-card-toggle-label">{field.label}</div>
                                                    <div className="settings-card-toggle-desc">{field.description}</div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.cardLayout[field.key]}
                                                    onChange={e => settingsStore.update('cardLayout', { [field.key]: e.target.checked } as any)}
                                                />
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {tab === 'performance' && (
                            <div className="settings-section">
                                <h3>Performance</h3>
                                <Field label="Graph LOD threshold (nodes before canvas)">
                                    <input type="number" min="500" max="50000" step="500"
                                        value={settings.performance.graphLodThreshold}
                                        onChange={e => settingsStore.update('performance', { graphLodThreshold: parseInt(e.target.value) || 5000 })}
                                    />
                                </Field>
                                <Field label="IndexedDB cache cap (MB)">
                                    <input type="number" min="50" max="2000" step="50"
                                        value={settings.performance.cacheCapMb}
                                        onChange={e => settingsStore.update('performance', { cacheCapMb: parseInt(e.target.value) || 200 })}
                                    />
                                </Field>
                            </div>
                        )}

                        {tab === 'backup' && (
                            <div className="settings-section">
                                <h3>Backup & Restore</h3>
                                <p className="settings-help">Export your full catalog and settings as JSON, or restore from a previous backup.</p>
                                <div className="settings-actions">
                                    <button className="btn-primary" onClick={exportAll}>📤 Export everything</button>
                                    <label className="btn-secondary">
                                        📥 Import backup
                                        <input type="file" accept=".json" onChange={importAll} style={{ display: 'none' }} />
                                    </label>
                                    <button className="btn-danger" onClick={wipeAll}>🗑 Wipe all data</button>
                                    <button className="btn-secondary" onClick={() => settingsStore.replace(DEFAULT_SETTINGS)}>↺ Reset settings to defaults</button>
                                </div>
                                {importMsg && <div className="settings-msg">{importMsg}</div>}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; vertical?: boolean; children: React.ReactNode }> = ({ label, vertical, children }) => (
    <div className={`settings-field ${vertical ? 'vertical' : ''}`}>
        <label>{label}</label>
        {children}
    </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
    <label className="settings-toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span>{label}</span>
    </label>
);
