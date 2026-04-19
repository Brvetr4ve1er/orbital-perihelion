// ─────────────────────────────────────────────────────────────────────────────
// Graph System — GraphCanvas Component
// Renders the SVG or Canvas element. No D3 logic here.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface GraphCanvasProps {
  useCanvas: boolean;
  svgRef: React.RefObject<SVGSVGElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  useCanvas,
  svgRef,
  canvasRef,
  containerRef,
}) => {
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {useCanvas ? (
        <canvas
          ref={canvasRef as React.RefObject<HTMLCanvasElement>}
          style={{ display: 'block', width: '100%', height: '100%' }}
          aria-label="Node graph (canvas mode)"
        />
      ) : (
        <svg
          ref={svgRef as React.RefObject<SVGSVGElement>}
          style={{ display: 'block', width: '100%', height: '100%' }}
          aria-label="Node graph"
        />
      )}
    </div>
  );
};
