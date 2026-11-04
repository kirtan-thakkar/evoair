import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { resolve } from 'path'

const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:5000';

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
          } else if (req.url === '/checkout' || req.url?.startsWith('/checkout?')) {
            req.url = '/checkout.html';
          } else if (
            req.url === '/orders' ||
            req.url?.startsWith('/orders?') ||
            req.url?.match(/^\/[^/]+\/orders(\?.*)?$/)
          ) {
            req.url = '/orders.html';
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
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
        checkout: resolve(__dirname, 'checkout.html'),
        orders: resolve(__dirname, 'orders.html'),
      },
    },
  },
})
