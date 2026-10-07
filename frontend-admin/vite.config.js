import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/pos/',

  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    port: 3000,
    host: true,
  },

  build: {
    chunkSizeWarningLimit: 500,

    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')

          // Keep framework dependencies out of feature chunks so the login entry
          // never preloads a large product page just to obtain React/ReactDOM.
          if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/') || normalized.includes('/node_modules/react-router') || normalized.includes('/node_modules/scheduler/')) {
            return 'vendor-react'
          }

          // =====================================================
          // PRODUCT AREA
          // Keep large product tools in separate chunks.
          // =====================================================

          if (
            normalized.includes(
              '/src/pages/products/ProductList.jsx'
            )
          ) {
            return 'page-products-list'
          }

          if (
            normalized.includes(
              '/src/pages/products/ProductForm.jsx'
            )
          ) {
            return 'page-products-form'
          }

          if (
            normalized.includes(
              '/src/pages/products/ProductVariantMatrix.jsx'
            )
          ) {
            return 'page-products-variants'
          }

          if (
            normalized.includes(
              '/src/pages/products/ProductImageGallery.jsx'
            )
          ) {
            return 'page-products-gallery'
          }

          if (
            normalized.includes(
              '/src/pages/products/components/ProductSpecificationStudio.jsx'
            )
          ) {
            return 'page-products-specifications'
          }

          // Shared product form/content helpers
          if (
            normalized.includes(
              '/src/components/product-content/'
            )
          ) {
            return 'product-content'
          }

          // =====================================================
          // EXISTING PAGE GROUPING
          // =====================================================

          const pageMatch = normalized.match(
            /\/src\/pages\/([^/]+)/
          )

          if (pageMatch) {
            const safeName = pageMatch[1].replace(
              /[^a-zA-Z0-9_-]/g,
              '-'
            )

            return `page-${safeName}`
          }

          return undefined
        },
      },
    },
  },
})
