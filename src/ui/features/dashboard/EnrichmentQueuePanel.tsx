import { useState, useEffect } from 'react';
import { EnrichmentQueue, QueueState } from '../../../services/enrichment-queue';

export const EnrichmentQueuePanel = () => {
    const [queueState, setQueueState] = useState<QueueState>(EnrichmentQueue.getState());
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const unsub = EnrichmentQueue.subscribe(setQueueState);
        return unsub;
    }, []);

    const progress = EnrichmentQueue.getProgress();
    const eta = EnrichmentQueue.getETA();
    const pendingCount = queueState.jobs.filter(j => j.status === 'pending').length;
    const hasJobs = queueState.jobs.length > 0;

    const handleStart = () => {
        if (!hasJobs) EnrichmentQueue.enqueueAll();
        EnrichmentQueue.start();
        setIsOpen(true);
    };

    const formatETA = (seconds: number | null) => {
        if (seconds === null || seconds < 0) return '—';
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
    };

    return (
        <>
            {/* Trigger Button */}
            <button
                id="batch-enrich-btn"
                onClick={() => { setIsOpen(v => !v); if (!hasJobs) EnrichmentQueue.enqueueAll(); }}
                style={{
                    background: queueState.isRunning ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#a5b4fc',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                }}
            >
                {queueState.isRunning && !queueState.isPaused ? (
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                ) : '🤖'}
                Enrichissement IA
                {hasJobs && (
                    <span style={{
                        background: queueState.isRunning ? '#6366f1' : 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: '99px',
                        fontSize: '0.7rem',
                        fontWeight: 700
                    }}>
                        {progress}%
                    </span>
                )}
            </button>

            {/* Queue Panel */}
            {isOpen && (
                <div
                    id="enrichment-queue-panel"
                    className="enrichment-queue-panel"
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>🤖 Enrichissement IA en lot</div>
                            <div style={{ fontSize: '0.75rem', color: '#9898a8', marginTop: '2px' }}>
                                {queueState.jobs.length} produit{queueState.jobs.length !== 1 ? 's' : ''} dans la file
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{ background: 'none', border: 'none', color: '#9898a8', cursor: 'pointer', fontSize: '1.2rem' }}
                        >×</button>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '99px', height: '6px', marginBottom: '12px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                            borderRadius: '99px',
                            transition: 'width 0.5s ease',
                        }} />
                    </div>

                    {/* Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {[
                            { label: 'Complétés', value: queueState.completedCount, color: '#22c55e' },
                            { label: 'En attente', value: pendingCount, color: '#a5b4fc' },
                            { label: 'Échoués', value: queueState.failedCount, color: '#ef4444' },
                        ].map(stat => (
                            <div key={stat.label} style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: '0.65rem', color: '#9898a8', marginTop: '2px' }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ETA */}
                    {queueState.isRunning && !queueState.circuitBroken && eta !== null && (
                        <div style={{ fontSize: '0.75rem', color: '#9898a8', marginBottom: '14px', textAlign: 'center' }}>
                            ⏱ Temps restant estimé : <strong style={{ color: '#fff' }}>{formatETA(eta)}</strong>
                        </div>
                    )}

                    {/* Circuit Breaker Warning */}
                    {queueState.circuitBroken && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '14px',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '4px' }}>
                                ⚡ Circuit Breaker Activé
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#f87171', lineHeight: 1.4 }}>
                                3 échecs consécutifs détectés. Le LLM ou le scraper est peut-être hors ligne.
                                Vérifiez la connexion et cliquez Reprendre.
                            </div>
                        </div>
                    )}

                    {/* Control Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {!queueState.isRunning ? (
                            <button
                                onClick={handleStart}
                                style={{ flex: 1, padding: '10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                ▶ Démarrer
                            </button>
                        ) : queueState.isPaused ? (
                            <button
                                onClick={() => EnrichmentQueue.resume()}
                                style={{ flex: 1, padding: '10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                ▶ Reprendre
                            </button>
                        ) : (
                            <button
                                onClick={() => EnrichmentQueue.pause()}
                                style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                ⏸ Pause
                            </button>
                        )}
                        <button
                            onClick={() => { EnrichmentQueue.cancel(); EnrichmentQueue.reset(); }}
                            style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
