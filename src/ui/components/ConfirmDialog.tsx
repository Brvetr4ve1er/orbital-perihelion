import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

type Resolver = (ok: boolean) => void;
let openConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

/** Imperative API — anywhere: `await confirm({ title: '...', destructive: true })`. */
export const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    if (!openConfirm) return Promise.resolve(window.confirm(opts.title));
    return openConfirm(opts);
};

export const ConfirmHost = () => {
    const [opts, setOpts] = useState<ConfirmOptions | null>(null);
    const [resolver, setResolver] = useState<Resolver | null>(null);

    useEffect(() => {
        openConfirm = (o) => new Promise<boolean>(res => {
            setOpts(o);
            setResolver(() => res);
        });
        return () => { openConfirm = null; };
    }, []);

    const close = (value: boolean) => {
        resolver?.(value);
        setOpts(null);
        setResolver(null);
    };

    useEffect(() => {
        if (!opts) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts]);

    return (
        <AnimatePresence>
            {opts && (
                <motion.div
                    className="confirm-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => close(false)}
                >
                    <motion.div
                        className={`confirm-dialog ${opts.destructive ? 'confirm-destructive' : ''}`}
                        initial={{ y: 14, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0,  opacity: 1, scale: 1 }}
                        exit={{ y: 14, opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="confirm-title">{opts.title}</h3>
                        {opts.message && <p className="confirm-msg">{opts.message}</p>}
                        <div className="confirm-actions">
                            <button
                                className="btn btn-ghost"
                                onClick={() => close(false)}
                                autoFocus
                            >{opts.cancelLabel || 'Cancel'}</button>
                            <button
                                className={`btn ${opts.destructive ? 'btn-danger' : 'btn-primary'}`}
                                onClick={() => close(true)}
                            >{opts.confirmLabel || 'Confirm'}</button>
                        </div>
                        <div className="confirm-hint">Enter to confirm · Esc to cancel</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
