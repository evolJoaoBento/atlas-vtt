/**
 * A map's share, kept on its scene record (`SceneAsset.data.sharing`, mirrored into the scene's
 * JSON), so it moves with the scene and the map file stays as it is. People by key, so renames
 * keep it; `notes` are the linked notes the sender ticked.
 */
import type { AssetService, SceneAsset, SceneAssetData } from '../../../services/AssetService';
import type { PeopleBook } from '../people/PeopleBook';
import { personKey } from '../people/peopleTypes';
import { isPerson, type Recipient } from './audience';

export type MapShareMode = 'player-safe' | 'full';

export interface MapShare {
  /** The map's random item id. */
  item: string;
  everyone: boolean;
  people: string[];
  except: string[];
  mode: MapShareMode;
  /** Vault paths of the ticked linked notes. */
  notes: string[];
}

const keys = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 500 && value.every((key) => typeof key === 'string' && key.length <= 300);

export function parseMapShare(value: unknown): MapShare | null {
  if (typeof value !== 'object' || value === null) return null;
  const share = value as Record<string, unknown>;
  if (typeof share.item !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(share.item)) return null;
  if (typeof share.everyone !== 'boolean' || (share.mode !== 'player-safe' && share.mode !== 'full')) return null;
  if (!keys(share.people) || !keys(share.except) || !keys(share.notes)) return null;
  return { item: share.item, everyone: share.everyone, people: [...share.people], except: [...share.except], mode: share.mode, notes: [...share.notes] };
}

export function mapShareOf(scene: SceneAsset): MapShare | null {
  return parseMapShare(scene.data?.sharing);
}

function keyReaches(key: string, recipient: Recipient, people: Pick<PeopleBook, 'byKey'>): boolean {
  const person = people.byKey(key);
  return person ? isPerson(person, recipient) : key === personKey(recipient.tableId, recipient.personId);
}

/**
 * Who a map share reaches. An `except` naming a placeholder that is not linked yet (`unlinkedKey`) reaches nobody, like a
 * name nobody can resolve: whoever turns up as "Dave (2)" must not get what was kept back from Dave.
 */
export function mapShareReaches(share: MapShare, recipient: Recipient, people: Pick<PeopleBook, 'byKey'> & Partial<Pick<PeopleBook, 'unlinkedKey'>>): boolean {
  if (share.except.some((key) => people.unlinkedKey?.(key))) return false;
  if (share.except.some((key) => keyReaches(key, recipient, people))) return false;
  return share.everyone || share.people.some((key) => keyReaches(key, recipient, people));
}

export function withoutSharing(data: SceneAssetData | undefined): SceneAssetData {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => key !== 'sharing'));
}

/** Writes or clears the share on the scene record; its JSON follows (`updateAsset`). */
export async function writeMapShare(assets: Pick<AssetService, 'updateAsset'>, scene: SceneAsset, share: MapShare | null): Promise<void> {
  const data = withoutSharing(scene.data);
  await assets.updateAsset(scene.id, { data: share ? { ...data, sharing: share } : data });
}
