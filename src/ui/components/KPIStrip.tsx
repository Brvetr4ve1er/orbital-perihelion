import { inventoryStore } from '../../state/store';

interface KPIProps {
    stats: {
        totalProducts: number;
        totalRetailValue: number;
        totalCost: number;
        totalSKUs: number;
        avgMargin: number;
        stockHealth: { normal: number; faible: number; rupture: number };
    };
}

const formatDate = () => {
    const d = new Date();
    return new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric', month: 'short', year: 'numeric',
    }).format(d);
};

export const KPIStrip = ({ stats }: KPIProps) => {
    const formatPrice = (p: number) =>
        new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(p);

    const totalHealth = stats.stockHealth.normal + stats.stockHealth.faible + stats.stockHealth.rupture || 1;
    const healthPcts = {
        normal: (stats.stockHealth.normal / totalHealth) * 100,
        faible: (stats.stockHealth.faible / totalHealth) * 100,
        rupture: (stats.stockHealth.rupture / totalHealth) * 100,
    };

    // Extra signals from the raw store — keeps this component as the single analytics seam.
    const products = inventoryStore.getState().products;
    const enrichedCount = products.filter(p => !!p.enrichment?.intelligence).length;
    const enrichedPct = products.length ? Math.round((enrichedCount / products.length) * 100) : 0;
    const outOfStockCount = stats.stockHealth.rupture;
    const lowStockCount = stats.stockHealth.faible;

    const timestamp = formatDate();

    return (
        <section className="kpi-strip" aria-label="Indicateurs clés">
            <div className="kpi-card kpi-revenue">
                <div className="kpi-label">Valeur totale du stock (détail)</div>
                <div className="kpi-value">{formatPrice(stats.totalRetailValue)}</div>
                <div className="kpi-sub">{stats.totalProducts} produit{stats.totalProducts !== 1 ? 's' : ''} — {stats.totalSKUs} unité{stats.totalSKUs !== 1 ? 's' : ''}</div>
            </div>

            <div className="kpi-card kpi-cost">
                <div className="kpi-label">Capital immobilisé (coût)</div>
                <div className="kpi-value">{formatPrice(stats.totalCost)}</div>
                <div className="kpi-sub">Marge moyenne (pondérée) : {stats.avgMargin}%</div>
            </div>

            <div className="kpi-card kpi-alerts">
                <div className="kpi-label">Alertes stock</div>
                <div className="kpi-value">
                    <span style={{ color: '#ef4444' }}>{outOfStockCount}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.6em', margin: '0 6px' }}>/</span>
                    <span style={{ color: '#eab308' }}>{lowStockCount}</span>
                </div>
                <div className="kpi-sub">rupture{outOfStockCount !== 1 ? 's' : ''} / stock faible</div>
            </div>

            <div className="kpi-card kpi-ai">
                <div className="kpi-label">Couverture IA</div>
                <div className="kpi-value">{enrichedPct}%</div>
                <div className="kpi-sub">{enrichedCount} / {products.length} enrichi{enrichedCount !== 1 ? 's' : ''}</div>
            </div>

            <div className="kpi-card kpi-health">
                <div className="kpi-label">Santé du stock</div>
                <div className="health-segments">
                    <div className="health-seg health-ok" style={{ width: `${healthPcts.normal}%` }} />
                    <div className="health-seg health-warn" style={{ width: `${healthPcts.faible}%` }} />
                    <div className="health-seg health-danger" style={{ width: `${healthPcts.rupture}%` }} />
                </div>
                <div className="kpi-sub">
                    <span style={{ color: '#22c55e' }}>●</span> {stats.stockHealth.normal}&nbsp;
                    <span style={{ color: '#eab308' }}>●</span> {stats.stockHealth.faible}&nbsp;
                    <span style={{ color: '#ef4444' }}>●</span> {stats.stockHealth.rupture}
                    <span className="kpi-timestamp">— au {timestamp}</span>
                </div>
            </div>
        </section>
    );
};
