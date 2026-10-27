// Graph System — secondary entry point (graph.html)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { GraphView } from './graph/components/GraphView';
import './ui/styles/graph.css';

const root = document.getElementById('graph-root')!;
createRoot(root).render(
  <React.StrictMode>
    <GraphView initialPreset="medium" />
  </React.StrictMode>
);
