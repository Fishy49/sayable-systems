import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Sayable is a static, client-only SPA — no backend, no server-side anything.
export default defineConfig({
  plugins: [svelte()],
  server: { port: 5180 },
});
