// vite.online.config.mts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** The web page players open to join an online session. */
export default defineConfig({
  root: 'online-client',
  base: './',
  resolve: {
    // Shared Atlas modules (laser colours, map icons, token sizes) reach upstream's translations,
    // which read Obsidian's language. The page speaks English, so the other languages stay out.
    alias: [
      { find: /^obsidian$/, replacement: fileURLToPath(new URL('./online-client/shims/obsidian.mts', import.meta.url)) },
      { find: /^\.\/locales\/ru$/, replacement: fileURLToPath(new URL('./online-client/shims/noTranslation.mts', import.meta.url)) },
    ],
  },
  build: {
    outDir: '../dist-online',
    emptyOutDir: true,
    // The 3D dice chunk (three.js and Atlas's dice, about 660 kB) loads only with the player's first
    // thrown roll (`OwnRollThrows`), never with the page; the page's own script stays near 320 kB (Atlas's English texts are about 90 of it).
    chunkSizeWarningLimit: 700,
  },
});
