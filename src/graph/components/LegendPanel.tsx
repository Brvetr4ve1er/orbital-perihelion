// ─────────────────────────────────────────────────────────────────────────────
// Graph System — LegendPanel Component
// Shows node group legend with connection stats
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { GraphData, NodeGroup } from '../types';
import { GROUP_COLORS } from '../types';

interface LegendPanelProps {
  data: GraphData;
  preset: string;
  onPresetChange: (p: string) => void;
}

const GROUP_ICONS: Record<NodeGroup, string> = {
  brand: '◈',
  category: '◆',
  product: '●',
  tag: '◇',
  default: '○',
  cluster: '⬡',
};

export const LegendPanel: React.FC<LegendPanelProps> = ({ data, preset, onPresetChange }) => {
  const groupCounts = (data?.nodes ?? []).reduce((acc, n) => {
    acc[n.group] = (acc[n.group] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="legend-panel">
      <div className="legend-header">Graph View</div>

      <div className="legend-preset-row">
        <span className="legend-label">Dataset</span>
        <div className="legend-preset-btns">
          {(['small', 'medium', 'large'] as const).map(p => (
            <button
              key={p}
              id={`preset-btn-${p}`}
              className={`preset-btn ${preset === p ? 'active' : ''}`}
              onClick={() => onPresetChange(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="legend-separator" />

      <div className="legend-section-label">Node Types</div>
      {Object.entries(groupCounts).map(([group, count]) => (
        <div key={group} className="legend-row">
          <span className="legend-icon" style={{ color: GROUP_COLORS[group as NodeGroup] }}>
            {GROUP_ICONS[group as NodeGroup] ?? '●'}
          </span>
          <span className="legend-group-name">{group}</span>
          <span className="legend-count">{count}</span>
        </div>
      ))}

      <div className="legend-separator" />

      <div className="legend-section-label">Links</div>
      <div className="legend-link-row">
        <span className="link-sample strong" />
        <span className="legend-link-label">Strong</span>
      </div>
      <div className="legend-link-row">
        <span className="link-sample normal" />
        <span className="legend-link-label">Normal</span>
      </div>
      <div className="legend-link-row">
        <span className="link-sample weak" />
        <span className="legend-link-label">Weak</span>
      </div>

      <div className="legend-separator" />

      <div className="legend-tip">
        <span>🖱</span> Drag nodes · Scroll to zoom · Click to inspect
      </div>
    </div>
  );
};
