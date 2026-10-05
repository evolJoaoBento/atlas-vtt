import { normalizePath, TFile, type App } from 'obsidian';
import type { AssetService } from '../app/services/AssetService';
import { trashVaultItem } from '../app/utils/trashVaultItem';
import { savedMapText } from './savedMap';
import { isPlainRelative } from './savedMapFields';
import { isInside, sceneFieldsOf, withImagePaths } from './sceneImport';
import type { SavedMapInput } from './types/scenes';
import type { ViewTracker } from './viewTracker';

/** What `ScenesApi.replaceMap` takes beside the scene id. */
interface ReplaceInput { map: SavedMapInput; images: ReadonlyArray<{ path: string; data: ArrayBuffer }> }

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;

function fail(message: string): never {
  throw new Error(`[Atlas API] replaceMap: ${message}`);
}

/** Whether any open map view has `mapPath` loaded or among its scene tabs. */
function isOpenInAView(views: ViewTracker | null, mapPath: string): boolean {
  return (views?.views() ?? []).some((view) => view.atlasStore.getState().mapPath === mapPath
    || view.tabMetaStore.getState().tabs.some((tab) => tab.filePath === mapPath));
}

/** `path`, or `stem (2).ext`, `stem (3).ext`, … while a file is there or this call already chose the name. */
function freeFilePath(app: App, path: string, chosen: ReadonlySet<string>): string {
  const dot = path.lastIndexOf('.');
  const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
  let candidate = path;
  for (let n = 2; chosen.has(candidate.toLowerCase()) || app.vault.getAbstractFileByPath(candidate); n++) candidate = `${stem} (${n})${ext}`;
  return candidate;
}

/** Every string inside `value`, however deeply nested. */
function stringsIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringsIn(item, into);
  return into;
}

/** Whether anything besides the scene `sceneId` uses `path`: another asset record, another scene's map, or a note linking it. */
async function usedElsewhere(app: App, assets: AssetService, sceneId: string, path: string): Promise<boolean> {
  const others = (await assets.getAssets()).filter((asset) => asset.id !== sceneId);
  if (others.some((asset) => JSON.stringify(asset).includes(JSON.stringify(path)))) return true;
  for (const asset of others) {
    const otherMap = asset.type === 'scene' ? asset.data?.mapPath : undefined;
    const file = otherMap ? app.vault.getAbstractFileByPath(otherMap) : null;
    if (file instanceof TFile && (await app.vault.read(file)).includes(JSON.stringify(path))) return true;
  }
  const links = (app.metadataCache as { resolvedLinks?: Record<string, Record<string, number>> } | undefined)?.resolvedLinks ?? {};
  return Object.values(links).some((targets) => Object.hasOwn(targets, path));
}

/** Trashes the images the old map named in its folder that the new map does not and nothing else uses; a failure is logged. */
async function removeOldImages(app: App, assets: AssetService, sceneId: string, folder: string, oldText: string, newText: string): Promise<void> {
  let old: unknown;
  try {
    old = JSON.parse(oldText);
  } catch {
    return;
  }
  for (const path of stringsIn(old)) {
    if (!IMAGE_FILE.test(path) || !isInside(path, folder) || newText.includes(JSON.stringify(path))) continue;
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;
    try {
      if (!(await usedElsewhere(app, assets, sceneId, path))) await trashVaultItem(app, file);
    } catch (error) {
      console.error('[Atlas API] replaceMap could not remove an old image:', path, error);
    }
  }
}

/**
 * Replaces the map of the scene `sceneId`, which extension `owner` added with `addToCollection`, under the asset index
 * lock: the new images go beside the map file (a name already taken gets a number), then the map file is rewritten,
 * then old images nothing uses any more are removed. The scene keeps its id, name, collection and map path. Refused
 * (throws, writing nothing) for another scene, one open in a map view, or malformed input; a failed write removes the
 * images this call wrote and puts the old map back.
 */
export function replaceSceneMap(
  app: App, assets: AssetService, views: ViewTracker | null, owner: string, sceneId: string, input: ReplaceInput,
): Promise<{ sceneId: string; mapPath: string }> {
  return assets.runExclusive(async () => {
    const scene = typeof sceneId === 'string' ? await assets.getAssetById(sceneId) : null;
    if (scene?.type !== 'scene') fail(`there is no scene with the id "${String(sceneId)}".`);
    if (scene.data?.createdBy !== owner) fail('only a scene this extension added with addToCollection can be replaced.');
    const mapPath = scene.data.mapPath;
    const file = mapPath ? app.vault.getAbstractFileByPath(mapPath) : null;
    if (!mapPath || !(file instanceof TFile)) fail('the scene has no map file.');
    if (isOpenInAView(views, mapPath)) fail('the scene is open in a map view; close its tab first.');
    if (!input || !input.map || !Array.isArray(input.images)) fail('it needs { map, images }.');
    const fields = sceneFieldsOf(input.map);
    const folder = mapPath.slice(0, mapPath.lastIndexOf('/'));
    const chosen = new Set<string>();
    const targets = new Map<string, { target: string; data: ArrayBuffer }>();
    for (const image of input.images as ReplaceInput['images']) {
      const path: unknown = image?.path;
      if (!isPlainRelative(path) || !isInside(`${folder}/${path}`, folder) || targets.has(path)) fail(`the image path "${String(path)}" must stay inside the folder, once.`);
      const target = freeFilePath(app, normalizePath(`${folder}/${path}`), chosen);
      chosen.add(target.toLowerCase());
      targets.set(path, { target, data: image.data });
    }
    const oldText = await app.vault.read(file);
    const imagePaths = new Map([...targets].map(([path, { target }]) => [path, target]));
    const newText = savedMapText(withImagePaths(input.map, imagePaths), mapPath, scene.name, fields);
    const written: string[] = [];
    try {
      for (const { target, data } of targets.values()) {
        written.push(target);
        await app.vault.createBinary(target, data);
      }
      await app.vault.process(file, () => newText);
    } catch (error) {
      try {
        if ((await app.vault.read(file)) !== oldText) await app.vault.process(file, () => oldText);
        for (const path of written.reverse()) {
          const image = app.vault.getAbstractFileByPath(path);
          if (image) await trashVaultItem(app, image);
        }
      } catch (cleanup) {
        console.error('[Atlas API] Could not undo a failed replaceMap:', cleanup);
      }
      throw error;
    }
    await removeOldImages(app, assets, sceneId, folder, oldText, newText);
    return { sceneId, mapPath };
  });
}
