/**
 * What extensions keep on scene records (`data.extensions`) belongs to this vault: it never travels in a
 * bundle, a copy or a fingerprint, so an exported scene carries none and an installed one starts without.
 * A `data.sharing` that an older Atlas left on a record is dropped the same way, and so is `data.createdBy`, the
 * extension that added the scene: a copy or an installed scene is the GM's, never an extension's to replace. Registered note properties
 * (`bundleNoteKeys`) are stripped from exported and installed notes likewise.
 */
import type { Asset } from '../AssetService';
import type { BundleFile } from './bundleFormat';
import { withoutFrontmatterKeys } from './frontmatterKeys';

const EXTENSION_KEYS: readonly string[] = ['extensions', 'sharing', 'createdBy'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExtensionData = (data: Record<string, unknown>): boolean => EXTENSION_KEYS.some((key) => key in data);

const withoutExtensionKeys = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !EXTENSION_KEYS.includes(key))) as T;

/** `asset` without its extension data; the same object when it has none. */
export function withoutSceneExtensions(asset: Asset): Asset {
  return asset.type === 'scene' && asset.data !== undefined && hasExtensionData(asset.data as Record<string, unknown>)
    ? { ...asset, data: withoutExtensionKeys(asset.data) }
    : asset;
}

/** A parsed record file (a scene's JSON mirror, whose keys sit at the root, or a whole scene record) without its extension data. */
export function withoutJsonExtensions(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if (typeof parsed.mapPath === 'string' && hasExtensionData(parsed)) return withoutExtensionKeys(parsed);
  if (parsed.type === 'scene' && isRecord(parsed.data) && hasExtensionData(parsed.data)) return { ...parsed, data: withoutExtensionKeys(parsed.data) };
  return parsed;
}

/** Whether the bundled file is a Markdown note: a linked note, a statblock note or a loot item, whatever its role. */
export const isNote = (file: Pick<BundleFile, 'vaultPath'>): boolean => /\.md$/i.test(file.vaultPath);

/** A note's text without the frontmatter properties in `keys`; any other file's text as it is. */
export function withoutNoteKeys(file: Pick<BundleFile, 'vaultPath'>, text: string, keys: ReadonlySet<string>): string {
  return isNote(file) ? withoutFrontmatterKeys(text, keys) : text;
}
