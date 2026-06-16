import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single self-contained HTML (no IndexedDB, no server) for a double-click demo.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: 'dist-preview', assetsInlineLimit: 100_000_000 },
});
