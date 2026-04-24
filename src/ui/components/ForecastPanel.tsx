/**
 * ForecastPanel — forward-looking revenue projection + stock-out ETA list.
 *
 * Left column: expected 7d / 30d revenue with confidence band and a 30-day
 * projection curve stitched onto the tail of the 30-day history.
 * Right column: ranked list of products about to stock out, click to open.
 *
 * Pure SVG; no chart library. Returns null until sales exist.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { SalesService } from '../../services/sales';
import { getRevenueTimeSeries } from '../../services/analytics';
import { getRevenueForecast, getStockoutETAs } from '../../services/forecast';

interface Props {
    products: Product[];
    onPickProduct?: (p: Product) => void;
}

const WIDTH = 520;
const HEIGHT = 150;
const PAD = { top: 10, right: 10, bottom: 18, left: 46 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

const fmtCurrency = (v: number) => new Intl.NumberFormat('fr-DZ', {
    style: 'currency', currency: 'DZD', maximumFractionDigits: 0,
}).format(v);

const fmtShort = (v: number) => v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));

export const ForecastPanel = ({ products, onPickProduct }: Props) => {
    const [, setTick] = useState(0);
    useEffect(() => SalesService.subscribe(() => setTick(t => t + 1)), []);

    const salesCount = SalesService.getCached().length;

    const { history, fc7, fc30, etas } = useMemo(() => {
        if (salesCount === 0) return { history: [], fc7: null, fc30: null, etas: [] };
        return {
            history: getRevenueTimeSeries(products, 30),
            fc7:  getRevenueForecast(products, 7),
            fc30: getRevenueForecast(products, 30),
            etas: getStockoutETAs(products),
        };
    }, [products, salesCount]);

    if (salesCount === 0 || !fc30) return null;

    // Build the stitched chart path: history (30d) + projection (30d).
    const full = [...history, ...fc30.daily];
    const max = Math.max(1, ...full);
    const step = full.length > 1 ? INNER_W / (full.length - 1) : INNER_W;
    const xOf = (i: number) => PAD.left + i * step;
    const yOf = (v: number) => PAD.top + INNER_H - (v / max) * INNER_H;

    const histPts = history.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
    const fcPts   = fc30.daily.map((v, i) => ({ x: xOf(history.length + i), y: yOf(v) }));

    const histPath = histPts.length
        ? `M${histPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`
        : '';
    const fcPath = fcPts.length
        ? `M${fcPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`
        : '';

    // Confidence band — uniform spread proportional to the delta (high - low)
    const bandPad = fc30.expected > 0
        ? ((fc30.high - fc30.low) / fc30.expected) * 0.5
        : 0;
    const bandTop    = fc30.daily.map((v, i) => ({ x: xOf(history.length + i), y: yOf(v * (1 + bandPad)) }));
    const bandBottom = fc30.daily.map((v, i) => ({ x: xOf(history.length + i), y: yOf(Math.max(0, v * (1 - bandPad))) }));
    const bandPath = bandTop.length && bandBottom.length
        ? `M${bandTop.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${[...bandBottom].reverse().map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} Z`
        : '';

    // Today marker — between history and forecast
    const todayX = xOf(history.length - 0.5);

    // Y-axis ticks
    const yTicks = Array.from({ length: 4 }, (_, i) => {
        const v = (max / 3) * i;
        return { y: yOf(v), label: fmtShort(v) };
    });

    const confidencePct = Math.round(fc30.confidence * 100);
    const confidenceLabel = confidencePct >= 70 ? 'High' : confidencePct >= 40 ? 'Medium' : 'Low';

    const handlePickEta = (productId: string) => {
        const p = products.find(x => x.identity.id === productId);
        if (p && onPickProduct) onPickProduct(p);
    };

    return (
        <section className="forecast-panel">
            <div className="forecast-header">
                <div className="forecast-title">
                    🔮 Forecast
                    <span className="badge" style={{ background: 'rgba(168,85,247,0.20)', color: '#e9d5ff' }}>
                        projection
                    </span>
                </div>
                <div className="forecast-sub">
                    Confidence: <strong className={`forecast-conf-${confidenceLabel.toLowerCase()}`}>{confidenceLabel}</strong>
                    <span> · {confidencePct}%</span>
                </div>
            </div>

            <div className="forecast-grid">
                <div className="forecast-chart-wrap">
                    <div className="forecast-metric-row">
                        <div className="forecast-metric">
                            <div className="forecast-metric-label">Next 7 days</div>
                            <div className="forecast-metric-value">{fmtCurrency(fc7?.expected || 0)}</div>
                            <div className="forecast-metric-range">
                                {fmtShort(fc7?.low || 0)} – {fmtShort(fc7?.high || 0)}
                            </div>
                        </div>
                        <div className="forecast-metric">
                            <div className="forecast-metric-label">Next 30 days</div>
                            <div className="forecast-metric-value">{fmtCurrency(fc30.expected)}</div>
                            <div className="forecast-metric-range">
                                {fmtShort(fc30.low)} – {fmtShort(fc30.high)}
                            </div>
                        </div>
                    </div>

                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        preserveAspectRatio="none"
                        width="100%"
                        height={HEIGHT}
                        style={{ display: 'block' }}
                    >
                        <defs>
                            <linearGradient id="fc-hist-grad" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%"  stopColor="#6366f1" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                            </linearGradient>
                        </defs>

                        {/* Y grid */}
                        {yTicks.map((t, i) => (
                            <g key={i}>
                                <line x1={PAD.left} x2={PAD.left + INNER_W} y1={t.y} y2={t.y}
                                      stroke="rgba(148,163,184,0.10)" strokeWidth={1} />
                                <text x={PAD.left - 6} y={t.y + 3} textAnchor="end"
                                      fontSize={9} fill="#94a3b8">{t.label}</text>
                            </g>
                        ))}

                        {/* Confidence band (forecast region) */}
                        {bandPath && <path d={bandPath} fill="rgba(168,85,247,0.12)" />}

                        {/* History line (solid) */}
                        {histPath && (
                            <>
                                <path
                                    d={`${histPath} L${xOf(history.length - 1)},${PAD.top + INNER_H} L${PAD.left},${PAD.top + INNER_H} Z`}
                                    fill="url(#fc-hist-grad)"
                                />
                                <path d={histPath} stroke="#6366f1" strokeWidth={1.75} fill="none" strokeLinejoin="round" />
                            </>
                        )}

                        {/* Forecast line (dashed) */}
                        {fcPath && (
                            <path d={fcPath} stroke="#a855f7" strokeWidth={1.75} fill="none"
                                  strokeLinejoin="round" strokeDasharray="4 3" />
                        )}

                        {/* Today marker */}
                        <line x1={todayX} x2={todayX} y1={PAD.top} y2={PAD.top + INNER_H}
                              stroke="rgba(165,180,252,0.5)" strokeWidth={1} strokeDasharray="2 2" />
                        <text x={todayX} y={PAD.top - 2} textAnchor="middle"
                              fontSize={9} fill="#a5b4fc">now</text>

                        {/* X axis labels */}
                        <text x={PAD.left} y={HEIGHT - 4} textAnchor="start"
                              fontSize={9} fill="#94a3b8">−30d</text>
                        <text x={PAD.left + INNER_W} y={HEIGHT - 4} textAnchor="end"
                              fontSize={9} fill="#94a3b8">+30d</text>
                    </svg>

                    <div className="forecast-legend">
                        <span><span className="dot dot-hist" /> History</span>
                        <span><span className="dot dot-fc" /> Forecast</span>
                        <span><span className="dot dot-band" /> ±1σ band</span>
                    </div>
                </div>

                <div className="forecast-etas">
                    <div className="forecast-etas-header">Stock-out ETA</div>
                    {etas.length === 0 ? (
                        <div className="forecast-etas-empty">
                            No products are projected to stock out at current velocity.
                        </div>
                    ) : (
                        <ul className="forecast-eta-list">
                            {etas.slice(0, 8).map(e => {
                                const days = Math.round(e.daysUntilStockout);
                                const severity = days < 7 ? 'critical' : days < 21 ? 'warning' : 'ok';
                                return (
                                    <li
                                        key={e.productId}
                                        className={`forecast-eta-row eta-${severity}`}
                                        onClick={() => handlePickEta(e.productId)}
                                        title={`ETA ${e.etaDate} · ${e.velocity.toFixed(1)} units/day · ${e.onHand} on hand`}
                                    >
                                        <span className="eta-name">{e.productName}</span>
                                        <span className="eta-days">
                                            {days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
};
