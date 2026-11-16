import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE lets GitHub Pages serve the app from /<repo-name>/
// (Git Bash on Windows can rewrite "/x/" into a Windows path, so only accept clean "/…/" values.)
const raw = process.env.BASE_PATH ?? '/';
const base = /^\/[\w./-]*$/.test(raw) ? (raw.endsWith('/') ? raw : `${raw}/`) : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'INSTORE',
        short_name: 'INSTORE',
        description: 'Inventory on your phone: stock, scanning and activity log.',
        theme_color: '#388E3C',
        background_color: '#F6FBF6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: `${base}index.html` },
    }),
  ],
  server: { port: 5174 },
  test: { environment: 'node' },
} as any);
