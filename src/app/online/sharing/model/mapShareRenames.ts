/**
 * A map share's ticked notes are vault paths, so they follow the vault: a renamed or moved note stays
 * ticked under its new path, and a deleted one is unticked (a new file at the old path is never shared by accident).
 */
import type { AssetService } from '../../../services/AssetService';
import { pathWithin } from '../pathRenames';
import { mapShareOf, writeMapShare } from './mapShare';

export type VaultChange = { rename: readonly [string, string] } | { removed: string };

function moved(paths: readonly string[], change: VaultChange): string[] {
  if ('removed' in change) return paths.filter((path) => !pathWithin(path, change.removed));
  const [from, to] = change.rename;
  return paths.map((path) => (pathWithin(path, from) ? to + path.slice(from.length) : path));
}

/** Brings the ticked notes of every shared map in step with `change`. */
export async function followVaultChange(assets: Pick<AssetService, 'getAssets' | 'updateAsset'>, change: VaultChange): Promise<void> {
  for (const scene of await assets.getAssets(undefined, 'scene')) {
    const share = mapShareOf(scene);
    if (!share) continue;
    const notes = moved(share.notes, change);
    if (notes.length === share.notes.length && notes.every((path, at) => path === share.notes[at])) continue;
    await writeMapShare(assets, scene, { ...share, notes });
  }
}
