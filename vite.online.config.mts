// vite.online.config.mts
import { fileURLToPath } from 'node:url';
import { normalizePath, defineConfig, type Plugin } from 'vite';

const I18N = normalizePath(fileURLToPath(new URL('./src/app/i18n/index.ts', import.meta.url)));
const PAGE_I18N = normalizePath(fileURLToPath(new URL('./online-client/shims/i18n.mts', import.meta.url)));

/**
 * Shared Atlas modules (laser colours, map icons, token sizes) name their labels with upstream's
 * translations, which read Obsidian's language. The page gets a stand-in with only their English texts.
 * Nothing else is aliased, so any other import of `obsidian` still fails the page build.
 */
function pageTranslations(): Plugin {
  return {
    name: 'atlas-page-translations',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && normalizePath(resolved.id) === I18N ? PAGE_I18N : null;
    },
  };
}

/** The web page players open to join an online session. */
export default defineConfig({
  root: 'online-client',
  base: './',
  plugins: [pageTranslations()],
  build: {
    outDir: '../dist-online',
    emptyOutDir: true,
    // The 3D dice chunk (three.js and Atlas's dice, about 660 kB) loads only with the player's first
    // thrown roll (`OwnRollThrows`), never with the page; the page's own script stays near 220 kB.
    chunkSizeWarningLimit: 700,
  },
});
