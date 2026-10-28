import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API in development so session cookies and CSRF behave as in production.
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: cached across deploys and shared by the lazily loaded pages.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]react-router[\\/]/.test(id)) return 'router';
          // The lesson editor's dependencies (only loaded while editing).
          if (/[\\/]node_modules[\\/]prosemirror-/.test(id)) return 'prosemirror';
          if (/[\\/]node_modules[\\/](markdown-it|linkifyjs|tiptap-markdown|prosemirror-markdown)[\\/]/.test(id)) return 'markdown-it';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query';
          return undefined;
        },
      },
    },
  },
});
