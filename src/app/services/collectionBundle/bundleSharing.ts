/**
 * Who a map is shared with in online sessions (`data.sharing` on its scene record) belongs to
 * this vault's table: person keys, an item id and the paths of ticked notes. It never travels in
 * a bundle, so an exported scene carries no share and an imported one starts unshared. The same
 * goes for a note's `atlas-share` property (who a note is shared with is this vault's table).
 */
import type { Asset } from '../AssetService';
import { withoutShareProperty } from '../../online/sharing/model/frontmatterFilter';
import { withoutSharing } from '../../online/sharing/model/mapShare';
import type { BundleFile } from './bundleFormat';

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

/** Whether the bundled file is a Markdown note: a linked note, a statblock note or a loot item, whatever its role. */
export const isNote = (file: Pick<BundleFile, 'vaultPath'>): boolean => /\.md$/i.test(file.vaultPath);

/** A note's text without its `atlas-share` property; any other file's text as it is. Applied when a bundle is packed and when one is installed. */
export function withoutNoteSharing(file: Pick<BundleFile, 'vaultPath'>, text: string): string {
  return isNote(file) ? withoutShareProperty(text) : text;
}
