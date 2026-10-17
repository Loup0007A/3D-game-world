import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base relative : marche sur GitHub Pages quel que soit le nom du repo.
// `npm run build:single` produit un seul fichier HTML jouable hors ligne.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // Deux pages : le jeu (index.html) et l'Arène du Dragon (arena.html).
    rollupOptions: mode === 'single' ? undefined : { input: { main: 'index.html', arena: 'arena.html' } },
  },
  server: { host: true },
}));
