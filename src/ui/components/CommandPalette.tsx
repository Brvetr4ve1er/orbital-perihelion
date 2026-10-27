import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Product } from '../../core/schema';

export interface Command {
    id: string;
    label: string;
    hint?: string;
    icon?: string;
    shortcut?: string;
    keywords?: string;
    section: 'navigation' | 'actions' | 'data';
    run: () => void | Promise<void>;
}

interface Props {
    open: boolean;
    onClose: () => void;
    commands: Command[];
    products: Product[];
    onPickProduct: (p: Product) => void;
}

type ResolvedItem =
    | { kind: 'command'; cmd: Command }
    | { kind: 'product'; product: Product };

export const CommandPalette = ({ open, onClose, commands, products, onPickProduct }: Props) => {
    const [q, setQ] = useState('');
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setQ('');
            setCursor(0);
            setTimeout(() => inputRef.current?.focus(), 40);
        }
    }, [open]);

    const items: ResolvedItem[] = useMemo(() => {
        const qLower = q.trim().toLowerCase();
        if (!qLower) {
            return commands.map(cmd => ({ kind: 'command' as const, cmd }));
        }

        const matchedCmds = commands
            .filter(c => (c.label + ' ' + (c.keywords || '')).toLowerCase().includes(qLower))
            .map(cmd => ({ kind: 'command' as const, cmd }));

        const matchedProducts = products
            .filter(p => {
                const idx = p._searchIndex || `${p.identity.name} ${p.identity.brand} ${p.identity.sku}`.toLowerCase();
                return idx.includes(qLower);
            })
            .slice(0, 12)
            .map(product => ({ kind: 'product' as const, product }));

        return [...matchedCmds, ...matchedProducts];
    }, [q, commands, products]);

    useEffect(() => { setCursor(0); }, [q]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, Math.max(0, items.length - 1))); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
            if (e.key === 'Enter')     { e.preventDefault(); runItem(items[cursor]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, items, cursor]);

    const runItem = (item: ResolvedItem | undefined) => {
        if (!item) return;
        if (item.kind === 'command') {
            Promise.resolve(item.cmd.run()).finally(onClose);
        } else {
            onPickProduct(item.product);
            onClose();
        }
    };

    // Group items for section headers
    const grouped: Array<{ section: string; items: ResolvedItem[] }> = useMemo(() => {
        if (q.trim()) {
            const cmds = items.filter(i => i.kind === 'command');
            const prods = items.filter(i => i.kind === 'product');
            const groups: Array<{ section: string; items: ResolvedItem[] }> = [];
            if (cmds.length) groups.push({ section: 'Commands', items: cmds });
            if (prods.length) groups.push({ section: 'Products', items: prods });
            return groups;
        }
        const sections = ['navigation', 'actions', 'data'] as const;
        return sections
            .map(s => ({
                section: s === 'navigation' ? 'Navigation' : s === 'actions' ? 'Actions' : 'Data',
                items: items.filter(i => i.kind === 'command' && i.cmd.section === s),
            }))
            .filter(g => g.items.length > 0);
    }, [q, items]);

    let flatIdx = -1;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="cp-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="cp-panel"
                        initial={{ y: -12, opacity: 0, scale: 0.97 }}
                        animate={{ y: 0,  opacity: 1, scale: 1 }}
                        exit={{ y: -12, opacity: 0, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="cp-input-row">
                            <span className="cp-input-icon">🔎</span>
                            <input
                                ref={inputRef}
                                className="cp-input"
                                placeholder="Search products or run a command…"
                                value={q}
                                onChange={e => setQ(e.target.value)}
                            />
                            <kbd className="cp-esc">Esc</kbd>
                        </div>
                        <div className="cp-results">
                            {grouped.length === 0 && (
                                <div className="cp-empty">No results for "{q}"</div>
                            )}
                            {grouped.map(group => (
                                <div key={group.section} className="cp-section">
                                    <div className="cp-section-title">{group.section}</div>
                                    {group.items.map(item => {
                                        flatIdx++;
                                        const active = flatIdx === cursor;
                                        const myIdx = flatIdx;
                                        if (item.kind === 'command') {
                                            return (
                                                <button
                                                    key={`c-${item.cmd.id}`}
                                                    className={`cp-item ${active ? 'active' : ''}`}
                                                    onMouseEnter={() => setCursor(myIdx)}
                                                    onClick={() => runItem(item)}
                                                >
                                                    <span className="cp-item-icon">{item.cmd.icon || '›'}</span>
                                                    <span className="cp-item-label">{item.cmd.label}</span>
                                                    {item.cmd.hint && <span className="cp-item-hint">{item.cmd.hint}</span>}
                                                    {item.cmd.shortcut && <kbd className="cp-item-kbd">{item.cmd.shortcut}</kbd>}
                                                </button>
                                            );
                                        }
                                        return (
                                            <button
                                                key={`p-${item.product.identity.id}`}
                                                className={`cp-item cp-item-product ${active ? 'active' : ''}`}
                                                onMouseEnter={() => setCursor(myIdx)}
                                                onClick={() => runItem(item)}
                                            >
                                                <span className="cp-item-icon">📦</span>
                                                <span className="cp-item-label">{item.product.identity.name}</span>
                                                <span className="cp-item-hint">
                                                    {item.product.identity.brand} · {item.product.identity.sku || '—'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        <div className="cp-footer">
                            <span><kbd>↑↓</kbd> navigate</span>
                            <span><kbd>↵</kbd> select</span>
                            <span><kbd>esc</kbd> dismiss</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
