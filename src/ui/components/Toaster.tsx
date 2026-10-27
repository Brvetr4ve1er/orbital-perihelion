import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toasts as store, Toast } from '../../services/toast';

const ICONS: Record<Toast['kind'], string> = {
    success: '✅',
    error: '⚠️',
    info: 'ℹ️',
    warning: '⚠️',
    progress: '⏳',
};

export const Toaster = () => {
    const [items, setItems] = useState<Toast[]>([]);
    useEffect(() => store.subscribe(setItems), []);

    return (
        <div className="toaster" aria-live="polite" aria-atomic="false">
            <AnimatePresence initial={false}>
                {items.map(t => (
                    <motion.div
                        key={t.id}
                        className={`toast toast-${t.kind}`}
                        initial={{ opacity: 0, x: 40, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0,  scale: 1 }}
                        exit={{ opacity: 0, x: 40, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        layout
                    >
                        <div className="toast-icon">
                            {t.kind === 'progress' ? (
                                <span className="toast-spinner">⟳</span>
                            ) : ICONS[t.kind]}
                        </div>
                        <div className="toast-body">
                            <div className="toast-title">{t.title}</div>
                            {t.message && <div className="toast-msg">{t.message}</div>}
                        </div>
                        {t.action && (
                            <button
                                className="toast-action"
                                onClick={() => { t.action!.onClick(); store.dismiss(t.id); }}
                            >{t.action.label}</button>
                        )}
                        <button
                            className="toast-close"
                            onClick={() => store.dismiss(t.id)}
                            aria-label="Dismiss"
                        >✕</button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
