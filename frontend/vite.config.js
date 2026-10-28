import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rewrite-multi-page-routes',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/products' || req.url?.startsWith('/products?')) {
            req.url = '/products.html';
          } else if (req.url === '/cart' || req.url?.startsWith('/cart?')) {
            req.url = '/cart.html';
          }
          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        products: resolve(__dirname, 'products.html'),
        cart: resolve(__dirname, 'cart.html'),
      },
    },
  },
})
