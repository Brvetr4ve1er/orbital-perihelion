// ─────────────────────────────────────────────────────────────────────────────
// Graph System — GraphControls Component
// Toolbar: search, filter, fit, reheat, stats
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { NodeGroup } from '../types';
import { GROUP_COLORS } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphControlsProps {
  query: string;
  onQuery: (q: string) => void;
  activeGroups: Set<NodeGroup>;
  onToggleGroup: (g: NodeGroup) => void;
  onReset: () => void;
  onFitView: () => void;
  onReheat: () => void;
  isStable: boolean;
  nodeCount: number;
  fps: number;
  useCanvas: boolean;
}

const ALL_GROUPS: NodeGroup[] = ['brand', 'category', 'product', 'tag'];
const GROUP_LABELS: Record<NodeGroup, string> = {
  brand: 'Brands',
  category: 'Categories',
  product: 'Products',
  tag: 'Tags',
  default: 'Other',
  cluster: 'Clusters',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const GraphControls: React.FC<GraphControlsProps> = ({
  query,
  onQuery,
  activeGroups,
  onToggleGroup,
  onReset,
  onFitView,
  onReheat,
  isStable,
  nodeCount,
  fps,
  useCanvas,
}) => {
  return (
    <div className="graph-controls" role="toolbar" aria-label="Graph controls">
      {/* Search */}
      <div className="graph-search-wrap">
        <span className="graph-search-icon">⌕</span>
        <input
          id="graph-search-input"
          type="text"
          className="graph-search"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search nodes"
          autoComplete="off"
        />
        {query && (
          <button className="graph-clear-btn" onClick={() => onQuery('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {/* Group filters */}
      <div className="graph-group-filters">
        {ALL_GROUPS.map((group) => {
          const active = activeGroups.has(group);
          return (
            <button
              key={group}
              id={`graph-filter-${group}`}
              className={`graph-group-chip ${active ? 'active' : ''}`}
              style={{
                '--chip-color': GROUP_COLORS[group],
              } as React.CSSProperties}
              onClick={() => onToggleGroup(group)}
              aria-pressed={active}
            >
              <span className="chip-dot" style={{ background: GROUP_COLORS[group] }} />
              {GROUP_LABELS[group]}
            </button>
          );
        })}
        {activeGroups.size > 0 && (
          <button className="graph-reset-btn" onClick={onReset} aria-label="Clear all filters">
            Clear
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="graph-action-btns">
        <button id="graph-btn-fit" className="graph-icon-btn" onClick={onFitView} title="Fit view">
          ⊡
        </button>
        <button
          id="graph-btn-reheat"
          className={`graph-icon-btn ${!isStable ? 'active' : ''}`}
          onClick={onReheat}
          title="Re-run simulation"
        >
          ↺
        </button>
      </div>

      {/* Stats */}
      <div className="graph-stats">
        <span className="stat-badge" title="Node count">
          {nodeCount.toLocaleString()} nodes
        </span>
        <span className={`stat-badge fps-badge ${fps < 30 ? 'fps-low' : fps < 50 ? 'fps-mid' : 'fps-ok'}`}>
          {fps} FPS
        </span>
        {useCanvas && <span className="stat-badge canvas-badge">Canvas</span>}
        <span className={`stat-badge ${isStable ? 'stable-badge' : 'sim-badge'}`}>
          {isStable ? '✓ Stable' : '⚡ Simulating'}
        </span>
      </div>
    </div>
  );
};
