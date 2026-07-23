import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Set by the Pages workflow to "/<repo>/"; defaults to root for local + release.
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: {
      '@fh6/shared': r('../../packages/shared/src/index.ts'),
      '@fh6/data': r('../../packages/data/src/index.ts'),
      '@fh6/engine': r('../../packages/engine/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // Allow importing TS sources from sibling workspace packages.
    fs: { allow: [r('../../')] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // The authoritative offline game database is intentionally bundled so the
        // installed tuner keeps all cars and engine menus without a network call.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'FH6 Tuning Assistant',
        short_name: 'FH6 Tune',
        description: 'Build optimizer and tuning assistant for Forza Horizon 6.',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
