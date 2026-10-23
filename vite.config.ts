import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          id: '/',
          name: 'StudyPilot - AI Study & Career Copilot',
          short_name: 'StudyPilot',
          description: 'AI Study & Career Copilot with RAG document citations, SM-2 flashcards, mind maps, and career gap analysis.',
          theme_color: '#090d16',
          background_color: '#090d16',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        // The service worker only runs in production builds. In dev it auto-updates and
        // force-reloads the page whenever it is regenerated (this caused random reloads).
        devOptions: {
          enabled: false,
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Never watch the backend: its SQLite DB, vector store and uploads change on every
      // upload / summary / chat message and used to trigger full page reloads.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/backend/**',
                '**/dev-dist/**',
                '**/data/**',
                '**/*.db',
                '**/*.db-*',
                '**/.venv/**',
                '**/__pycache__/**',
              ],
            },
    },
  };
});
