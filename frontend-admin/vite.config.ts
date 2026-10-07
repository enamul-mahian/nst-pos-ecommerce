import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ==========================================
// Vite Production-Ready Configuration
// ==========================================
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Seamlessly compiles Tailwind CSS v4 directives inside CSS assets
  ],
  server: {
    port: 3000,     // Default local development port
    host: true,     // Expose on network (crucial for testing responsive mobile viewports)
  },
  build: {
    outDir: 'dist', // Production build directory
    chunkSizeWarningLimit: 1000, // Safe chunk warning threshold limit
    rollupOptions: {
      output: {
        // Optimize and split bundles for faster page loads
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});