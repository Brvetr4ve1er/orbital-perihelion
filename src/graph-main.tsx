// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { createRoot } from 'react-dom/client';
import { GraphView } from './graph/components/GraphView';
import './graph/graph.css';

const root = document.getElementById('graph-root')!;
createRoot(root).render(
  <React.StrictMode>
    <GraphView initialPreset="medium" />
  </React.StrictMode>
);
