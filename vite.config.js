import { defineConfig } from 'vite';

// Relative base so the production build can be hosted from any subpath
// (e.g. GitHub Pages project sites or a portfolio subfolder).
export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        // Only the game ships. The headless balance harness in tools/ is a
        // development utility and is intentionally excluded from the bundle.
        rollupOptions: {
            input: {
                main: 'index.html',
            },
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
    },
});
