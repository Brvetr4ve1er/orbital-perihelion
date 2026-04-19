import React from 'react';
import { createRoot } from 'react-dom/client';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { App } from './ui/App';
import './index.css';
import './graph/graph.css';

AOS.init({
    duration: 420,
    easing: 'ease-out-cubic',
    once: true,
    offset: 40,
    disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
