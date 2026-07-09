import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Sayable is a static, client-only SPA — no backend, no server-side anything.
// The service worker precaches the whole app shell so it runs fully offline
// and can be installed to a home screen.
//
// SAYABLE_BASE lets the same build target a sub-path deploy — e.g. the
// sayable.systems landing site hosts the app at /app/ via
// `SAYABLE_BASE=/app/ npm run build`. Defaults to a root deploy.
const base = process.env.SAYABLE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sayable',
        short_name: 'Sayable',
        description: 'A simple, fast communication board.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5180 },
  preview: { port: 4180 },
});
