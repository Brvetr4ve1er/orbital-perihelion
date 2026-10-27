import { useEffect, useState, useCallback, useLayoutEffect } from 'react';

const STORAGE_KEY = 'shopifoo:tour-completed:v1';

export interface TourStep {
    id: string;
    target: string; // CSS selector OR `[data-tour-id="..."]`
    title: string;
    desc: string;
    placement?: 'top' | 'bottom' | 'left' | 'right';
}

const DEFAULT_STEPS: TourStep[] = [
    {
        id: 'kpis',
        target: '[data-tour-id="kpis"]',
        title: 'Vos chiffres clés',
        desc: 'Valeur du stock, alertes, marges — en un coup d\'œil. Tout se met à jour quand vous importez ou modifiez un produit.',
        placement: 'bottom',
    },
    {
        id: 'search',
        target: '[data-tour-id="search"]',
        title: 'Rechercher rapidement',
        desc: 'Tapez le nom, le SKU ou la catégorie. Le raccourci ⌘K (ou Ctrl+K) ouvre la recherche partout.',
        placement: 'bottom',
    },
    {
        id: 'filters',
        target: '[data-tour-id="filters"]',
        title: 'Filtrer ce qui compte',
        desc: '"Stock faible" pour ce qui manque, "Stock mort" pour ce qui dort. Cliquez pour filtrer.',
        placement: 'bottom',
    },
    {
        id: 'views',
        target: '[data-tour-id="views"]',
        title: 'Plusieurs façons de voir',
        desc: 'Grille pour visualiser, Tableau pour comparer en colonnes. "Plus" pour les vues avancées.',
        placement: 'top',
    },
];

interface GuidedTourProps {
    /** When true, the tour is forced open (e.g. user clicked "Show me around" again). */
    forceOpen?: boolean;
    /** When the tour completes/skips. */
    onClose?: () => void;
    /** Steps; defaults to the standard tour. */
    steps?: TourStep[];
    /** When the user has products and the tour should auto-trigger first-run. */
    eligible: boolean;
}

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

const PADDING = 8;

export const GuidedTour = ({ forceOpen, onClose, steps = DEFAULT_STEPS, eligible }: GuidedTourProps) => {
    const [open, setOpen] = useState(false);
    const [stepIdx, setStepIdx] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);

    // Auto-trigger on first eligible render
    useEffect(() => {
        if (forceOpen) {
            setOpen(true);
            setStepIdx(0);
            return;
        }
        if (!eligible) return;
        try {
            if (localStorage.getItem(STORAGE_KEY)) return;
        } catch { /* ignore */ }
        // Wait a beat for the dashboard to mount before showing
        const id = window.setTimeout(() => {
            setOpen(true);
            setStepIdx(0);
        }, 700);
        return () => window.clearTimeout(id);
    }, [eligible, forceOpen]);

    const close = useCallback((completed: boolean) => {
        setOpen(false);
        if (completed) {
            try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
        }
        onClose?.();
    }, [onClose]);

    const step = steps[stepIdx];

    const measure = useCallback(() => {
        if (!step) { setRect(null); return; }
        const el = document.querySelector(step.target) as HTMLElement | null;
        if (!el) { setRect(null); return; }
        const r = el.getBoundingClientRect();
        setRect({
            top: r.top - PADDING,
            left: r.left - PADDING,
            width: r.width + PADDING * 2,
            height: r.height + PADDING * 2,
        });
        // Scroll into view if needed
        if (r.top < 80 || r.bottom > window.innerHeight - 80) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [step]);

    useLayoutEffect(() => {
        if (!open) return;
        // Re-measure after potential scroll
        measure();
        const id = window.setTimeout(measure, 350);
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onResize, true);
        return () => {
            window.clearTimeout(id);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onResize, true);
        };
    }, [open, measure, stepIdx]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(false);
            else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                if (stepIdx < steps.length - 1) setStepIdx(i => i + 1);
                else close(true);
            } else if (e.key === 'ArrowLeft') {
                setStepIdx(i => Math.max(0, i - 1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, stepIdx, steps.length, close]);

    if (!open || !step) return null;

    // Compute bubble position relative to spotlight
    let bubbleTop = 0;
    let bubbleLeft = 0;
    const bubbleW = 320;
    const bubbleH = 200; // approximate
    const placement = step.placement || 'bottom';

    if (rect) {
        if (placement === 'bottom') {
            bubbleTop = rect.top + rect.height + 14;
            bubbleLeft = rect.left + (rect.width - bubbleW) / 2;
        } else if (placement === 'top') {
            bubbleTop = rect.top - bubbleH - 14;
            bubbleLeft = rect.left + (rect.width - bubbleW) / 2;
        } else if (placement === 'left') {
            bubbleTop = rect.top + (rect.height - bubbleH) / 2;
            bubbleLeft = rect.left - bubbleW - 14;
        } else {
            bubbleTop = rect.top + (rect.height - bubbleH) / 2;
            bubbleLeft = rect.left + rect.width + 14;
        }
        // Clamp to viewport
        bubbleLeft = Math.max(14, Math.min(window.innerWidth - bubbleW - 14, bubbleLeft));
        bubbleTop = Math.max(14, Math.min(window.innerHeight - bubbleH - 14, bubbleTop));
    } else {
        // Fallback: target missing — center bubble
        bubbleTop = window.innerHeight / 2 - bubbleH / 2;
        bubbleLeft = window.innerWidth / 2 - bubbleW / 2;
    }

    const isLast = stepIdx === steps.length - 1;

    return (
        <div className="coachmark-overlay" onClick={() => close(false)}>
            {rect && (
                <div
                    className="coachmark-spotlight"
                    style={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                    }}
                />
            )}
            <div
                className="coachmark-bubble"
                style={{ top: bubbleTop, left: bubbleLeft }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-live="polite"
            >
                <div className="coachmark-progress" aria-hidden>
                    {steps.map((_, i) => (
                        <span
                            key={i}
                            className={`coachmark-progress-dot ${i === stepIdx ? 'active' : i < stepIdx ? 'done' : ''}`}
                        />
                    ))}
                </div>
                <span className="coachmark-step-num">Étape {stepIdx + 1} sur {steps.length}</span>
                <h3 className="coachmark-title">{step.title}</h3>
                <p className="coachmark-desc">{step.desc}</p>
                <div className="coachmark-actions">
                    <button className="coachmark-skip" onClick={() => close(true)}>
                        Passer la visite
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {stepIdx > 0 && (
                            <button
                                className="coachmark-skip"
                                onClick={() => setStepIdx(i => i - 1)}
                                style={{ padding: '8px 12px' }}
                            >
                                ← Retour
                            </button>
                        )}
                        <button
                            className="coachmark-next"
                            onClick={() => isLast ? close(true) : setStepIdx(i => i + 1)}
                        >
                            {isLast ? 'C\'est parti !' : 'Suivant →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Imperative reset for users who want to replay the tour from the menu. */
export function resetTour() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
