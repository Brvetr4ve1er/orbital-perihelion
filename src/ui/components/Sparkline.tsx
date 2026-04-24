/**
 * Tiny inline sparkline — pure SVG, no deps. Draws a smooth area + line from
 * a numeric series. Designed for table rows, so it stays visually quiet when
 * the series is sparse.
 */
import React from 'react';

interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
    fill?: string;
}

export const Sparkline = React.memo(({
    values,
    width = 80,
    height = 20,
    color = '#6366f1',
    fill = 'rgba(99,102,241,0.15)',
}: SparklineProps) => {
    if (!values || values.length === 0) {
        return <span style={{ color: '#475569', fontSize: 10 }}>—</span>;
    }
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePath = `M${points.join(' L')}`;
    const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

    return (
        <svg width={width} height={height} style={{ display: 'block' }} viewBox={`0 0 ${width} ${height}`}>
            <path d={areaPath} fill={fill} />
            <path d={linePath} stroke={color} strokeWidth={1.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
});
