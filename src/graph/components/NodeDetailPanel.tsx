// ─────────────────────────────────────────────────────────────────────────────
// Graph System — NodeDetailPanel Component
// Sidebar that shows details for selected nodes
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { GraphNode } from '../types';
import { GROUP_COLORS } from '../types';

interface NodeDetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose }) => {
  if (!node) return null;

  const color = GROUP_COLORS[node.group] ?? GROUP_COLORS.default;

  return (
    <div className="node-detail-panel" role="dialog" aria-label="Node details">
      <div className="node-detail-header">
        <div className="node-detail-icon" style={{ background: color, boxShadow: `0 0 16px ${color}55` }} />
        <div className="node-detail-title">
          <h3>{node.label}</h3>
          <span className="node-detail-group">{node.group}</span>
        </div>
        <button className="node-detail-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="node-detail-body">
        <div className="node-detail-row">
          <span className="detail-label">ID</span>
          <span className="detail-value mono">{node.id}</span>
        </div>
        <div className="node-detail-row">
          <span className="detail-label">Connections</span>
          <span className="detail-value">
            <span className="degree-badge" style={{ background: `${color}22`, borderColor: `${color}55` }}>
              {node.degree}
            </span>
          </span>
        </div>
        {node.clusterId && (
          <div className="node-detail-row">
            <span className="detail-label">Cluster</span>
            <span className="detail-value mono">{node.clusterId}</span>
          </div>
        )}
        {node.pinned && (
          <div className="node-detail-row">
            <span className="detail-label">Status</span>
            <span className="detail-value">📌 Pinned</span>
          </div>
        )}

        {/* Meta fields */}
        {node.meta && Object.keys(node.meta).length > 0 && (
          <>
            <div className="node-detail-separator" />
            <div className="node-detail-section-label">Metadata</div>
            {Object.entries(node.meta).map(([key, value]) => (
              <div key={key} className="node-detail-row">
                <span className="detail-label">{key}</span>
                <span className="detail-value">
                  {typeof value === 'number'
                    ? key === 'price'
                      ? `$${value.toLocaleString()}`
                      : value.toLocaleString()
                    : String(value)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Connection strength indicator */}
      <div className="node-detail-footer">
        <div className="degree-bar-label">Connection weight</div>
        <div className="degree-bar-track">
          <div
            className="degree-bar-fill"
            style={{
              width: `${Math.min(100, (node.degree / 30) * 100)}%`,
              background: color,
              boxShadow: `0 0 8px ${color}66`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
