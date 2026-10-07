import type { Asset, AssetMetadata } from './AssetService';

/** What a scene list shows of each record: a change to any of it is a change to the list. */
function signatureOf(assets: Readonly<Record<string, Asset>>): string {
  const scenes: string[][] = [];
  for (const asset of Object.values(assets)) {
    if (asset.type === 'scene') scenes.push([asset.id, asset.name, asset.collection, asset.data?.mapPath ?? '']);
  }
  return JSON.stringify(scenes.sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0)));
}

/**
 * Tells listeners when what `signature` reads of the index changed. Whoever changes the index calls `check` once it
 * has; the index has no single place that adds or removes records (imports, transfers and the vault check change it
 * as well). The first check only takes note.
 */
export class IndexChangeWatcher<T> {
  private readonly listeners = new Set<() => void>();
  private last: string | null = null;

  constructor(private readonly signature: (value: T) => string, private readonly what: string) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  check(value: T): void {
    const next = this.signature(value);
    const first = this.last === null;
    if (next === this.last) return;
    this.last = next;
    if (first) return;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[AssetService] A ${this.what} change listener failed:`, error);
      }
    }
  }
}

/** Scene records of the index added, removed or changed in id, name, collection or map. */
export class SceneChangeWatcher extends IndexChangeWatcher<Readonly<Record<string, Asset>>> {
  constructor() {
    super(signatureOf, 'scene');
  }
}

/** What the collection list shows of the index: the collections by id and name, and their index-only data. */
function collectionSignature(metadata: Pick<AssetMetadata, 'collections' | 'collectionIndexData'>): string {
  const ids = Object.values(metadata.collections).map((collection) => [collection.id, collection.name]).sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0));
  return JSON.stringify([ids, metadata.collectionIndexData ?? {}]);
}

/** Collections added, removed or renamed, or the data extensions keep on one changed. */
export class CollectionChangeWatcher extends IndexChangeWatcher<Pick<AssetMetadata, 'collections' | 'collectionIndexData'>> {
  constructor() {
    super(collectionSignature, 'collection');
  }
}
