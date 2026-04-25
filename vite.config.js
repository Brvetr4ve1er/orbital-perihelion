import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        chunkSizeWarningLimit: 900,
        rollupOptions: {
            input: {
                main:  resolve(__dirname, 'index.html'),
                graph: resolve(__dirname, 'graph.html'),
            },
            output: {
                manualChunks: {
                    react:       ['react', 'react-dom'],
                    d3:          ['d3', 'd3-color', 'd3-force', 'd3-scale', 'd3-selection', 'd3-zoom'],
                    framer:      ['framer-motion'],
                    tanstack:    ['@tanstack/react-virtual'],
                    zod:         ['zod'],
                    idb:         ['idb'],
                },
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5000,
        allowedHosts: true,
        proxy: {
            '/api/llm': {
                target: 'http://10.36.208.130:1234',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/llm/, '/v1/chat/completions')
            },
            '/api/ollama': {
                target: 'http://127.0.0.1:11434',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
            },
            // ── Python Sidecar (:5001) ──────────────────────
            '/api/health': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/health/, '/health'),
            },
            '/api/search': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/search/, '/search'),
            },
            '/api/scrape': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/scrape/, '/scrape'),
            },
            // Must come before /api/enrich to avoid prefix collision
            '/api/enrich-product': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/enrich-product/, '/enrich-product'),
            },
            '/api/enrich': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/enrich/, '/enrich'),
            },
            // ── CORS Proxy for DDG HTML fallback (:5001) ────
            '/api/proxy': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/proxy/, '/proxy'),
            },
        }
    },
});
