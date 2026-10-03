// vite.online.config.mts
import { defineConfig } from 'vite';

/** The web page players open to join an online session. */
export default defineConfig({
  root: 'online-client',
  base: './',
  build: {
    outDir: '../dist-online',
    emptyOutDir: true,
    // The 3D dice chunk (three.js and Atlas's dice, about 660 kB) loads only with the player's first
    // thrown roll (`OwnRollThrows`), never with the page; the page's own script stays near 220 kB.
    chunkSizeWarningLimit: 700,
  },
});
