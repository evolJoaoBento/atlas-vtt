import type { Asset } from './AssetService';

/** What a scene list shows of each record: a change to any of it is a change to the list. */
function signatureOf(assets: Readonly<Record<string, Asset>>): string {
  const scenes: string[][] = [];
  for (const asset of Object.values(assets)) {
    if (asset.type === 'scene') scenes.push([asset.id, asset.name, asset.collection, asset.data?.mapPath ?? '']);
  }
  return JSON.stringify(scenes.sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0)));
}

/**
 * Tells listeners when the scene records of the index were added, removed or changed in id, name, collection or
 * map. Whoever changes the index calls `check` once it has; the index has no single place that adds or removes
 * records (imports, transfers and the vault check change it as well).
 */
export class SceneChangeWatcher {
  private readonly listeners = new Set<() => void>();
  private last: string | null = null;

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  check(assets: Readonly<Record<string, Asset>>): void {
    const next = signatureOf(assets);
    const first = this.last === null;
    if (next === this.last) return;
    this.last = next;
    if (first) return;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[AssetService] A scene change listener failed:', error);
      }
    }
  }
}
