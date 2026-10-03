/** The catalogue's view of this vault: notes with `atlas-share`, shared scenes, map files and images. */
import { TFile, type App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { collectionGridDefaultsFor, mapConeAngle } from '../../../services/mapMeasurementSettings';
import { mapInitiativeRules } from '../../../services/mapInitiativeRules';
import type { SettingsService } from '../../../services/SettingsService';
import { vaultImageFiles } from '../../assets/vaultImageFiles';
import { pickPlayerViewRules } from '../../scene/playerViewRules';
import { readSharedMap } from './buildMapPayload';
import type { NoteSource } from './catalogueAccess';
import { mapShareOf } from './mapShare';
import type { CatalogueSources } from './SenderCatalogue';
import { parseShareRule, SHARE_PROPERTY } from './shareRule';

export function obsidianCatalogueSources(app: App, settings: SettingsService): CatalogueSources {
  const noteOf = (file: TFile): NoteSource => ({
    path: file.path, title: file.basename, rule: parseShareRule(app.metadataCache.getFileCache(file)?.frontmatter?.[SHARE_PROPERTY]),
  });
  return {
    notes: () => app.vault.getMarkdownFiles()
      .filter((file) => app.metadataCache.getFileCache(file)?.frontmatter?.[SHARE_PROPERTY] !== undefined)
      .map(noteOf),
    note: (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile && file.extension === 'md' ? noteOf(file) : null;
    },
    read: async (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? app.vault.cachedRead(file) : app.vault.adapter.read(path);
    },
    maps: async () => (await AssetService.getInstance(app).getAssets(undefined, 'scene')).flatMap((scene) => {
      const share = mapShareOf(scene);
      const mapPath = scene.data?.mapPath;
      return share && mapPath ? [{ name: scene.name, mapPath, share }] : [];
    }),
    readMap: (mapPath) => readSharedMap((path) => app.vault.adapter.read(path), mapPath),
    images: vaultImageFiles(app),
    isFile: (path) => path.length < 1024 && app.vault.getAbstractFileByPath(path) instanceof TFile,
    resolveLink: (linkpath, from) => {
      const file = app.metadataCache.getFirstLinkpathDest(linkpath, from);
      return file && file.extension === 'md' ? file.path : null;
    },
    shareable: () => settings.getOnlineSettings().shareableProperties,
    rules: () => pickPlayerViewRules(settings.getLocalPlayerViewSettings()),
    collectionGrid: (mapPath) => collectionGridDefaultsFor(AssetService.getInstance(app), mapPath),
    coneAngle: (mapPath) => mapConeAngle(AssetService.getInstance(app), mapPath),
    initiativeRules: (mapPath) => mapInitiativeRules(app, mapPath),
  };
}
