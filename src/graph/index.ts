// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Public Barrel Export
// ─────────────────────────────────────────────────────────────────────────────

export { GraphView } from './components/GraphView';
export { GraphCanvas } from './components/GraphCanvas';
export { GraphControls } from './components/GraphControls';
export { NodeDetailPanel } from './components/NodeDetailPanel';
export { LegendPanel } from './components/LegendPanel';
export { useGraphEngine } from './hooks/useGraphEngine';
export { useSearch } from './hooks/useSearch';
export { GraphSimulationEngine } from './simulation/engine';
export { SVGRenderer } from './renderer/svg-renderer';
export { CanvasRenderer } from './renderer/canvas-renderer';
export { generateDataset, GRAPH_PRESETS } from './data/example-dataset';
export { savePositions, loadPositions, clearPositions } from './simulation/persistence';
export type {
  GraphNode,
  GraphLink,
  GraphData,
  NodeGroup,
  SimulationConfig,
  RenderConfig,
  InteractionState,
} from './types';
export {
  GROUP_COLORS,
  GROUP_GLOW,
  DEFAULT_SIM_CONFIG,
  DEFAULT_RENDER_CONFIG,
} from './types';
