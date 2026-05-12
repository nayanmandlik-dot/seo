import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE_PATH lets the same build target both Vercel (served at "/") and
// GitHub Pages (served at "/<repo-name>/"). Vercel leaves it unset; the
// GitHub Pages workflow sets it to "/seo/".
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
