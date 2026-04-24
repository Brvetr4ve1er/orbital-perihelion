import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SHORTCUT_LIST } from '../hooks/useKeyboardShortcuts';

export const ShortcutsHelp = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="sh-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="sh-card"
                        initial={{ y: 14, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 14, opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="sh-head">
                            <h2>Keyboard shortcuts</h2>
                            <button className="sh-close" onClick={onClose}>✕</button>
                        </div>
                        <ul className="sh-list">
                            {SHORTCUT_LIST.map(s => (
                                <li key={s.combo} className="sh-row">
                                    <kbd className="sh-kbd">{s.label}</kbd>
                                    <span className="sh-desc">{s.description}</span>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
