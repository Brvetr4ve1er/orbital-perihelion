import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main:  resolve(__dirname, 'index.html'),
                graph: resolve(__dirname, 'graph.html'),
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
            '/api/proxy': {
                target: 'http://127.0.0.1:5001',
                changeOrigin: true,
            },
            '/api/search': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/search/, '/search'),
            },
            '/api/scrape': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/scrape/, '/scrape'),
            },
            '/api/enrich-web': {
                target: 'http://127.0.0.1:5002',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/enrich-web/, '/enrich'),
            }
        }
    },
});
