import React from 'react';
import { createRoot } from 'react-dom/client';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { App } from './ui/App';
import './ui/styles/base.css';
import './ui/styles/admin-shell.css';
import './ui/styles/graph.css';

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
