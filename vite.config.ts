import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Don't auto-inject the registration <script> into index.html — the
      // native (Capacitor) build must NEVER register this service worker
      // (see main.tsx). It's only meant for the browser/PWA install path,
      // and on native it was serving a stale cached bundle after
      // `npm run ios:sync` + a fresh Xcode rebuild (INSTALL-iOS.md's
      // documented troubleshooting entry for exactly this). main.tsx does
      // its own conditional registration instead.
      injectRegister: false,
      manifest: {
        name: 'leve',
        short_name: 'leve',
        description: 'Personal nutrition + weight-management goal tracker',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
