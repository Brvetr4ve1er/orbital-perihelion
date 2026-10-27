// ─────────────────────────────────────────────────────────────────────────────
// Graph System — SVG Renderer
// Handles all drawing. React refs only — no state updates per frame.
// ─────────────────────────────────────────────────────────────────────────────

import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import { drag } from 'd3';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import type {
  GraphNode,
  GraphLink,
  RenderConfig,
  InteractionState,
} from '../types';
import {
  GROUP_COLORS,
  DEFAULT_RENDER_CONFIG,
} from '../types';

// ─── Node radius helper ───────────────────────────────────────────────────────

function nodeRadius(n: GraphNode, cfg: RenderConfig): number {
  return Math.min(
    cfg.maxRadius,
    Math.max(cfg.minRadius, cfg.baseRadius + Math.sqrt(n.degree) * 2.2)
  );
}

// ─── SVG Renderer ─────────────────────────────────────────────────────────────

export class SVGRenderer {
  private svg: d3Selection.Selection<SVGSVGElement, unknown, null, undefined>;
  private container: d3Selection.Selection<SVGGElement, unknown, null, undefined>;
  private linkLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>;
  private nodeLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>;
  private labelLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>;
  private zoom: ZoomBehavior<SVGSVGElement, unknown>;
  private currentTransform: ZoomTransform;
  private cfg: RenderConfig;
  private width: number;
  private height: number;

  // Cached selections for performance
  private cachedNodeSel: d3Selection.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown> | null = null;
  private cachedLinkLabelSel: d3Selection.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null;
  private cachedLinkSel: d3Selection.Selection<SVGPathElement, GraphLink, SVGGElement, unknown> | null = null;

  // Callbacks set by the hook
  onZoomChange?: (t: { x: number; y: number; k: number }) => void;
  onNodeHover?: (id: string | null) => void;
  onNodeClick?: (id: string) => void;
  onNodeDragStart?: (id: string) => void;
  onNodeDragMove?: (id: string, x: number, y: number) => void;
  onNodeDragEnd?: (id: string) => void;

  constructor(
    svgEl: SVGSVGElement,
    width: number,
    height: number,
    cfg: Partial<RenderConfig> = {}
  ) {
    this.width = width;
    this.height = height;
    this.cfg = { ...DEFAULT_RENDER_CONFIG, ...cfg };
    this.currentTransform = d3Zoom.zoomIdentity;

    this.svg = d3Selection.select(svgEl);
    // Critical: wipe any prior SVG content so remounts don't stack <g> layers
    // (this was the source of ghosting/duplicated nodes across filter changes)
    this.svg.selectAll('*').remove();
    this.svg
      .attr('width', width)
      .attr('height', height)
      .style('background', 'transparent');

    // Defs: filters for glow
    this._initDefs();

    this.container = this.svg.append('g').attr('class', 'graph-container');
    this.linkLayer = this.container.append('g').attr('class', 'link-layer');
    this.nodeLayer = this.container.append('g').attr('class', 'node-layer');
    this.labelLayer = this.container.append('g').attr('class', 'label-layer');

    // Zoom
    this.zoom = d3Zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        this.container.attr('transform', event.transform.toString());
        this.onZoomChange?.({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
        this._updateLOD(event.transform.k);
      });

    this.svg.call(this.zoom).on('dblclick.zoom', null);
  }

  // ─── Public Methods ──────────────────────────────────────────────────────────

  render(
    nodes: GraphNode[],
    links: GraphLink[],
    interaction: InteractionState
  ) {
    const k = this.currentTransform.k;
    const { lodFar, lodMid } = this.cfg;

    // ─── Links ────────────────────────────────────────────────────────────────
    if (k >= lodFar) {
      const visibleLinks = links.filter(l => {
        if (l.hidden) return false;
        const src = l.source as GraphNode;
        const tgt = l.target as GraphNode;
        if (src.hidden || tgt.hidden) return false;
        // Hide weak edges when zoomed out
        if (k < lodMid && l.strength === 'weak') return false;
        return true;
      });

      const linkSel = this.linkLayer
        .selectAll<SVGPathElement, GraphLink>('path.link')
        .data(visibleLinks, (d) => d.id);

      const linkEnter = linkSel.enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke-linecap', 'round');

      this.cachedLinkSel = linkSel.merge(linkEnter);
      
      this.cachedLinkSel
        .attr('stroke', (d) => {
          const src = d.source as GraphNode;
          if (interaction.hoveredNodeId &&
            (src.id === interaction.hoveredNodeId || (d.target as GraphNode).id === interaction.hoveredNodeId)) {
            return '#a5b4fc';
          }
          return 'rgba(148,163,184,0.18)';
        })
        .attr('stroke-width', (d) => {
          switch (d.strength) {
            case 'strong': return 1.8;
            case 'weak':   return 0.6;
            default:       return 1.1;
          }
        })
        .attr('stroke-opacity', (d) => {
          if (interaction.hoveredNodeId) {
            const src = d.source as GraphNode;
            const tgt = d.target as GraphNode;
            return (src.id === interaction.hoveredNodeId || tgt.id === interaction.hoveredNodeId)
              ? 0.9 : 0.06;
          }
          return 0.55;
        })
        .attr('d', (d) => this._curvePath(d));

      linkSel.exit().remove();
    } else {
      this.linkLayer.selectAll('*').remove();
      this.cachedLinkSel = null;
    }

    // ─── Nodes ────────────────────────────────────────────────────────────────
    const visibleNodes = nodes.filter(n => !n.hidden);

    const nodeSel = this.nodeLayer
      .selectAll<SVGCircleElement, GraphNode>('circle.node')
      .data(visibleNodes, (d) => d.id);

    const nodeEnter = nodeSel.enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cursor', 'grab')
      .call(this._dragBehavior());

    nodeEnter
      .on('mouseenter', (_event, d) => this.onNodeHover?.(d.id))
      .on('mouseleave', () => this.onNodeHover?.(null))
      .on('click', (_event, d) => {
        _event.stopPropagation();
        this.onNodeClick?.(d.id);
      });

    this.cachedNodeSel = nodeSel.merge(nodeEnter);

    this.cachedNodeSel
      .attr('cx', (d) => d.x ?? 0)
      .attr('cy', (d) => d.y ?? 0)
      .attr('r', (d) => nodeRadius(d, this.cfg))
      .attr('fill', (d) => GROUP_COLORS[d.group] ?? GROUP_COLORS.default)
      .attr('stroke', (d) => {
        if (d.id === interaction.selectedNodeId) return '#fff';
        if (d.id === interaction.hoveredNodeId) return '#e2e8f0';
        return 'rgba(255,255,255,0.12)';
      })
      .attr('stroke-width', (d) => {
        if (d.id === interaction.selectedNodeId) return 2.5;
        if (d.id === interaction.hoveredNodeId) return 2;
        return 0.8;
      })
      .attr('opacity', (d) => {
        if (interaction.hoveredNodeId && d.id !== interaction.hoveredNodeId) {
          // check adjacency
          return 0.2;
        }
        return 1;
      })
      .attr('filter', (d) => {
        if (d.id === interaction.hoveredNodeId || d.id === interaction.selectedNodeId) {
          return `url(#glow-${d.group})`;
        }
        return null;
      });

    nodeSel.exit().remove();

    // ─── Labels ───────────────────────────────────────────────────────────────
    if (k >= this.cfg.lodClose) {
      const labelNodes = visibleNodes.filter(n =>
        n.degree > 2 ||
        n.id === interaction.hoveredNodeId ||
        n.id === interaction.selectedNodeId
      );

      const labelSel = this.labelLayer
        .selectAll<SVGTextElement, GraphNode>('text.label')
        .data(labelNodes, (d) => d.id);

      const labelEnter = labelSel.enter()
        .append('text')
        .attr('class', 'label')
        .attr('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'auto')
        .attr('font-family', 'Inter, sans-serif')
        .attr('font-size', 10)
        .attr('fill', '#e2e8f0');

      this.cachedLinkLabelSel = labelSel.merge(labelEnter);
      
      this.cachedLinkLabelSel
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => (d.y ?? 0) + nodeRadius(d, this.cfg) + 12)
        .attr('opacity', (d) => {
          if (interaction.hoveredNodeId && d.id !== interaction.hoveredNodeId) return 0.3;
          return 0.85;
        })
        .text((d) => { const lbl = d.label || ''; return lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl; });

      labelSel.exit().remove();
    } else if (k >= this.cfg.lodMid) {
      // Show only hovered/selected labels
      const specialNodes = visibleNodes.filter(n =>
        n.id === interaction.hoveredNodeId || n.id === interaction.selectedNodeId
      );
      const labelSel = this.labelLayer
        .selectAll<SVGTextElement, GraphNode>('text.label')
        .data(specialNodes, (d) => d.id);

      const labelEnter = labelSel.enter()
        .append('text')
        .attr('class', 'label')
        .attr('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Inter, sans-serif')
        .attr('font-size', 11)
        .attr('fill', '#f8fafc');

      labelSel.merge(labelEnter)
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => (d.y ?? 0) + nodeRadius(d, this.cfg) + 14)
        .text((d) => { const lbl = d.label || ''; return lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl; });

      labelSel.exit().remove();
    } else {
      this.labelLayer.selectAll('*').remove();
    }
  }

  /** Fast position-only update — called on every simulation tick */
  updatePositions(_nodes: GraphNode[], _links: GraphLink[]) {
    if (this.cachedNodeSel) {
      this.cachedNodeSel
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0);
    }

    if (this.cachedLinkLabelSel) {
      this.cachedLinkLabelSel
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => (d.y ?? 0) + nodeRadius(d, this.cfg) + 12);
    }

    if (this.cachedLinkSel) {
      this.cachedLinkSel
        .attr('d', (d) => this._curvePath(d));
    }
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.svg.attr('width', w).attr('height', h);
  }

  fitView(nodes: GraphNode[]) {
    if (nodes.length === 0) return;
    const padding = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      }
    }
    const gw = maxX - minX + padding * 2;
    const gh = maxY - minY + padding * 2;
    const scale = Math.min(this.width / gw, this.height / gh, 2);
    const tx = this.width / 2 - scale * ((minX + maxX) / 2);
    const ty = this.height / 2 - scale * ((minY + maxY) / 2);
    this.svg.transition().duration(600).call(
      this.zoom.transform,
      d3Zoom.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _initDefs() {
    const defs = this.svg.append('defs');
    const groups: Array<{ id: string; color: string }> = [
      { id: 'glow-default',  color: '#6b7280' },
      { id: 'glow-brand',    color: '#818cf8' },
      { id: 'glow-category', color: '#34d399' },
      { id: 'glow-product',  color: '#fb923c' },
      { id: 'glow-tag',      color: '#f472b6' },
      { id: 'glow-cluster',  color: '#a78bfa' },
    ];
    for (const g of groups) {
      const filter = defs.append('filter')
        .attr('id', g.id)
        .attr('x', '-50%').attr('y', '-50%')
        .attr('width', '200%').attr('height', '200%');
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'blur');
      const merge = filter.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }
  }

  private _dragBehavior() {
    return drag<SVGCircleElement, GraphNode>()
      .on('start', (_event, d) => {
        _event.sourceEvent.stopPropagation();
        this.svg.style('cursor', 'grabbing');
        this.onNodeDragStart?.(d.id);
      })
      .on('drag', (_event, d) => {
        // D3 drag event x/y are already in the zoomed coordinate space
        // We need to convert back to graph (pre-zoom) space
        const t = this.currentTransform;
        const gx = (_event.x - t.x) / t.k;
        const gy = (_event.y - t.y) / t.k;
        this.onNodeDragMove?.(d.id, gx, gy);
      })
      .on('end', (_event, d) => {
        this.svg.style('cursor', 'default');
        this.onNodeDragEnd?.(d.id);
      });
  }

  private _curvePath(link: GraphLink): string {
    const s = link.source as GraphNode;
    const t = link.target as GraphNode;
    if (!s.x || !s.y || !t.x || !t.y) return '';
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dr = Math.sqrt(dx * dx + dy * dy) * 0.6;
    return `M${s.x},${s.y} A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
  }

  private _updateLOD(k: number) {
    const { lodFar } = this.cfg;
    // Opacity based on zoom for smooth fading
    this.nodeLayer.attr('opacity', k < lodFar ? 0.7 : 1);
  }
}
