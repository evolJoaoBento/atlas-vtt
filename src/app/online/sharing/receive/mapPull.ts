/**
 * Writes a pulled map into the `Shared with me` collection: its images under their
 * fingerprints in `files/<person>/` (each checked against its fingerprint by the transfer),
 * then the map file and its scene record together under `runExclusive`, so the vault check
 * never adopts the map as a second scene. A re-pull replaces the received map; if the receiver
 * changed it since, they choose Keep both (a second scene) or Take theirs.
 */
import type { App } from 'obsidian';
import { ensureFolder } from '../../../plugin/vaultFolders';
import { collectionFolderPath, collectionNameProblem } from '../../../services/assetPaths';
import type { AssetService } from '../../../services/AssetService';
import { ATLAS_VERSION } from '../../../services/MapPersistence';
import { ASSET_MIMES, extensionForMime } from '../../assets/assetIds';
import type { MapPayload } from '../model/mapPayload';
import type { CatalogueItem } from '../model/SenderCatalogue';
import type { PulledItem } from '../transport/ShareNode';
import type { PullOutcome } from './notePull';
import type { PulledItems } from './PulledItems';
import { receivedMapState } from './receivedMap';
import { freePath, isInside, safeFileName } from './safePaths';
import { fileAt, pathTaken } from './vaultFiles';

export const SHARED_COLLECTION = 'Shared with me';

export interface MapPullDeps {
  app: App;
  assets: Pick<AssetService, 'runExclusive' | 'addAsset' | 'getCollections' | 'createCollection'>;
  pulled: PulledItems;
  /** Pulls one image of the map by fingerprint (checked by the transfer). */
  pullImage(fingerprint: string): Promise<PulledItem>;
  /** The map's linked notes the receiver ticked in this pull: item id → vault path. */
  notes: ReadonlyMap<string, string>;
  /** The received map changed here since the last pull. */
  confirmUpdate(title: string): Promise<'both' | 'theirs' | null>;
  now?: () => number;
}

export interface MapPullInput {
  tableId: string;
  from: string;
  personName: string;
  item: CatalogueItem;
  payload: MapPayload;
}

async function findOrCreateCollection(assets: MapPullDeps['assets']): Promise<string> {
  const known = (await assets.getCollections()).find((collection) => collection.id === SHARED_COLLECTION || collection.name === SHARED_COLLECTION);
  if (known) return known.id;
  const problem = collectionNameProblem(SHARED_COLLECTION);
  if (problem) throw new Error(problem);
  return (await assets.createCollection(SHARED_COLLECTION)).id;
}

let creatingCollection: Promise<string> | null = null;

/** The collection's id; two pulls at once share one creation. */
function sharedCollectionId(assets: MapPullDeps['assets']): Promise<string> {
  creatingCollection ??= findOrCreateCollection(assets).finally(() => { creatingCollection = null; });
  return creatingCollection;
}

/** Notes of the map the receiver pulled in earlier pulls, whose files are still there; this pull's ticked notes win. */
function linkedNotes(deps: MapPullDeps, input: MapPullInput): Map<string, string> {
  const notes = new Map<string, string>();
  for (const id of input.payload.notes) {
    const record = deps.pulled.get(input.tableId, input.from, id);
    if (record && record.kind === 'note' && fileAt(deps.app, record.path)) notes.set(id, record.path);
  }
  for (const [id, path] of deps.notes) notes.set(id, path);
  return notes;
}

async function writeImages(deps: MapPullDeps, folder: string, fingerprints: readonly string[]): Promise<Map<string, string>> {
  const { app } = deps;
  const images = new Map<string, string>();
  for (const fingerprint of fingerprints) {
    const existing = ASSET_MIMES.map((mime) => `${folder}/${fingerprint}.${extensionForMime(mime)}`).find((path) => fileAt(app, path));
    if (existing) {
      images.set(fingerprint, existing);
      continue;
    }
    // An image that cannot be pulled is skipped like one with the wrong bytes: the map still arrives, without it.
    const image = await deps.pullImage(fingerprint).catch(() => null);
    if (!image) continue;
    // The transfer checked the bytes against the fingerprint asked for; it is checked here again, since this is what names the file.
    if (!image.mime || image.version !== fingerprint) continue;
    const path = `${folder}/${fingerprint}.${extensionForMime(image.mime)}`;
    if (!isInside(path, folder)) continue;
    await ensureFolder(app, folder);
    // A pull running at the same time may have written the same image first: the file is then the one wanted.
    await app.vault.createBinary(path, image.bytes).catch((error: unknown) => {
      if (!fileAt(app, path)) throw error;
    });
    images.set(fingerprint, path);
  }
  return images;
}

export async function pullMap(deps: MapPullDeps, input: MapPullInput): Promise<PullOutcome> {
  const { app, assets, pulled } = deps;
  await pulled.ready();
  const collection = await sharedCollectionId(assets);
  const person = safeFileName(input.personName, 'Someone');
  const root = collectionFolderPath(collection);
  const images = await writeImages(deps, `${root}/files/${person}`, input.payload.images);
  const state = receivedMapState(input.payload, { images, notes: linkedNotes(deps, input), isFile: (path) => path.length < 1024 && fileAt(app, path) !== null });
  const text = JSON.stringify({ state, version: ATLAS_VERSION }, null, 2);
  const known = pulled.get(input.tableId, input.from, input.item.item);
  const knownFile = known ? fileAt(app, known.path) : null;
  const now = deps.now ?? Date.now;
  if (known && knownFile) {
    const base = await pulled.readBase(known);
    const changedHere = base !== null && (await app.vault.read(knownFile)) !== base;
    const choice = changedHere ? await deps.confirmUpdate(input.item.title) : 'theirs';
    if (choice === null) return { kind: 'cancelled' };
    if (choice === 'theirs') {
      await app.vault.process(knownFile, () => text);
      const record = pulled.update(known.key, { version: input.item.version, pulledAt: now() }) ?? known;
      await pulled.writeBase(record, text);
      return { kind: 'updated', path: known.path };
    }
  }
  const sceneFolder = `${root}/scenes/${person}`;
  // The name is chosen inside the lock, so two pulls at once never pick the same one. Keep both makes a second
  // scene that later pulls do not follow; only the first is recorded, in the lock too, so its path is held at once.
  const written = await assets.runExclusive(async () => {
    const path = freePath(sceneFolder, safeFileName(input.payload.name), 'atlasmap', (candidate) => pathTaken(app, pulled, candidate));
    if (!isInside(path, sceneFolder)) throw new Error('A shared map would land outside its folder');
    await ensureFolder(app, sceneFolder);
    await app.vault.create(path, text);
    try {
      const scene = await assets.addAsset({ type: 'scene', name: input.payload.name, collection, tags: [], data: { mapPath: path } });
      if (known && knownFile) return { path, record: null };
      const record = pulled.put({
        tableId: input.tableId, from: input.from, item: input.item.item, kind: 'map', path, version: input.item.version, pulledAt: now(), sceneId: scene.id,
        ...(known ? { baseKey: known.baseKey } : {}),
      });
      return { path, record };
    } catch (error) {
      // No record without a file and no file without a record: the vault check would adopt it as a second scene.
      const orphan = fileAt(app, path);
      // A failing cleanup must not hide the error that made it necessary.
      if (orphan) await app.fileManager.trashFile(orphan).catch((trashError: unknown) => console.error('Atlas: could not remove a shared map that was not added', trashError));
      throw error;
    }
  });
  if (!written.record) return { kind: 'both', path: written.path };
  await pulled.writeBase(written.record, text);
  return { kind: 'created', path: written.path };
}
