import type { DataAdapter } from 'obsidian';
import type { Asset } from './AssetService';
import { withoutJsonExtensions, withoutSceneExtensions } from './collectionBundle/bundleExtensionData';
import { assetFilePath } from './vault-sync/assetFiles';

/**
 * The text of a scene's record file. Extension data lives in the asset index only: a record file that held it
 * would change with every local save of it, and so make an installed scene look edited to the update check.
 */
export function sceneMirrorText(asset: Asset): string {
  const kept = asset.type === 'scene' ? withoutSceneExtensions(asset) : asset;
  return mirrorText((kept as { data?: unknown }).data);
}

/** The one format Atlas writes record files in: two-space indent, no trailing newline. */
export function mirrorText(data: unknown): string {
  return JSON.stringify(data, null, 2) || '{}';
}

/**
 * Takes extension data (and a leftover `data.sharing`) out of the record files of scenes the index holds it for;
 * files written before the index became its only home may still carry it. A file that cannot be read or written
 * is logged and left, and tried again at the next start.
 */
export async function stripSceneMirrors(adapter: DataAdapter, assets: readonly Asset[]): Promise<void> {
  for (const asset of assets) {
    if (asset.type !== 'scene' || !asset.data?.extensions) continue;
    const path = assetFilePath(asset);
    try {
      if (!path || !(await adapter.exists(path))) continue;
      const text = await adapter.read(path);
      const parsed: unknown = JSON.parse(text);
      const stripped = withoutJsonExtensions(parsed);
      if (stripped !== parsed) await adapter.write(path, mirrorText(stripped));
    } catch (error) {
      console.error('[AssetService] Could not take extension data out of a scene record file:', path, error);
    }
  }
}
