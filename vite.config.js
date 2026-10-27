import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const sidecarUrl = env.VITE_SIDECAR_URL || 'http://127.0.0.1:5001';
    const llmUrl = env.VITE_LLM_URL_DEV || 'http://127.0.0.1:1234';

    return {
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
                        d3:       ['d3', 'd3-force', 'd3-selection', 'd3-zoom'],
                        framer:   ['framer-motion'],
                        tanstack: ['@tanstack/react-virtual'],
                        zod:      ['zod'],
                        idb:      ['idb'],
                    },
                },
            },
        },
        server: {
            host: '127.0.0.1',
            port: 5000,
            allowedHosts: ['localhost', '127.0.0.1'],
            proxy: {
                '/api/llm': {
                    target: llmUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/llm/, '/v1/chat/completions')
                },
                '/api/ollama': {
                    target: 'http://127.0.0.1:11434',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
                },
                // ── Python Sidecar ──────────────────────
                '/api/health': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/health/, '/health'),
                },
                '/api/search': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/search/, '/search'),
                },
                '/api/scrape': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/scrape/, '/scrape'),
                },
                // Must come before /api/enrich to avoid prefix collision
                '/api/enrich-product': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/enrich-product/, '/enrich-product'),
                },
                '/api/enrich': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/enrich/, '/enrich'),
                },
                // ── CORS Proxy for DDG HTML fallback ────
                '/api/proxy': {
                    target: sidecarUrl,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/proxy/, '/proxy'),
                },
            }
        },
    };
});
