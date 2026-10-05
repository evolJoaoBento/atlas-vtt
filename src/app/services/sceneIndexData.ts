/**
 * What a scene record keeps in the asset index alone, never in its library record file, a bundle, a copy or a
 * fingerprint: the data extensions keep on it (`data.extensions`), the extension that added it (`data.createdBy`)
 * and the images Atlas wrote for that extension (`data.createdImages`), plus a `data.sharing` an older Atlas left.
 * `createdBy` and `createdImages` are permissions (`scenes.replaceMap` acts on them), so they are only ever taken
 * from this device's index, never from a file someone may have copied, edited or forged.
 */
import type { Asset, SceneAssetData } from './AssetService';

export const SCENE_INDEX_KEYS = ['extensions', 'sharing', 'createdBy', 'createdImages'] as const;

/** The index-only keys a scene keeps across a file read: all but the legacy `sharing`, which moves into `extensions` on load. */
export type SceneIndexData = Pick<SceneAssetData, 'extensions' | 'createdBy' | 'createdImages'>;

const KEPT_KEYS: readonly string[] = ['extensions', 'createdBy', 'createdImages'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const hasIndexData = (data: Record<string, unknown>): boolean => SCENE_INDEX_KEYS.some((key) => key in data);

const withoutIndexKeys = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !(SCENE_INDEX_KEYS as readonly string[]).includes(key))) as T;

/** `asset` without its index-only data; the same object when it has none. */
export function withoutSceneExtensions(asset: Asset): Asset {
  return asset.type === 'scene' && asset.data !== undefined && hasIndexData(asset.data as Record<string, unknown>)
    ? { ...asset, data: withoutIndexKeys(asset.data) }
    : asset;
}

/** The index-only data `asset` holds (a scene's), or null when it holds none. */
export function sceneIndexDataOf(asset: Asset | undefined): SceneIndexData | null {
  if (asset?.type !== 'scene' || !asset.data) return null;
  const own = Object.fromEntries(Object.entries(asset.data).filter(([key]) => KEPT_KEYS.includes(key))) as SceneIndexData;
  return Object.keys(own).length > 0 ? own : null;
}

/**
 * A scene record taken in from its library file, with the index-only data `kept` (what the index held for that id):
 * a file another device or a sync tool changed brings the scene's own content and never takes away, or hands out,
 * what extensions keep.
 */
export function withIndexOnlySceneData(fromFile: Asset, kept: SceneIndexData | null): Asset {
  const plain = withoutSceneExtensions(fromFile);
  if (plain.type !== 'scene' || !kept) return plain;
  return { ...plain, data: { ...plain.data, ...kept } };
}

/** A parsed record file (a scene's JSON mirror, whose keys sit at the root, or a whole scene record) without its index-only data. */
export function withoutJsonExtensions(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if (typeof parsed.mapPath === 'string' && hasIndexData(parsed)) return withoutIndexKeys(parsed);
  if (parsed.type === 'scene' && isRecord(parsed.data) && hasIndexData(parsed.data)) return { ...parsed, data: withoutIndexKeys(parsed.data) };
  return parsed;
}
