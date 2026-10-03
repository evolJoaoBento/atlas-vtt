import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MapPayload } from '../../../../src/app/online/sharing/model/mapPayload';
import { pullMap, SHARED_COLLECTION, type MapPullDeps } from '../../../../src/app/online/sharing/receive/mapPull';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import type { PulledItem } from '../../../../src/app/online/sharing/transport/ShareNode';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { fingerprintOf } from '../assetFixtures';
import { TABLE_ID } from './sharingFixtures';

const MAP_IMAGE = fingerprintOf('map-bytes');
const NOTE_ITEM = 'n'.repeat(22);
const OTHER_NOTE = 'o'.repeat(22);
const SCENES = `atlas-vtt/collections/${SHARED_COLLECTION}/scenes/Ana`;

const playerSafe: MapPayload = {
  format: 'atlas-share-map-v1', mode: 'player-safe', name: 'Inn',
  scene: {
    sceneId: 'shared-map', map: { asset: MAP_IMAGE, width: 700, height: 700, cellSize: 70 }, grid: null,
    tokens: {}, fog: {}, texts: {}, drawings: {}, widgets: [], initiative: null,
    measurement: { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', snapToGrid: true, rangeBands: [] },
  } as never,
  pins: [{ x: 1, y: 1, note: NOTE_ITEM }, { x: 2, y: 2, note: OTHER_NOTE }],
  tokenNotes: {}, notes: [NOTE_ITEM, OTHER_NOTE], images: [MAP_IMAGE],
};

async function setup() {
  const { app, files } = createInMemoryApp({ files: { 'Private/secret.md': 'mine', 'atlas-vtt/assets/mine.png': 'png' } });
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  // Like the real lock: one task at a time.
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = vi.fn(<T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  });
  const assets = {
    runExclusive: exclusive,
    addAsset: vi.fn(async (asset: object) => ({ ...asset, id: 'scene-1' })),
    getCollections: vi.fn(async () => [] as Array<{ id: string; name: string }>),
    createCollection: vi.fn(async (name: string) => ({ id: name, name })),
  };
  const images = vi.fn(async (fingerprint: string): Promise<PulledItem> => ({
    kind: 'image', version: fingerprint, mime: 'image/png', bytes: new TextEncoder().encode('map-bytes').buffer,
  }));
  const deps = (notes: Record<string, string>): MapPullDeps => ({
    app, assets: assets as never, pulled, pullImage: images, notes: new Map(Object.entries(notes)), confirmUpdate: async () => 'theirs',
  });
  return { app, files, pulled, assets, exclusive, images, deps };
}

const input = (payload: MapPayload) => ({
  tableId: TABLE_ID, from: 'ana', personName: 'Ana',
  item: { item: 'm'.repeat(22), kind: 'map' as const, title: 'Inn', version: 'V'.repeat(43), size: 1 }, payload,
});

const pinPaths = (text: string): unknown[] =>
  Object.values(JSON.parse(text).state.objects.pins).map((pin) => (pin as { notePath: string }).notePath);

describe('pulling a map', () => {
  it('writes its images by fingerprint and the map with its scene record in the Shared with me collection', async () => {
    const { files, assets, exclusive, deps } = await setup();
    const outcome = await pullMap(deps({ [NOTE_ITEM]: 'Shared/Ana/Inn.md' }), input(playerSafe));
    const mapPath = `${SCENES}/Inn.atlasmap`;
    expect(outcome).toEqual({ kind: 'created', path: mapPath });
    expect(assets.createCollection).toHaveBeenCalledWith(SHARED_COLLECTION);
    expect(files.get(`atlas-vtt/collections/${SHARED_COLLECTION}/files/Ana/${MAP_IMAGE}.png`)).toBe('map-bytes');
    expect(exclusive).toHaveBeenCalledTimes(1);
    expect(assets.addAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene', name: 'Inn', collection: SHARED_COLLECTION, data: { mapPath } }));
    const state = JSON.parse(files.get(mapPath)!).state;
    expect(state.background).toBe(`atlas-vtt/collections/${SHARED_COLLECTION}/files/Ana/${MAP_IMAGE}.png`);
    expect(pinPaths(files.get(mapPath)!)).toEqual(['Shared/Ana/Inn.md']);
  });

  it('linked notes only when ticked: a pin whose note was not pulled is dropped', async () => {
    const { files, deps } = await setup();
    await pullMap(deps({}), input(playerSafe));
    expect(JSON.parse(files.get(`${SCENES}/Inn.atlasmap`)!).state.objects.pins).toEqual({});
  });

  it('a re-pull seeds the linked notes from the ones pulled before, so their pins stay', async () => {
    const { files, pulled, deps } = await setup();
    files.set('Shared/Ana/Inn.md', 'note');
    files.set('Shared/Ana/Gone.md', 'note');
    pulled.put({ tableId: TABLE_ID, from: 'ana', item: NOTE_ITEM, kind: 'note', path: 'Shared/Ana/Inn.md', version: 'v', pulledAt: 1 });
    // This note was pulled once, but its file was deleted since: its pin goes.
    pulled.put({ tableId: TABLE_ID, from: 'ana', item: OTHER_NOTE, kind: 'note', path: 'Shared/Ana/Missing.md', version: 'v', pulledAt: 1 });
    await pullMap(deps({}), input(playerSafe));
    expect(pinPaths(files.get(`${SCENES}/Inn.atlasmap`)!)).toEqual(['Shared/Ana/Inn.md']);
  });

  it('clears paths it did not write from a full map', async () => {
    const { files, deps } = await setup();
    const full: MapPayload = {
      format: 'atlas-share-map-v1', mode: 'full', name: 'Inn',
      map: {
        background: `atlas-share-image:${MAP_IMAGE}`,
        objects: {
          tokens: { t: { id: 't', kind: 'character', x: 0, y: 0, imagePath: 'atlas-vtt/assets/mine.png', notePath: 'Private/secret.md', name: 'Private/secret.md' } },
          pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: `atlas-share-note:${NOTE_ITEM}` }, q: { id: 'q', kind: 'pin', x: 0, y: 0, notePath: 'Private/secret.md' } },
        },
        dmNotePath: 'Private/secret.md',
      },
      notes: [NOTE_ITEM], images: [MAP_IMAGE],
    };
    await pullMap(deps({ [NOTE_ITEM]: 'Shared/Ana/Inn.md' }), input(full));
    const text = files.get(`${SCENES}/Inn.atlasmap`)!;
    expect(text).not.toContain('Private/secret.md');
    expect(text).not.toContain('atlas-vtt/assets/mine.png');
    const state = JSON.parse(text).state;
    expect(Object.keys(state.objects.pins)).toEqual(['p']);
    expect(state.objects.tokens.t.imagePath).toBe('');
  });

  it('clears every *Path field of the map types, and a new one fails this test until it is covered', async () => {
    const types = readFileSync(resolve(__dirname, '../../../../src/app/types.ts'), 'utf8');
    const fields = [...new Set([...types.matchAll(/\b(\w*Path)\??:/g)].map((match) => match[1] as string))].sort();
    expect(fields).toEqual(['imagePath', 'notePath', 'statblockPath']);
    const foreign = Object.fromEntries(fields.map((field) => [field, `Secret/${field}.md`]));
    const { files, deps } = await setup();
    const full: MapPayload = {
      format: 'atlas-share-map-v1', mode: 'full', name: 'Inn',
      map: {
        background: 'Secret/background.png',
        objects: {
          tokens: { t: { id: 't', kind: 'character', x: 0, y: 0, ...foreign } },
          pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, ...foreign } },
        },
      },
      notes: [], images: [],
    };
    await pullMap(deps({}), input(full));
    expect(files.get(`${SCENES}/Inn.atlasmap`)).not.toContain('Secret/');
  });

  it('writes no image whose bytes are not the fingerprint it was asked for', async () => {
    const { files, images, deps } = await setup();
    images.mockImplementation(async (): Promise<PulledItem> => ({
      kind: 'image', version: fingerprintOf('other-bytes'), mime: 'image/png', bytes: new TextEncoder().encode('other-bytes').buffer,
    }));
    await pullMap(deps({}), input(playerSafe));
    expect([...files.keys()].some((path) => path.includes('/files/'))).toBe(false);
    expect(JSON.parse(files.get(`${SCENES}/Inn.atlasmap`)!).state.background).toBeNull();
  });

  it('replaces the received map on a re-pull, never adding a second scene', async () => {
    const { assets, deps } = await setup();
    await pullMap(deps({}), input(playerSafe));
    expect(await pullMap(deps({}), { ...input(playerSafe), item: { ...input(playerSafe).item, version: 'W'.repeat(43) } }))
      .toMatchObject({ kind: 'updated' });
    expect(assets.addAsset).toHaveBeenCalledTimes(1);
  });

  it('never overwrites another map that took a deleted map’s path, and writes the deleted one anew', async () => {
    const { files, pulled, deps } = await setup();
    const other = { ...input(playerSafe), item: { ...input(playerSafe).item, item: 'x'.repeat(22) } };
    await pullMap(deps({}), input(playerSafe));
    files.delete(`${SCENES}/Inn.atlasmap`);
    pulled.deleted(`${SCENES}/Inn.atlasmap`);
    expect(await pullMap(deps({}), other)).toEqual({ kind: 'created', path: `${SCENES}/Inn.atlasmap` });
    const second = files.get(`${SCENES}/Inn.atlasmap`);
    expect(await pullMap(deps({}), { ...input(playerSafe), item: { ...input(playerSafe).item, version: 'W'.repeat(43) } }))
      .toEqual({ kind: 'created', path: `${SCENES}/Inn (2).atlasmap` });
    expect(files.get(`${SCENES}/Inn.atlasmap`)).toBe(second);
  });

  it('removes the map file again when its scene record cannot be added', async () => {
    const { files, assets, deps } = await setup();
    assets.addAsset.mockRejectedValueOnce(new Error('no'));
    await expect(pullMap(deps({}), input(playerSafe))).rejects.toThrow('no');
    expect(files.has(`${SCENES}/Inn.atlasmap`)).toBe(false);
  });

  it('a failing cleanup does not hide the error that made it necessary (M6)', async () => {
    const { app, assets, deps } = await setup();
    assets.addAsset.mockRejectedValueOnce(new Error('no scene'));
    vi.mocked(app.fileManager.trashFile).mockRejectedValueOnce(new Error('cannot trash'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pullMap(deps({}), input(playerSafe))).rejects.toThrow('no scene');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('skips an image that cannot be pulled and still brings the map', async () => {
    const { files, images, deps } = await setup();
    images.mockRejectedValue(new Error('gone'));
    expect(await pullMap(deps({}), input(playerSafe))).toMatchObject({ kind: 'created' });
    expect(JSON.parse(files.get(`${SCENES}/Inn.atlasmap`)!).state.background).toBeNull();
  });

  it('creates the collection once when two first pulls run together', async () => {
    const { assets, deps } = await setup();
    assets.createCollection.mockImplementation(async (name: string) => { await Promise.resolve(); return { id: name, name }; });
    await Promise.all([
      pullMap(deps({}), input(playerSafe)),
      pullMap(deps({}), { ...input(playerSafe), item: { ...input(playerSafe).item, item: 'x'.repeat(22) } }),
    ]);
    expect(assets.createCollection).toHaveBeenCalledTimes(1);
  });
});
