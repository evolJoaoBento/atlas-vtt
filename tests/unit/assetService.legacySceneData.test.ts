import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

const scene = (id: string, data: object): object => ({ id, type: 'scene', name: id, tags: [], collection: 'Default', createdAt: 1, modifiedAt: 1, data });

function indexWith(assets: object[]): string {
  return JSON.stringify({
    collections: { Default: { id: 'Default', name: 'Default', tags: {}, createdAt: 1, modifiedAt: 1, uid: 'u', version: 1, settings: { conditions: [] } } },
    defaultCollectionId: 'Default',
    assets: Object.fromEntries(assets.map((asset) => [(asset as { id: string }).id, asset])),
    vaultId: 'vault',
    version: 2,
  });
}

function seeded(assets: object[]): InMemoryApp {
  return createInMemoryApp({ folders: ['atlas-vtt/collections', 'atlas-vtt/collections/Default'], files: { [METADATA_PATH]: indexWith(assets) } });
}

beforeEach(() => { AssetService.resetInstance(); });

it('moves a legacy map share to the Connect extension when the index loads, and keeps the index free of it', async () => {
  const vault = seeded([
    scene('moved', { mapPath: 'a.atlasmap', sharing: { item: 'x' } }),
    scene('newer', { mapPath: 'b.atlasmap', sharing: { item: 'old' }, extensions: { 'atlas-vtt-connect': { item: 'new' } } }),
    scene('plain', { mapPath: 'c.atlasmap' }),
  ]);
  const service = AssetService.getInstance(vault.app);
  await service.initialize();

  expect((await service.getAssetById('moved'))?.type === 'scene' && (await service.getAssetById('moved'))?.data)
    .toEqual({ mapPath: 'a.atlasmap', extensions: { 'atlas-vtt-connect': { item: 'x' } } });
  expect((await service.getAssetById('newer') as { data: unknown }).data).toEqual({ mapPath: 'b.atlasmap', extensions: { 'atlas-vtt-connect': { item: 'new' } } });
  expect((await service.getAssetById('plain') as { data: unknown }).data).toEqual({ mapPath: 'c.atlasmap' });
  const stored = vault.files.get(METADATA_PATH)!;
  expect(stored).not.toContain('"sharing"');
});

it('does not save the index when no scene has a legacy share', async () => {
  const vault = seeded([scene('plain', { mapPath: 'c.atlasmap' })]);
  await AssetService.getInstance(vault.app).initialize();
  expect(vault.app.vault.adapter.write).not.toHaveBeenCalled();
});

it('moves a share that comes back with a re-read of the index', async () => {
  const vault = seeded([scene('plain', { mapPath: 'c.atlasmap' })]);
  const service = AssetService.getInstance(vault.app);
  await service.initialize();
  vault.files.set(METADATA_PATH, indexWith([scene('plain', { mapPath: 'c.atlasmap', sharing: { item: 'back' } })]));
  await service.refreshMetadata();
  expect((await service.getAssetById('plain') as { data: unknown }).data).toEqual({ mapPath: 'c.atlasmap', extensions: { 'atlas-vtt-connect': { item: 'back' } } });
});

describe('record files of scenes', () => {
  const RECORD = 'atlas-vtt/collections/Default/scenes/moved.json';
  const A = 'atlas-vtt/collections/Default/scenes/a.atlasmap';
  const C = 'atlas-vtt/collections/Default/scenes/c.atlasmap';
  const N = 'atlas-vtt/collections/Default/scenes/n.atlasmap';
  const PLAIN = 'atlas-vtt/collections/Default/scenes/plain.json';

  it('lose the extension data and legacy share they already carry when the index loads', async () => {
    const vault = seeded([
      { ...scene('moved', { mapPath: A, sharing: { item: 'x' }, extensions: { other: 1 } }), filePath: RECORD },
      { ...scene('plain', { mapPath: C }), filePath: PLAIN },
    ]);
    const plain = JSON.stringify({ mapPath: C });
    vault.files.set(RECORD, JSON.stringify({ mapPath: A, sharing: { item: 'x' }, extensions: { other: 1 } }, null, 2));
    vault.files.set(PLAIN, plain);
    for (const map of [A, C, N]) vault.files.set(map, '{}');
    await AssetService.getInstance(vault.app).initialize();

    expect(JSON.parse(vault.files.get(RECORD)!)).toEqual({ mapPath: A });
    expect(vault.files.get(PLAIN)).toBe(plain);
    // the index keeps it
    expect(vault.files.get(METADATA_PATH)).toContain('"atlas-vtt-connect"');
  });

  it('never get extension data written into them', async () => {
    const vault = seeded([{ ...scene('moved', { mapPath: A }), filePath: RECORD }]);
    vault.files.set(RECORD, JSON.stringify({ mapPath: A }));
    for (const map of [A, C, N]) vault.files.set(map, '{}');
    const service = AssetService.getInstance(vault.app);
    await service.initialize();
    await service.updateAsset('moved', { data: { mapPath: A, extensions: { ext: { item: 1 } } } });
    expect(JSON.parse(vault.files.get(RECORD)!)).toEqual({ mapPath: A });
    expect(((await service.getAssetById('moved')) as { data: unknown }).data).toEqual({ mapPath: A, extensions: { ext: { item: 1 } } });
    const added = await service.addAsset({ type: 'scene', name: 'New', collection: 'Default', tags: [], data: { mapPath: N, extensions: { ext: 1 } } });
    expect(JSON.parse(vault.files.get(added.type === 'scene' ? added.filePath! : '')!)).toEqual({ mapPath: N });
  });
});

describe('a cleaned record file', () => {
  const A = 'atlas-vtt/collections/Default/scenes/a.atlasmap';
  const RECORD = 'atlas-vtt/collections/Default/scenes/old.json';

  it('matches, byte for byte, the file Atlas writes for a new scene with the same data', async () => {
    const vault = seeded([{ ...scene('old', { mapPath: A, sharing: { item: 'x' } }), filePath: RECORD }]);
    // an old file: tab indent, a trailing newline and the data the index no longer wants in it
    vault.files.set(A, '{}');
    vault.files.set(RECORD, `${JSON.stringify({ mapPath: A, sharing: { item: 'x' } }, null, '\t')}\n`);
    const service = AssetService.getInstance(vault.app);
    await service.initialize();
    const fresh = await service.addAsset({ type: 'scene', name: 'Fresh', collection: 'Default', tags: [], data: { mapPath: A } });
    expect(vault.files.get(RECORD)).toBe(vault.files.get(fresh.type === 'scene' ? fresh.filePath! : ''));
  });
});
