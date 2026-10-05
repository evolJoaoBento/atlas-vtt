import { beforeEach, expect, it, vi } from 'vitest';
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
