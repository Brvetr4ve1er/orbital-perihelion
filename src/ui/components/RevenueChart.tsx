/**
 * RevenueChart — full-width revenue trend chart for the dashboard.
 * Pure SVG with a range selector (30 / 60 / 90 days). No chart library.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../../core/schema';
import { getRevenueTimeSeries, invalidateAnalyticsCache } from '../../services/analytics';
import { SalesService } from '../../services/sales';

interface Props { products: Product[]; }

type Range = 30 | 60 | 90;

const RANGES: { id: Range; label: string }[] = [
    { id: 30, label: '30d' },
    { id: 60, label: '60d' },
    { id: 90, label: '90d' },
];

const WIDTH = 900;
const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 22, left: 54 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

export const RevenueChart = ({ products }: Props) => {
    const [range, setRange] = useState<Range>(60);
    const [hover, setHover] = useState<number | null>(null);
    const [, setTick] = useState(0);

    useEffect(() => SalesService.subscribe(() => {
        invalidateAnalyticsCache();
        setTick(t => t + 1);
    }), []);

    const salesCount = SalesService.getCached().length;
    const series = useMemo(() => getRevenueTimeSeries(products, range), [products, range]);

    if (salesCount === 0) return null;

    const max = Math.max(1, ...series);
    const total = series.reduce((a, b) => a + b, 0);
    const step = series.length > 1 ? INNER_W / (series.length - 1) : INNER_W;
    const priceFmt = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 });
    const priceShort = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));

    // Path generation
    const points = series.map((v, i) => {
        const x = PAD.left + i * step;
        const y = PAD.top + INNER_H - (v / max) * INNER_H;
        return { x, y, v };
    });
    const linePath = `M${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`;
    const areaPath = `${linePath} L${PAD.left + INNER_W},${PAD.top + INNER_H} L${PAD.left},${PAD.top + INNER_H} Z`;

    // Date labels (bottom axis) — today + 4 equidistant points before
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const xTicks = 4;
    const xLabels = Array.from({ length: xTicks + 1 }, (_, i) => {
        const daysBack = Math.round((range - 1) * (1 - i / xTicks));
        const d = new Date(today);
        d.setDate(d.getDate() - daysBack);
        return { x: PAD.left + (i / xTicks) * INNER_W, label: dateFmt.format(d) };
    });

    // Y-axis — 4 ticks
    const yTicks = 4;
    const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
        const v = (max / yTicks) * i;
        const y = PAD.top + INNER_H - (i / yTicks) * INNER_H;
        return { y, label: priceShort(v) };
    });

    const hoverPoint = hover != null ? points[hover] : null;
    const hoverDate = hoverPoint && hover != null ? (() => {
        const d = new Date(today);
        d.setDate(d.getDate() - (range - 1 - hover));
        return dateFmt.format(d);
    })() : '';

    return (
        <section className="revenue-chart">
            <div className="revenue-chart-header">
                <div className="revenue-chart-title">
                    Tendance du chiffre d'affaires
                    <span className="revenue-chart-total">{priceFmt.format(total)} <span>· {range}j total</span></span>
                </div>
                <div className="revenue-chart-ranges">
                    {RANGES.map(r => (
                        <button
                            key={r.id}
                            className={`range-pill ${range === r.id ? 'active' : ''}`}
                            onClick={() => setRange(r.id)}
                        >{r.label}</button>
                    ))}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                width="100%"
                height={HEIGHT}
                onMouseLeave={() => setHover(null)}
                style={{ display: 'block' }}
            >
                <defs>
                    <linearGradient id="rev-grad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"  stopColor="#6366f1" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {/* Y-axis grid + labels */}
                {yLabels.map((t, i) => (
                    <g key={i}>
                        <line x1={PAD.left} x2={PAD.left + INNER_W} y1={t.y} y2={t.y}
                              stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
                        <text x={PAD.left - 6} y={t.y + 3} textAnchor="end"
                              fontSize={10} fill="#94a3b8">{t.label}</text>
                    </g>
                ))}

                {/* Area + line */}
                <path d={areaPath} fill="url(#rev-grad)" />
                <path d={linePath} stroke="#6366f1" strokeWidth={1.75} fill="none" strokeLinejoin="round" />

                {/* X-axis labels */}
                {xLabels.map((t, i) => (
                    <text key={i} x={t.x} y={HEIGHT - 6} textAnchor="middle"
                          fontSize={10} fill="#94a3b8">{t.label}</text>
                ))}

                {/* Hover cursor */}
                {hoverPoint && (
                    <g>
                        <line x1={hoverPoint.x} x2={hoverPoint.x} y1={PAD.top} y2={PAD.top + INNER_H}
                              stroke="rgba(165,180,252,0.5)" strokeWidth={1} strokeDasharray="2 2" />
                        <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill="#a5b4fc" stroke="#1e293b" strokeWidth={1.5} />
                    </g>
                )}

                {/* Invisible hover hitboxes */}
                {points.map((p, i) => (
                    <rect key={i}
                          x={p.x - step / 2} y={PAD.top}
                          width={step} height={INNER_H}
                          fill="transparent"
                          onMouseEnter={() => setHover(i)} />
                ))}
            </svg>

            {hoverPoint && (
                <div className="revenue-chart-tooltip">
                    <strong>{priceFmt.format(hoverPoint.v)}</strong>
                    <span>{hoverDate}</span>
                </div>
            )}
        </section>
    );
};
