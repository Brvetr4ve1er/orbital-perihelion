import React, { useState, useEffect } from 'react';
import { LLMService } from '../../services/llm';

export const LLMConnector = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState(LLMService.getStatus());
    
    // Form state
    const [config, setConfig] = useState(LLMService.getConfig());
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{success: boolean, msg: string} | null>(null);

    useEffect(() => {
        const unsub = LLMService.subscribeStatus(setStatus);
        return () => unsub();
    }, []);

    const handleConnect = async () => {
        setIsTesting(true);
        setTestResult(null);
        LLMService.setConfig(config.url, config.model, config.key);
        
        const res = await LLMService.ping();
        setIsTesting(false);
        
        if (res.online) {
            setTestResult({ success: true, msg: 'Connexion établie avec succès !' });
            setTimeout(() => {
                setIsOpen(false);
                setTestResult(null);
            }, 1000);
        } else {
            setTestResult({ success: false, msg: res.error || 'Erreur de connexion' });
        }
    };

    return (
        <>
            {/* Status Badge in Header */}
            <div 
                className={`llm-status-badge ${status === 'online' ? 'status-online' : status === 'loading' ? 'status-loading' : 'status-offline'}`}
                onClick={() => setIsOpen(true)}
                style={{ cursor: 'pointer', transition: 'all 0.2s', border: status === 'online' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)' }}
                title="Configurer le modèle IA"
            >
                <span className="status-dot" style={{ background: status === 'online' ? '#22c55e' : status === 'loading' ? '#eab308' : '#ef4444' }}></span>
                <span className="status-text">{status === 'online' ? 'IA Connectée' : status === 'loading' ? 'Connexion IA...' : 'IA Hors-ligne'}</span>
            </div>

            {/* Config Modal */}
            {isOpen && (
                <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Configuration IA</h2>
                            <button className="modal-close" onClick={() => setIsOpen(false)}>×</button>
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: '8px' }}>Endpoint URL (OpenAI compat)</label>
                            <input 
                                type="text"
                                value={config.url}
                                onChange={e => setConfig({...config, url: e.target.value})}
                                style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: '8px' }}>Nom du Modèle</label>
                            <input 
                                type="text"
                                value={config.model}
                                onChange={e => setConfig({...config, model: e.target.value})}
                                style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                            />
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9898a8', marginBottom: '8px' }}>Clé API</label>
                            <input 
                                type="password"
                                value={config.key}
                                onChange={e => setConfig({...config, key: e.target.value})}
                                style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                            />
                        </div>

                        {testResult && (
                            <div style={{ marginBottom: '16px', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', background: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: testResult.success ? '#22c55e' : '#ef4444' }}>
                                {testResult.success ? '✅ ' : '⚠️ '} {testResult.msg}
                            </div>
                        )}

                        <button 
                            onClick={handleConnect}
                            disabled={isTesting}
                            style={{ width: '100%', padding: '12px', background: '#7c4dff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: isTesting ? 'not-allowed' : 'pointer', opacity: isTesting ? 0.7 : 1 }}
                        >
                            {isTesting ? 'Essai de connexion...' : 'Sauvegarder et Connecter'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
