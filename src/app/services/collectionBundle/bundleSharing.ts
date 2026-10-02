/**
 * Who a map is shared with in online sessions (`data.sharing` on its scene record) belongs to
 * this vault's table: person keys, an item id and the paths of ticked notes. It never travels in
 * a bundle, so an exported scene carries no share and an imported one starts unshared.
 */
import type { Asset } from '../AssetService';
import { withoutSharing } from '../../online/sharing/model/mapShare';

/** `asset` without its map share; the same object when it has none. */
export function withoutSceneSharing(asset: Asset): Asset {
  return asset.type === 'scene' && asset.data?.sharing !== undefined ? { ...asset, data: withoutSharing(asset.data) } : asset;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A parsed record file (a scene's JSON mirror or a whole scene record) without its map share. */
export function withoutJsonSharing(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if ('sharing' in parsed && typeof parsed.mapPath === 'string') return Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'sharing'));
  if (parsed.type === 'scene' && isRecord(parsed.data) && 'sharing' in parsed.data) return { ...parsed, data: withoutSharing(parsed.data) };
  return parsed;
}
