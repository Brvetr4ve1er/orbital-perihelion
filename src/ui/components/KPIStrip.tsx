import React from 'react';

interface KPIProps {
    stats: {
        totalRetailValue: number;
        totalCost: number;
        totalSKUs: number;
        avgMargin: number;
        stockHealth: { normal: number; faible: number; rupture: number };
    };
}

export const KPIStrip = ({ stats }: KPIProps) => {
    const formatPrice = (p: number) => {
        return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(p);
    };

    const totalHealth = stats.stockHealth.normal + stats.stockHealth.faible + stats.stockHealth.rupture;
    const healthPcts = {
        normal: (stats.stockHealth.normal / totalHealth) * 100,
        faible: (stats.stockHealth.faible / totalHealth) * 100,
        rupture: (stats.stockHealth.rupture / totalHealth) * 100
    };

    return (
        <section className="kpi-strip">
            <div className="kpi-card kpi-revenue">
                <div className="kpi-label">Valeur Stock (Détail)</div>
                <div className="kpi-value">{formatPrice(stats.totalRetailValue)}</div>
            </div>
            <div className="kpi-card kpi-cost">
                <div className="kpi-label">Capital Immobilisé</div>
                <div className="kpi-value">{formatPrice(stats.totalCost)}</div>
            </div>
            <div className="kpi-card kpi-units">
                <div className="kpi-label">Marge Moyenne</div>
                <div className="kpi-value">{stats.avgMargin}%</div>
            </div>
            <div className="kpi-card kpi-health">
                <div className="kpi-label">Santé Stock</div>
                <div className="health-segments">
                    <div className="health-seg health-ok" style={{ width: `${healthPcts.normal}%` }}></div>
                    <div className="health-seg health-warn" style={{ width: `${healthPcts.faible}%` }}></div>
                    <div className="health-seg health-danger" style={{ width: `${healthPcts.rupture}%` }}></div>
                </div>
            </div>
        </section>
    );

};
