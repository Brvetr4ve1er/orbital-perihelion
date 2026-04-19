// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Canvas Renderer
// High-performance fallback for >5k nodes using requestAnimationFrame loop
// ─────────────────────────────────────────────────────────────────────────────

import * as d3Zoom from 'd3-zoom';
import * as d3Selection from 'd3-selection';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import type { GraphNode, GraphLink, RenderConfig, InteractionState } from '../types';
import { GROUP_COLORS, DEFAULT_RENDER_CONFIG } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nodeRadius(n: GraphNode, cfg: RenderConfig): number {
  return Math.min(cfg.maxRadius, Math.max(cfg.minRadius, cfg.baseRadius + Math.sqrt(n.degree) * 2.2));
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private zoom: ZoomBehavior<HTMLCanvasElement, unknown>;
  private transform: ZoomTransform;
  private cfg: RenderConfig;
  private rafId: number | null = null;
  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private interaction: InteractionState;
  private width: number;
  private height: number;
  private dirty = false;
  // Store bound handlers for proper cleanup
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundClick: (e: MouseEvent) => void;

  onZoomChange?: (t: { x: number; y: number; k: number }) => void;
  onNodeHover?: (id: string | null) => void;
  onNodeClick?: (id: string) => void;
  onNodeDragStart?: (id: string) => void;
  onNodeDragMove?: (id: string, x: number, y: number) => void;
  onNodeDragEnd?: (id: string) => void;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    cfg: Partial<RenderConfig> = {}
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = width;
    this.height = height;
    this.cfg = { ...DEFAULT_RENDER_CONFIG, ...cfg };
    this.transform = d3Zoom.zoomIdentity;
    this.interaction = {
      hoveredNodeId: null,
      selectedNodeId: null,
      searchQuery: '',
      activeGroups: new Set(),
      transform: { x: 0, y: 0, k: 1 },
    };

    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    this.zoom = d3Zoom.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.dirty = true;
        this.onZoomChange?.({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });

    d3Selection.select(canvas).call(this.zoom).on('dblclick.zoom', null);

    // Store bound handlers so we can removeEventListener correctly
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundClick = this._onClick.bind(this);
    canvas.addEventListener('mousemove', this._boundMouseMove);
    canvas.addEventListener('click', this._boundClick);

    this._startLoop();
  }

  render(nodes: GraphNode[], links: GraphLink[], interaction: InteractionState) {
    this.nodes = nodes;
    this.links = links;
    this.interaction = interaction;
    this.dirty = true;
  }

  updatePositions(nodes: GraphNode[], links: GraphLink[]) {
    this.nodes = nodes;
    this.links = links;
    this.dirty = true;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.canvas.width = w * window.devicePixelRatio;
    this.canvas.height = h * window.devicePixelRatio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.dirty = true;
  }

  fitView(nodes: GraphNode[]) {
    if (!nodes.length) return;
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
    d3Selection.select(this.canvas).transition().duration(600).call(
      this.zoom.transform,
      d3Zoom.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('mousemove', this._boundMouseMove);
    this.canvas.removeEventListener('click', this._boundClick);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _startLoop() {
    const loop = () => {
      if (this.dirty) {
        this._draw();
        this.dirty = false;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private _draw() {
    const { ctx, transform, width, height, cfg, interaction } = this;
    const k = transform.k;
    const { lodFar, lodMid, lodClose } = cfg;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(k, k);

    const visibleNodes = this.nodes.filter(n => !n.hidden);
    const hovId = interaction.hoveredNodeId;
    const selId = interaction.selectedNodeId;

    // ─── Links ────────────────────────────────────────────────────────────────
    if (k >= lodFar) {
      ctx.save();
      // Batch draw by opacity level
      for (const link of this.links) {
        if (link.hidden) continue;
        const s = link.source as GraphNode;
        const t = link.target as GraphNode;
        if (!s.x || !s.y || !t.x || !t.y || s.hidden || t.hidden) continue;
        if (k < lodMid && link.strength === 'weak') continue;

        const isHighlighted = hovId && (s.id === hovId || t.id === hovId);
        const dx = t.x - s.x, dy = t.y - s.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 0.6;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        // Quadratic arc approximation for perf
        const mx = (s.x + t.x) / 2 + dy * 0.2;
        const my = (s.y + t.y) / 2 - dx * 0.2;
        ctx.quadraticCurveTo(mx, my, t.x, t.y);

        if (isHighlighted) {
          ctx.strokeStyle = 'rgba(165,180,252,0.9)';
          ctx.lineWidth = link.strength === 'strong' ? 2.5 : 1.5;
        } else if (hovId) {
          ctx.strokeStyle = 'rgba(148,163,184,0.06)';
          ctx.lineWidth = 0.8;
        } else {
          ctx.strokeStyle = link.strength === 'strong'
            ? 'rgba(148,163,184,0.35)'
            : 'rgba(148,163,184,0.15)';
          ctx.lineWidth = link.strength === 'strong' ? 1.5 : 0.8;
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // ─── Nodes ────────────────────────────────────────────────────────────────
    for (const node of visibleNodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const r = nodeRadius(node, cfg);
      const color = GROUP_COLORS[node.group] ?? GROUP_COLORS.default;
      const isHovered = node.id === hovId;
      const isSelected = node.id === selId;
      const dimmed = hovId && !isHovered;

      ctx.save();

      // Glow effect for hovered/selected
      if (isHovered || isSelected) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = dimmed ? hexToRgba(color, 0.2) : color;
      ctx.fill();

      // Stroke
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      ctx.restore();
    }

    // ─── Labels ───────────────────────────────────────────────────────────────
    if (k >= lodClose) {
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      for (const node of visibleNodes) {
        if (node.x === undefined || node.y === undefined) continue;
        if (node.degree < 3 && node.id !== hovId && node.id !== selId) continue;
        const dimmed = hovId && node.id !== hovId;
        ctx.fillStyle = dimmed ? 'rgba(226,232,240,0.3)' : 'rgba(226,232,240,0.85)';
        const lbl = node.label || '';
        const label = lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl;
        ctx.fillText(label, node.x, node.y + nodeRadius(node, cfg) + 12);
      }
    } else if (k >= lodMid && (hovId || selId)) {
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      for (const node of visibleNodes) {
        if (node.id !== hovId && node.id !== selId) continue;
        if (node.x === undefined || node.y === undefined) continue;
        ctx.fillStyle = 'rgba(248,250,252,0.95)';
        ctx.fillText(node.label, node.x, node.y + nodeRadius(node, cfg) + 14);
      }
    }

    ctx.restore();
  }

  private _getNodeAt(clientX: number, clientY: number): GraphNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const [gx, gy] = this.transform.invert([mx, my]);

    let best: GraphNode | null = null;
    let bestDist = Infinity;
    for (const node of this.nodes) {
      if (node.x === undefined || node.y === undefined || node.hidden) continue;
      const r = nodeRadius(node, this.cfg) + 4;
      const dx = node.x - gx;
      const dy = node.y - gy;
      const dist = dx * dx + dy * dy;
      if (dist <= r * r && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }

  private _onMouseMove(e: MouseEvent) {
    const node = this._getNodeAt(e.clientX, e.clientY);
    this.onNodeHover?.(node?.id ?? null);
    this.canvas.style.cursor = node ? 'pointer' : 'default';
  }

  private _onClick(e: MouseEvent) {
    const node = this._getNodeAt(e.clientX, e.clientY);
    if (node) this.onNodeClick?.(node.id);
  }
}
