import type { Json } from '../types/json';
import type { Asset } from './AssetService';

/**
 * Vaults from a fork of Atlas can hold a map share on the scene record as `data.sharing`; Atlas itself never wrote
 * one. It moves to `data.extensions[LEGACY_SHARING_EXTENSION_ID]` once, the id of the extension that now reads those
 * shares, so they are kept as extension data: never exported, copied or synced. A record without `sharing` is untouched.
 */
export const LEGACY_SHARING_EXTENSION_ID = 'atlas-vtt-connect';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `asset` with a legacy `data.sharing` moved into its extension data, or null when it has none. Data an extension
 * already keeps under that id wins, and the legacy value is then dropped. Pure: `asset` is not changed.
 */
export function movedLegacySceneData(asset: Asset): Asset | null {
  if (asset.type !== 'scene' || !asset.data || !('sharing' in asset.data)) return null;
  const { sharing, ...rest } = asset.data;
  const extensions: Record<string, Json> = isRecord(rest.extensions) ? { ...rest.extensions } : {};
  if (!(LEGACY_SHARING_EXTENSION_ID in extensions) && sharing !== undefined) extensions[LEGACY_SHARING_EXTENSION_ID] = sharing as Json;
  const { extensions: _previous, ...data } = rest;
  return { ...asset, data: Object.keys(extensions).length > 0 ? { ...data, extensions } : data };
}

/**
 * `incoming` (an asset from a bundle, which never carries extension data) with the extension data of `local`, the
 * record it replaces: an update must not take away what extensions keep on the user's own scene.
 */
export function keepingExtensionData(incoming: Asset, local: Asset | undefined): Asset {
  if (incoming.type !== 'scene' || local?.type !== 'scene' || !local.data?.extensions) return incoming;
  return { ...incoming, data: { ...incoming.data, extensions: local.data.extensions } };
}
