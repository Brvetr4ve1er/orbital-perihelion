// ─────────────────────────────────────────────────────────────────────────────
// Graph System — GraphView Component
// Main orchestrator. Composes all layers.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useMemo } from 'react';
import { useGraphEngine } from '../hooks/useGraphEngine';
import { useSearch } from '../hooks/useSearch';
import { GraphCanvas } from './GraphCanvas';
import { GraphControls } from './GraphControls';
import { NodeDetailPanel } from './NodeDetailPanel';
import { LegendPanel } from './LegendPanel';
import { GRAPH_PRESETS } from '../data/example-dataset';
import type { GraphData, GraphNode } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphViewProps {
  /** External data override — if omitted, uses built-in example dataset */
  data?: GraphData;
  /** Initial preset: 'small' | 'medium' | 'large' */
  initialPreset?: 'small' | 'medium' | 'large';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GraphView: React.FC<GraphViewProps> = ({
  data: externalData,
  initialPreset = 'medium',
}) => {
  const [preset, setPreset] = useState<'small' | 'medium' | 'large'>(initialPreset);
  const [panelOpen, setPanelOpen] = useState(false);

  // Generate data from preset OR use external data
  const graphData = useMemo<GraphData>(() => {
    if (externalData) return externalData;
    return GRAPH_PRESETS[preset]();
  }, [externalData, preset]);

  // ─── Engine Hook ─────────────────────────────────────────────────────────
  const {
    svgRef,
    canvasRef,
    containerRef,
    useCanvas,
    selectedNode,
    isStable,
    nodeCount,
    fps,
    applyFilter,
    clearFilter,
    fitView,
    reheat,
  } = useGraphEngine({
    data: graphData,
    onNodeSelect: useCallback((node: GraphNode | null) => {
      setPanelOpen(node !== null);
    }, []),
  });

  // ─── Search Hook ─────────────────────────────────────────────────────────
  const {
    query,
    activeGroups,
    handleQuery,
    toggleGroup,
    resetAll,
  } = useSearch({ applyFilter, clearFilter });

  // ─── Preset change ───────────────────────────────────────────────────────
  const handlePresetChange = useCallback((p: string) => {
    setPreset(p as 'small' | 'medium' | 'large');
    setPanelOpen(false);
  }, []);

  return (
    <div className="graph-view" id="graph-view-root">
      {/* Top toolbar */}
      <GraphControls
        query={query}
        onQuery={handleQuery}
        activeGroups={activeGroups}
        onToggleGroup={toggleGroup}
        onReset={resetAll}
        onFitView={fitView}
        onReheat={reheat}
        isStable={isStable}
        nodeCount={nodeCount}
        fps={fps}
        useCanvas={useCanvas}
      />

      {/* Main content area */}
      <div className="graph-main">
        {/* Left legend */}
        <div className="graph-sidebar-left">
          <LegendPanel
            data={graphData}
            preset={preset}
            onPresetChange={handlePresetChange}
          />
        </div>

        {/* Graph canvas */}
        <div className="graph-canvas-wrap">
          <GraphCanvas
            useCanvas={useCanvas}
            svgRef={svgRef}
            canvasRef={canvasRef}
            containerRef={containerRef}
          />

          {/* Simulation activity indicator */}
          {!isStable && (
            <div className="sim-indicator" aria-live="polite">
              <div className="sim-pulse" />
              <span>Simulating…</span>
            </div>
          )}
        </div>

        {/* Right detail panel */}
        <div className={`graph-sidebar-right ${panelOpen ? 'open' : ''}`}>
          {panelOpen && (
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
