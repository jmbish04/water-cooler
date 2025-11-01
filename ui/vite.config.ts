/**
 * Vite Configuration for React Frontend
 *
 * Purpose:
 * - Build React app to static files in /public
 * - Development server with HMR
 * - Optimize for production
 *
 * Output: /public directory (served by Worker assets binding)
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  root: './ui',

  build: {
    outDir: '../public',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
        },
      },
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://water-cooler.hacolby.workers.dev',
        changeOrigin: true,
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
