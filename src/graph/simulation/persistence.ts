// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Position Persistence
// Saves/restores node positions to localStorage
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'orbital-perihelion:graph-positions';
const MAX_NODES_TO_PERSIST = 5000;

export interface PersistedPosition {
  x: number;
  y: number;
}

export function savePositions(nodes: { id: string; x?: number; y?: number }[]): void {
  try {
    const subset = nodes.slice(0, MAX_NODES_TO_PERSIST);
    const obj: Record<string, PersistedPosition> = {};
    for (const n of subset) {
      if (n.x !== undefined && n.y !== undefined) {
        obj[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // localStorage may be full — silently fail
  }
}

export function loadPositions(): Map<string, PersistedPosition> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, PersistedPosition>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export function clearPositions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
