import { useEffect } from 'react';
import AOS from 'aos';

interface WelcomeProps {
    onTrySample: () => void;
    onImportCSV: () => void;
}

const STEPS = [
    {
        n: '1',
        icon: '📥',
        title: 'Importez votre catalogue',
        desc: 'Glissez votre fichier CSV (Shopify, Excel, n\'importe quel format).',
    },
    {
        n: '2',
        icon: '🔍',
        title: 'Explorez vos produits',
        desc: 'Filtres, recherche et fiches produits riches en un seul endroit.',
    },
    {
        n: '3',
        icon: '✨',
        title: 'Trouvez les opportunités',
        desc: 'Stock à recommander, marges faibles, ventes — l\'app fait l\'analyse.',
    },
];

const FEATURES = [
    { icon: '📊', label: 'Tableaux de bord clairs' },
    { icon: '🚨', label: 'Alertes stock automatiques' },
    { icon: '💰', label: 'Suivi des marges' },
    { icon: '🤖', label: 'IA optionnelle pour enrichir' },
];

export const Welcome = ({ onTrySample, onImportCSV }: WelcomeProps) => {
    useEffect(() => {
        // Refresh AOS so reveal triggers calculate against the welcome layout
        const id = window.setTimeout(() => AOS.refreshHard(), 50);
        return () => window.clearTimeout(id);
    }, []);

    return (
        <div className="welcome-screen">
            <div className="welcome-hero" data-aos="fade-up" data-aos-duration="600">
                <div className="welcome-badge">
                    <span className="welcome-dot" />
                    <span>Prêt à l'emploi · Aucun compte requis</span>
                </div>
                <h1 className="welcome-title">
                    Transformez votre catalogue en
                    <span className="welcome-title-accent"> décisions claires</span>.
                </h1>
                <p className="welcome-sub">
                    Importez votre inventaire en CSV. Visualisez ce qui se vend, ce qui dort
                    et où agir — sans formation technique.
                </p>

                <div className="welcome-cta-row">
                    <button
                        className="welcome-cta welcome-cta-primary"
                        onClick={onTrySample}
                    >
                        <span className="welcome-cta-icon">✨</span>
                        Essayer avec des données de démo
                    </button>
                    <button
                        className="welcome-cta welcome-cta-secondary"
                        onClick={onImportCSV}
                    >
                        <span className="welcome-cta-icon">📥</span>
                        Importer mon catalogue (CSV)
                    </button>
                </div>
                <p className="welcome-hint">
                    Astuce&nbsp;: commencez avec les données de démo pour voir l'app en action en 2&nbsp;secondes.
                </p>
            </div>

            <div className="welcome-steps" data-aos="fade-up" data-aos-delay="150" data-aos-duration="600">
                <div className="welcome-section-title">
                    <span className="welcome-section-num">Comment ça marche</span>
                    <span className="welcome-section-line" />
                </div>
                <div className="welcome-steps-grid">
                    {STEPS.map((step, i) => (
                        <div
                            key={step.n}
                            className="welcome-step"
                            data-aos="fade-up"
                            data-aos-delay={200 + i * 100}
                        >
                            <div className="welcome-step-num">{step.n}</div>
                            <div className="welcome-step-icon">{step.icon}</div>
                            <h3 className="welcome-step-title">{step.title}</h3>
                            <p className="welcome-step-desc">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div
                className="welcome-features"
                data-aos="fade-up"
                data-aos-delay="300"
                data-aos-duration="600"
            >
                {FEATURES.map((f, i) => (
                    <div
                        key={f.label}
                        className="welcome-feature"
                        data-aos="zoom-in"
                        data-aos-delay={350 + i * 60}
                    >
                        <span className="welcome-feature-icon">{f.icon}</span>
                        <span className="welcome-feature-label">{f.label}</span>
                    </div>
                ))}
            </div>

            <div className="welcome-foot" data-aos="fade-up" data-aos-delay="500">
                <span>Vos données restent sur votre machine.</span>
                <span className="welcome-foot-sep">·</span>
                <span>Aucun envoi vers un serveur tiers.</span>
            </div>
        </div>
    );
};
