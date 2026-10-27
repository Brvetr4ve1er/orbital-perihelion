/**
 * Toast notifications — lightweight observable store.
 * Shown top-right, auto-dismiss after `duration` ms (default 3500).
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'progress';

export interface Toast {
    id: string;
    kind: ToastKind;
    title: string;
    message?: string;
    action?: { label: string; onClick: () => void };
    duration?: number;   // ms; 0 = persistent
    createdAt: number;
}

type Listener = (toasts: Toast[]) => void;

class ToastStore {
    private toasts: Toast[] = [];
    private listeners = new Set<Listener>();

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    private notify() { this.listeners.forEach(l => l([...this.toasts])); }

    show(t: Omit<Toast, 'id' | 'createdAt'>): string {
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const toast: Toast = { id, createdAt: Date.now(), duration: 3500, ...t };
        this.toasts = [toast, ...this.toasts].slice(0, 6);
        this.notify();
        if (toast.duration && toast.duration > 0) {
            setTimeout(() => this.dismiss(id), toast.duration);
        }
        return id;
    }

    update(id: string, patch: Partial<Omit<Toast, 'id' | 'createdAt'>>) {
        this.toasts = this.toasts.map(t => t.id === id ? { ...t, ...patch } : t);
        this.notify();
    }

    dismiss(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
        this.notify();
    }

    clear() { this.toasts = []; this.notify(); }

    success(title: string, message?: string, duration?: number) { return this.show({ kind: 'success', title, message, duration }); }
    error(title: string, message?: string, duration?: number)   { return this.show({ kind: 'error',   title, message, duration: duration ?? 6000 }); }
    info(title: string, message?: string, duration?: number)    { return this.show({ kind: 'info',    title, message, duration }); }
    warning(title: string, message?: string, duration?: number) { return this.show({ kind: 'warning', title, message, duration }); }
    progress(title: string, message?: string) { return this.show({ kind: 'progress', title, message, duration: 0 }); }
}

export const toasts = new ToastStore();
