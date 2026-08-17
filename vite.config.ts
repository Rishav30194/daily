import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base, start_url and scope must all agree on '/daily/'. A mismatch fails silently:
// a blank page with 404s on every asset, or an installed app that opens in a Safari
// tab instead of standalone. See DEPLOYMENT.md §5.
const BASE = '/daily/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never 'autoUpdate' — it can swap the app out mid-entry, and the app is only
      // ever open mid-entry. Registering nothing is worse: a stale app forever.
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Daily',
        short_name: 'Daily',
        description: 'A personal discipline tracker.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#fafaf9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
