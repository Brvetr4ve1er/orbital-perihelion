import { useEffect } from 'react';

export interface ShortcutHandler {
    /** Key combination: modifiers joined with +. e.g. "mod+k", "/", "?", "Escape", "g p". */
    combo: string;
    handler: (e: KeyboardEvent) => void;
    /** If true, fires even when typing in an input/textarea. Default false. */
    allowInInput?: boolean;
    description?: string;
}

function isTextInput(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
}

function matchCombo(combo: string, e: KeyboardEvent): boolean {
    const parts = combo.toLowerCase().split('+').map(s => s.trim());
    const key = parts[parts.length - 1];
    const wantMod = parts.includes('mod');
    const wantShift = parts.includes('shift');
    const wantAlt = parts.includes('alt');

    const pressedMod = e.ctrlKey || e.metaKey;
    if (wantMod !== pressedMod) return false;
    if (wantShift !== e.shiftKey) return false;
    if (wantAlt !== e.altKey) return false;

    const pressedKey = e.key.toLowerCase();
    if (key === pressedKey) return true;
    if (key === 'escape' && pressedKey === 'escape') return true;
    if (key.length === 1 && pressedKey === key) return true;
    return false;
}

/** Global keyboard shortcut hook. Handlers are active while the component is mounted. */
export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            for (const s of shortcuts) {
                if (isTextInput(e.target) && !s.allowInInput) {
                    // always allow Escape and mod+ combos, and the help key
                    const isEsc = e.key === 'Escape';
                    const isMod = e.ctrlKey || e.metaKey;
                    if (!isEsc && !isMod) continue;
                }
                if (matchCombo(s.combo, e)) {
                    s.handler(e);
                    return;
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shortcuts]);
}

export const SHORTCUT_LIST: { combo: string; label: string; description: string }[] = [
    { combo: 'mod+k',     label: '⌘K / Ctrl+K',    description: 'Open command palette' },
    { combo: '/',         label: '/',              description: 'Focus search' },
    { combo: '?',         label: '?',              description: 'Show keyboard shortcuts' },
    { combo: 'Escape',    label: 'Esc',            description: 'Close modal / clear selection' },
    { combo: 'g g',       label: 'G then G',       description: 'Go to grid view' },
    { combo: 'g t',       label: 'G then T',       description: 'Go to table view' },
    { combo: 'g r',       label: 'G then R',       description: 'Go to tree view' },
    { combo: 'g h',       label: 'G then H',       description: 'Go to graph view' },
    { combo: 'g c',       label: 'G then C',       description: 'Go to compare view' },
    { combo: 'mod+e',     label: '⌘E / Ctrl+E',    description: 'Export CSV' },
    { combo: 'mod+,',     label: '⌘, / Ctrl+,',    description: 'Open settings' },
];
