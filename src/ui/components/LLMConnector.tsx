import { useState, useEffect, useCallback } from 'react';
import { LLMService } from '../../services/llm';

// ── Provider presets ──────────────────────────────────────────────────────────
// Any OpenAI-compatible /v1/chat/completions endpoint works. Ollama exposes
// this natively on :11434 and also has /api/tags for live model discovery.
type ProviderId = 'lmstudio' | 'ollama' | 'openai' | 'custom';

interface Preset {
    id: ProviderId;
    label: string;
    icon: string;
    url: string;
    modelPlaceholder: string;
    keyPlaceholder: string;
    modelsEndpoint?: string; // for live discovery
    hint: string;
}

const PRESETS: Preset[] = [
    {
        id: 'lmstudio',
        label: 'LM Studio',
        icon: '🏠',
        url: '/api/llm',
        modelPlaceholder: 'deepseek/deepseek-r1-0528-qwen3-8b',
        keyPlaceholder: 'lm-studio (any value)',
        hint: 'Vite proxy → :1234 — start LM Studio and enable server.',
    },
    {
        id: 'ollama',
        label: 'Ollama',
        icon: '🦙',
        url: '/api/ollama/v1/chat/completions',
        modelsEndpoint: '/api/ollama/api/tags',
        modelPlaceholder: 'llama3.1:8b',
        keyPlaceholder: 'ollama (any value)',
        hint: 'Run `ollama serve` and pull a model, e.g. `ollama pull llama3.1`.',
    },
    {
        id: 'openai',
        label: 'OpenAI-compatible',
        icon: '🌐',
        url: 'https://api.openai.com/v1/chat/completions',
        modelPlaceholder: 'gpt-4o-mini',
        keyPlaceholder: 'sk-…',
        hint: 'Works with OpenAI, OpenRouter, Groq, Together — any v1/chat/completions.',
    },
    {
        id: 'custom',
        label: 'Custom',
        icon: '🔧',
        url: '',
        modelPlaceholder: 'model-id',
        keyPlaceholder: 'API key',
        hint: 'Paste any OpenAI-compatible endpoint.',
    },
];

function inferProvider(url: string): ProviderId {
    if (!url) return 'lmstudio';
    if (url.includes('11434')) return 'ollama';
    if (url.includes('openai.com') || url.includes('openrouter') || url.includes('groq') || url.includes('together')) return 'openai';
    if (url === '/api/llm') return 'lmstudio';
    return 'custom';
}

export const LLMConnector = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState(LLMService.getStatus());
    const [config, setConfig] = useState(LLMService.getConfig());
    const [provider, setProvider] = useState<ProviderId>(inferProvider(LLMService.getConfig().url));
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [presets, setPresets] = useState(() => LLMService.getPresets());

    useEffect(() => LLMService.subscribeStatus(setStatus), []);

    const refreshPresets = () => setPresets(LLMService.getPresets());

    const handleSavePreset = () => {
        const name = window.prompt('Preset name (e.g. "Ollama laptop", "LM Studio office"):');
        if (!name) return;
        LLMService.setConfig(config.url, config.model, config.key || 'dummy');
        LLMService.savePreset(name.trim());
        refreshPresets();
    };

    const handleLoadPreset = (name: string) => {
        const p = LLMService.loadPreset(name);
        if (!p) return;
        setConfig(prev => ({ ...prev, url: p.url, model: p.model, key: p.key }));
        setProvider(inferProvider(p.url));
        setAvailableModels([]);
    };

    const handleDeletePreset = (name: string) => {
        LLMService.deletePreset(name);
        refreshPresets();
    };

    const preset = PRESETS.find(p => p.id === provider)!;

    const applyPreset = useCallback((id: ProviderId) => {
        const p = PRESETS.find(x => x.id === id)!;
        setProvider(id);
        setAvailableModels([]);
        if (id !== 'custom') {
            setConfig(c => ({ ...c, url: p.url }));
        }
    }, []);

    // Ollama model discovery via /api/tags
    const discoverOllamaModels = useCallback(async () => {
        setLoadingModels(true);
        try {
            const res = await fetch(preset.modelsEndpoint!, { method: 'GET' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const models = (data.models || []).map((m: any) => m.name || m.model).filter(Boolean);
            setAvailableModels(models);
            if (models.length && !models.includes(config.model)) {
                setConfig(c => ({ ...c, model: models[0] }));
            }
        } catch (e: any) {
            setTestResult({ success: false, msg: `Cannot reach Ollama: ${e.message}. Is it running?` });
        } finally {
            setLoadingModels(false);
        }
    }, [preset, config.model]);

    const handleConnect = async () => {
        setIsTesting(true);
        setTestResult(null);
        LLMService.setConfig(config.url, config.model, config.key || 'dummy');

        const res = await LLMService.ping();
        setIsTesting(false);

        if (res.online) {
            setTestResult({ success: true, msg: 'Connexion établie !' });
            setTimeout(() => { setIsOpen(false); setTestResult(null); }, 1000);
        } else {
            setTestResult({ success: false, msg: res.error || 'Erreur de connexion' });
        }
    };

    // Subtle palette — no alarming red for offline; AI is opt-in so absence is fine.
    const statusColor = status === 'online' ? '#22c55e' : status === 'loading' ? '#eab308' : '#94a3b8';
    const statusLabel = status === 'online' ? 'IA active' : status === 'loading' ? 'Connexion…' : 'IA désactivée';

    return (
        <>
            <div
                className={`llm-status-badge is-quiet ${status === 'online' ? 'status-online' : status === 'loading' ? 'status-loading' : 'status-offline'}`}
                onClick={() => setIsOpen(true)}
                style={{ cursor: 'pointer' }}
                title="Configurer l'IA (optionnel) — pour enrichir automatiquement vos produits"
            >
                <span className="status-dot" style={{ background: statusColor }} />
                <span className="status-text">{statusLabel}</span>
            </div>

            {isOpen && (
                <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Configuration IA</h2>
                            <button className="modal-close" onClick={() => setIsOpen(false)}>×</button>
                        </div>

                        {/* Provider selector */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: 8 }}>Fournisseur</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                                {PRESETS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => applyPreset(p.id)}
                                        style={{
                                            padding: '10px 6px', borderRadius: 8, border: `1px solid ${provider === p.id ? '#7c4dff' : 'rgba(255,255,255,0.1)'}`,
                                            background: provider === p.id ? 'rgba(124,77,255,0.15)' : 'rgba(255,255,255,0.03)',
                                            color: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.1rem' }}>{p.icon}</span>
                                        <span>{p.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p style={{ fontSize: '0.72rem', color: '#7a7a88', margin: '8px 0 0' }}>{preset.hint}</p>
                        </div>

                        {/* URL */}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: 6 }}>Endpoint</label>
                            <input
                                type="text"
                                value={config.url}
                                onChange={e => setConfig({ ...config, url: e.target.value })}
                                placeholder={preset.url || 'https://…'}
                                style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff' }}
                            />
                        </div>

                        {/* Model with Ollama discovery */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <label style={{ fontSize: '0.8rem', color: '#9898a8' }}>Modèle</label>
                                {provider === 'ollama' && (
                                    <button
                                        onClick={discoverOllamaModels}
                                        disabled={loadingModels}
                                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#a5b4fc', fontSize: '0.7rem', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
                                    >
                                        {loadingModels ? '…' : '🔄 Détecter'}
                                    </button>
                                )}
                            </div>
                            {availableModels.length > 0 ? (
                                <select
                                    value={config.model}
                                    onChange={e => setConfig({ ...config, model: e.target.value })}
                                    style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff' }}
                                >
                                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={config.model}
                                    onChange={e => setConfig({ ...config, model: e.target.value })}
                                    placeholder={preset.modelPlaceholder}
                                    style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff' }}
                                />
                            )}
                        </div>

                        {/* API key */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: 6 }}>Clé API</label>
                            <input
                                type="password"
                                value={config.key}
                                onChange={e => setConfig({ ...config, key: e.target.value })}
                                placeholder={preset.keyPlaceholder}
                                style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff' }}
                            />
                        </div>

                        {testResult && (
                            <div style={{ marginBottom: 14, padding: 10, borderRadius: 6, fontSize: '0.85rem', background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: testResult.success ? '#22c55e' : '#ef4444' }}>
                                {testResult.success ? '✅ ' : '⚠️ '}{testResult.msg}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleConnect}
                                disabled={isTesting || !config.url}
                                style={{ flex: 1, padding: 12, background: '#7c4dff', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: isTesting ? 'not-allowed' : 'pointer', opacity: (isTesting || !config.url) ? 0.6 : 1 }}
                            >
                                {isTesting ? 'Test en cours…' : 'Sauvegarder & Connecter'}
                            </button>
                            <button
                                onClick={handleSavePreset}
                                disabled={!config.url}
                                title="Save as preset"
                                style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                                💾
                            </button>
                        </div>

                        {presets.length > 0 && (
                            <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                                <div style={{ fontSize: '0.72rem', color: '#7a7a88', marginBottom: 6 }}>Presets enregistrés</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {presets.map(p => (
                                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                                            <button
                                                onClick={() => handleLoadPreset(p.name)}
                                                style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.82rem' }}
                                                title={`${p.url} · ${p.model}`}
                                            >
                                                {p.name} <span style={{ color: '#7a7a88', fontSize: '0.72rem' }}>· {p.model}</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeletePreset(p.name)}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                                                title="Delete preset"
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
