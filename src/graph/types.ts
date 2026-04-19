// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Core Types
// ─────────────────────────────────────────────────────────────────────────────

import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

// ─── Node ────────────────────────────────────────────────────────────────────

export type NodeGroup =
  | 'default'
  | 'brand'
  | 'category'
  | 'product'
  | 'tag'
  | 'cluster';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  group: NodeGroup;
  /** Number of connections — determines visual radius */
  degree: number;
  /** Optional metadata shown in sidebar/modal */
  meta?: Record<string, unknown>;
  /** Soft pin: node has user-set position */
  pinned?: boolean;
  /** Visibility toggle (filtering without rebuild) */
  hidden?: boolean;
  /** Cluster membership ID */
  clusterId?: string;
}

// ─── Link ────────────────────────────────────────────────────────────────────

export type LinkStrength = 'strong' | 'normal' | 'weak';

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  strength?: LinkStrength;
  /** Visibility toggle */
  hidden?: boolean;
}

// ─── Graph Data ──────────────────────────────────────────────────────────────

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ─── Simulation Config ───────────────────────────────────────────────────────

export interface SimulationConfig {
  /** Alpha decay controls how fast simulation slows down. Lower = slower. */
  alphaDecay: number;
  /** Velocity decay (friction). Higher = faster stop. */
  velocityDecay: number;
  /** Many-body repulsion strength. Negative = repulsion. */
  chargeStrength: number;
  /** Ideal link distance in pixels */
  linkDistance: number;
  /** Collision radius multiplier */
  collisionMultiplier: number;
  /** Enable collision force */
  enableCollision: boolean;
}

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  alphaDecay: 0.02,
  velocityDecay: 0.4,
  chargeStrength: -180,
  linkDistance: 80,
  collisionMultiplier: 1.4,
  enableCollision: true,
};

// ─── Render Config ───────────────────────────────────────────────────────────

export interface RenderConfig {
  /** Max nodes before switching to canvas */
  svgThreshold: number;
  /** Zoom levels for LOD transitions */
  lodFar: number;        // below this: clusters only
  lodMid: number;        // below this: nodes, no labels
  lodClose: number;      // above this: full detail
  /** Base node radius */
  baseRadius: number;
  /** Min/max radius bounds */
  minRadius: number;
  maxRadius: number;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  svgThreshold: 5000,
  lodFar: 0.25,
  lodMid: 0.6,
  lodClose: 1.0,
  baseRadius: 6,
  minRadius: 3,
  maxRadius: 28,
};

// ─── Interaction State ───────────────────────────────────────────────────────

export interface InteractionState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  searchQuery: string;
  activeGroups: Set<NodeGroup>;
  transform: { x: number; y: number; k: number };
}

// ─── Color Map ───────────────────────────────────────────────────────────────

export const GROUP_COLORS: Record<NodeGroup, string> = {
  default:  '#64748b',
  brand:    '#0ea5e9',
  category: '#10b981',
  product:  '#f59e0b',
  tag:      '#94a3b8',
  cluster:  '#6366f1',
};

export const GROUP_GLOW: Record<NodeGroup, string> = {
  default:  'rgba(100,116,139,0.4)',
  brand:    'rgba(14,165,233,0.5)',
  category: 'rgba(16,185,129,0.5)',
  product:  'rgba(245,158,11,0.5)',
  tag:      'rgba(148,163,184,0.5)',
  cluster:  'rgba(99,102,241,0.5)',
};
