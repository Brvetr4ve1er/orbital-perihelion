// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Simulation Engine
// Fully decoupled from React. D3-force physics only.
// ─────────────────────────────────────────────────────────────────────────────

import * as d3Force from 'd3-force';
import type {
  Simulation,
} from 'd3-force';
import type {
  GraphNode,
  GraphLink,
  GraphData,
  SimulationConfig,
} from '../types';
import { DEFAULT_SIM_CONFIG } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TickCallback = (nodes: GraphNode[], links: GraphLink[]) => void;
export type StableCallback = () => void;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class GraphSimulationEngine {
  private sim: Simulation<GraphNode, GraphLink> | null = null;
  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private config: SimulationConfig;
  private onTick: TickCallback;
  private onStable: StableCallback;
  private width: number;
  private height: number;
  private isRunning = false;

  constructor(
    width: number,
    height: number,
    onTick: TickCallback,
    onStable: StableCallback,
    config: Partial<SimulationConfig> = {}
  ) {
    this.width = width;
    this.height = height;
    this.onTick = onTick;
    this.onStable = onStable;
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Initialize (or reinitialize) the simulation with new graph data.
   * Preserves positions of existing nodes (position persistence).
   */
  initialize(data: GraphData, savedPositions?: Map<string, { x: number; y: number }>) {
    this.destroy();

    const safeNodes = data?.nodes ?? [];
    const safeLinks = data?.links ?? [];
    
    // Deep-copy nodes to prevent mutation of external data
    this.nodes = safeNodes.map(n => {
      const saved = savedPositions?.get(n.id);
      if (saved) {
        return { ...n, x: saved.x, y: saved.y, fx: n.pinned ? saved.x : undefined, fy: n.pinned ? saved.y : undefined };
      }
      // Scatter new nodes around center with some initial jitter
      const angle = Math.random() * 2 * Math.PI;
      const r = 50 + Math.random() * Math.min(this.width, this.height) * 0.35;
      return { ...n, x: this.width / 2 + Math.cos(angle) * r, y: this.height / 2 + Math.sin(angle) * r };
    });

    // Shallow-copy links (D3 mutates source/target to node objects)
    this.links = safeLinks.map(l => ({ ...l }));

    this._buildSimulation(savedPositions ? 0.1 : 1.0);
  }

  /**
   * Add new nodes/links without full rebuild.
   * Existing positions are preserved.
   */
  addNodes(newData: GraphData) {
    const existingIds = new Set(this.nodes.map(n => n.id));

    const newNodes = newData.nodes.filter(n => !existingIds.has(n.id)).map(n => ({
      ...n,
      x: this.width / 2 + (Math.random() - 0.5) * 100,
      y: this.height / 2 + (Math.random() - 0.5) * 100,
    }));

    if (newNodes.length === 0) return;

    this.nodes = [...this.nodes, ...newNodes];
    this.links = [...this.links, ...newData.links.map(l => ({ ...l }))];

    this._buildSimulation(0.3);
  }

  /**
   * Notify simulation that a drag has started on a node.
   * Temporarily bumps alpha so surrounding nodes respond.
   */
  dragStarted(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!this.isRunning) {
      this.sim?.alpha(0.3).restart();
      this.isRunning = true;
    }
    node.fx = node.x;
    node.fy = node.y;
  }

  dragMoving(nodeId: string, x: number, y: number) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.fx = x;
    node.fy = y;
  }

  dragEnded(nodeId: string, pin: boolean = false) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!pin) {
      node.fx = undefined;
      node.fy = undefined;
    } else {
      node.pinned = true;
    }
    this.sim?.alphaTarget(0);
  }

  /** Restart physics with a light alpha kick */
  reheat(alpha = 0.3) {
    this.sim?.alpha(alpha).restart();
    this.isRunning = true;
  }

  /** Hard stop — used when component unmounts */
  destroy() {
    this.sim?.stop();
    this.sim = null;
    this.isRunning = false;
  }

  /** Resize world bounds */
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.sim?.force('center', d3Force.forceCenter(width / 2, height / 2));
  }

  getNodes(): GraphNode[] { return this.nodes; }
  getLinks(): GraphLink[] { return this.links; }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _buildSimulation(startAlpha: number) {
    const { config } = this;

    // Link strength by type
    const linkStrengthFn = (link: GraphLink) => {
      switch (link.strength) {
        case 'strong': return 0.9;
        case 'weak':   return 0.15;
        default:       return 0.5;
      }
    };

    const linkDistanceFn = (link: GraphLink) => {
      switch (link.strength) {
        case 'strong': return config.linkDistance * 0.7;
        case 'weak':   return config.linkDistance * 1.5;
        default:       return config.linkDistance;
      }
    };

    // Node radius for collision
    const nodeRadius = (n: GraphNode) =>
      Math.max(4, Math.log1p(n.degree) * 8) * config.collisionMultiplier;

    const linkForce = d3Force.forceLink<GraphNode, GraphLink>(this.links)
      .id((n) => n.id)
      .distance(linkDistanceFn)
      .strength(linkStrengthFn)
      .iterations(2);

    const chargeForce = d3Force.forceManyBody<GraphNode>()
      .strength((n) => config.chargeStrength * Math.max(0.5, Math.log1p((n as GraphNode).degree)))
      .distanceMax(500)
      .theta(0.85);

    const centerForce = d3Force.forceCenter(this.width / 2, this.height / 2).strength(0.05);

    this.sim = d3Force.forceSimulation<GraphNode, GraphLink>(this.nodes)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('center', centerForce)
      .alpha(startAlpha)
      .alphaDecay(config.alphaDecay)
      .alphaMin(0.001)
      .velocityDecay(config.velocityDecay);

    if (config.enableCollision) {
      this.sim.force(
        'collision',
        d3Force.forceCollide<GraphNode>().radius(nodeRadius).iterations(2)
      );
    }

    this.isRunning = true;

    this.sim.on('tick', () => {
      this.onTick(this.nodes, this.links);
    });

    this.sim.on('end', () => {
      this.isRunning = false;
      this.onStable();
    });
  }
}
