// ─────────────────────────────────────────────────────────────────────────────
// Graph System — useGraphEngine Hook
// Bridges the simulation engine and renderer with React.
// React state is NEVER updated per simulation tick.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useState } from 'react';
import { GraphSimulationEngine } from '../simulation/engine';
import { SVGRenderer } from '../renderer/svg-renderer';
import { CanvasRenderer } from '../renderer/canvas-renderer';
import { savePositions, loadPositions } from '../simulation/persistence';
import type {
  GraphData,
  GraphNode,
  InteractionState,
  SimulationConfig,
  RenderConfig,
} from '../types';
import { DEFAULT_RENDER_CONFIG } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseGraphEngineOptions {
  data: GraphData;
  simConfig?: Partial<SimulationConfig>;
  renderConfig?: Partial<RenderConfig>;
  onNodeSelect?: (node: GraphNode | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGraphEngine(options: UseGraphEngineOptions) {
  const { data, simConfig, renderConfig, onNodeSelect } = options;
  const cfg = { ...DEFAULT_RENDER_CONFIG, ...renderConfig };

  // DOM refs — never trigger React re-renders
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Engine refs — stable across renders
  const simulationRef = useRef<GraphSimulationEngine | null>(null);
  const svgRendererRef = useRef<SVGRenderer | null>(null);
  const canvasRendererRef = useRef<CanvasRenderer | null>(null);

  // Stable refs for callbacks (avoid stale closures)
  const onNodeSelectRef = useRef(onNodeSelect);
  useEffect(() => { onNodeSelectRef.current = onNodeSelect; }, [onNodeSelect]);

  // Interaction state in a ref — no re-render on mutation
  const interactionRef = useRef<InteractionState>({
    hoveredNodeId: null,
    selectedNodeId: null,
    searchQuery: '',
    activeGroups: new Set(),
    transform: { x: 0, y: 0, k: 1 },
  });

  // React state only for things that affect the overlay UI
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [fps, setFps] = useState(60);

  // Use canvas if node count exceeds threshold
  const nodesPool = data?.nodes ?? [];
  const useCanvas = nodesPool.length > cfg.svgThreshold;

  // ─── FPS monitor ──────────────────────────────────────────────────────────

  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const measureFPS = useCallback(() => {
    fpsRef.current.frames++;
    const now = performance.now();
    if (now - fpsRef.current.last >= 1000) {
      setFps(fpsRef.current.frames);
      fpsRef.current.frames = 0;
      fpsRef.current.last = now;
    }
  }, []);

  // ─── Get active renderer ────────────────────────────────────────────────────

  const getRenderer = useCallback((): SVGRenderer | CanvasRenderer | null => {
    if (useCanvas) return canvasRendererRef.current;
    return svgRendererRef.current;
  }, [useCanvas]);

  // ─── Interaction callbacks ────────────────────────────────────────────────────

  const attachCallbacks = useCallback((renderer: SVGRenderer | CanvasRenderer) => {
    renderer.onZoomChange = (t) => {
      interactionRef.current = { ...interactionRef.current, transform: t };
      const sim = simulationRef.current;
      if (sim) {
        renderer.render(sim.getNodes(), sim.getLinks(), interactionRef.current);
      }
    };

    renderer.onNodeHover = (id) => {
      if (interactionRef.current.hoveredNodeId === id) return;
      interactionRef.current = { ...interactionRef.current, hoveredNodeId: id };
      const sim = simulationRef.current;
      if (sim) {
        renderer.render(sim.getNodes(), sim.getLinks(), interactionRef.current);
      }
    };

    renderer.onNodeClick = (id) => {
      const prev = interactionRef.current.selectedNodeId;
      const newSel = prev === id ? null : id;
      interactionRef.current = { ...interactionRef.current, selectedNodeId: newSel };
      const sim = simulationRef.current;
      if (sim) {
        const node = newSel ? sim.getNodes().find(n => n.id === newSel) ?? null : null;
        setSelectedNode(node);
        onNodeSelectRef.current?.(node);
        renderer.render(sim.getNodes(), sim.getLinks(), interactionRef.current);
      }
    };

    renderer.onNodeDragStart = (id) => { simulationRef.current?.dragStarted(id); };
    renderer.onNodeDragMove  = (id, x, y) => { simulationRef.current?.dragMoving(id, x, y); };
    renderer.onNodeDragEnd   = (id) => { simulationRef.current?.dragEnded(id); };
  }, []);

  // ─── Initialize renderer and simulation ─────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const svgEl     = svgRef.current;
    const canvasEl  = canvasRef.current;

    // Guard: we need at least the container and (svg or canvas)
    if (!container) return;
    if (useCanvas && !canvasEl) return;
    if (!useCanvas && !svgEl) return;

    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // ─── Create simulation engine ────────────────────────────────────────────
    const sim = new GraphSimulationEngine(
      w, h,
      (nodes, links) => {
        measureFPS();
        const r = useCanvas ? canvasRendererRef.current : svgRendererRef.current;
        r?.updatePositions(nodes, links);
      },
      () => {
        setIsStable(true);
        const nodes = simulationRef.current?.getNodes() ?? [];
        savePositions(nodes);
      },
      simConfig
    );
    simulationRef.current = sim;

    // ─── Create renderer ─────────────────────────────────────────────────────
    let renderer: SVGRenderer | CanvasRenderer;
    if (useCanvas && canvasEl) {
      const r = new CanvasRenderer(canvasEl, w, h, renderConfig);
      canvasRendererRef.current = r;
      renderer = r;
    } else if (!useCanvas && svgEl) {
      const r = new SVGRenderer(svgEl, w, h, renderConfig);
      svgRendererRef.current = r;
      renderer = r;
    } else {
      sim.destroy();
      return;
    }

    attachCallbacks(renderer);

    // ─── Initialize simulation ───────────────────────────────────────────────
    const savedPositions = loadPositions();
    sim.initialize(data, savedPositions.size > 0 ? savedPositions : undefined);
    setNodeCount(nodesPool.length);
    setIsStable(false);

    // Initial render pass
    renderer.render(sim.getNodes(), sim.getLinks(), interactionRef.current);

    // Fit view slightly delayed so positions settle
    const fitTimer = setTimeout(() => {
      renderer.fitView(sim.getNodes());
    }, 200);

    // ─── Resize observer ─────────────────────────────────────────────────────
    const resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        simulationRef.current?.resize(width, height);
        svgRendererRef.current?.resize(width, height);
        canvasRendererRef.current?.resize(width, height);
      }
    });
    resizeObs.observe(container);

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(fitTimer);
      resizeObs.disconnect();
      sim.destroy();
      canvasRendererRef.current?.destroy();
      simulationRef.current    = null;
      svgRendererRef.current   = null;
      canvasRendererRef.current = null;
    };
  // Recreate when data changes or renderer type switches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, useCanvas]);

  // ─── Filter API ──────────────────────────────────────────────────────────────

  const applyFilter = useCallback((predicate: (n: GraphNode) => boolean) => {
    const sim = simulationRef.current;
    if (!sim) return;
    const nodes = sim.getNodes();
    for (const n of nodes) { n.hidden = !predicate(n); }
    const r = getRenderer();
    if (r) r.render(nodes, sim.getLinks(), interactionRef.current);
  }, [getRenderer]);

  const clearFilter = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    const nodes = sim.getNodes();
    for (const n of nodes) { n.hidden = false; }
    const r = getRenderer();
    if (r) r.render(nodes, sim.getLinks(), interactionRef.current);
  }, [getRenderer]);

  // ─── Fit to view ────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    getRenderer()?.fitView(sim.getNodes());
  }, [getRenderer]);

  // ─── Reheat ─────────────────────────────────────────────────────────────────

  const reheat = useCallback(() => {
    setIsStable(false);
    simulationRef.current?.reheat(0.5);
  }, []);

  return {
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
  };
}
