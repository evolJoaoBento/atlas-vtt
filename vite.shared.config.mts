import { defineConfig } from 'vite';

/** `@atlas-vtt/shared`: plain ES modules for extensions to vendor (docs/extension-api.md). Copies nothing anywhere. */
export default defineConfig({
  build: {
    outDir: 'dist-packages/shared',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: { grid: 'src/shared/grid.ts', draw: 'src/shared/draw.ts', rules: 'src/shared/rules.ts', dice3d: 'src/shared/dice3d.ts' },
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rollupOptions: { external: ['three', /^three\//], output: { chunkFileNames: '[name]-[hash].js' } },
  },
});
