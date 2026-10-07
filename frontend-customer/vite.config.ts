import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    // Same-origin API in development: no CORS problems whether the site is opened as localhost or 127.0.0.1.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
      '/storage': { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
    },
  },
  build: {
    // Route-level React.lazy imports already provide effective page splitting.
    // Let Rollup manage shared dependencies to avoid circular vendor chunks.
    chunkSizeWarningLimit: 500,
  },
});
