import { describe, expect, it, vi } from 'vitest';
import type { AssetMetadata, SceneAsset } from '../../../../src/app/services/AssetService';
import { transferredRecord } from '../../../../src/app/services/assetTransfer/transferRecords';
import { adoptUnindexedFiles } from '../../../../src/app/services/vault-sync/assetAdoption';
import { mapShareOf, mapShareReaches, parseMapShare, writeMapShare, type MapShare } from '../../../../src/app/online/sharing/model/mapShare';
import { followVaultChange } from '../../../../src/app/online/sharing/model/mapShareRenames';
import { linkedNotesOf, offeredNotes } from '../../../../src/app/online/sharing/model/linkedNotes';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const share: MapShare = { item: 'i'.repeat(22), everyone: false, people: [`${T}/ana`], except: [], mode: 'player-safe', notes: ['Notes/Inn.md'] };
const scene = (data: SceneAsset['data']): SceneAsset => ({ id: 's1', type: 'scene', name: 'Inn', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, ...(data ? { data } : {}) });

describe('map shares on scene records', () => {
  it('reads only well-formed shares', () => {
    expect(mapShareOf(scene({ mapPath: 'm.atlasmap', sharing: share }))).toEqual(share);
    expect(parseMapShare({ ...share, mode: 'everything' })).toBeNull();
    expect(parseMapShare({ ...share, item: 'short' })).toBeNull();
    expect(mapShareOf(scene({ mapPath: 'm.atlasmap' }))).toBeNull();
  });

  it('reaches people by key, aliases included, and never the excepted', () => {
    const ana: Person = { tableId: T, personId: 'ana', name: 'Ana', formerNames: [], devices: [], aliases: [`${T}/old`], lastSeen: 0 };
    const people = { byKey: (key: string): Person | null => (key === `${T}/ana` || key === `${T}/old` ? ana : null) };
    expect(mapShareReaches(share, { tableId: T, personId: 'ana' }, people)).toBe(true);
    expect(mapShareReaches({ ...share, people: [`${T}/old`] }, { tableId: T, personId: 'ana' }, people)).toBe(true);
    expect(mapShareReaches(share, { tableId: T, personId: 'ben' }, people)).toBe(false);
    expect(mapShareReaches({ ...share, everyone: true, except: [`${T}/ana`] }, { tableId: T, personId: 'ana' }, people)).toBe(false);
  });

  it('writes and clears through the scene record, keeping its other data', async () => {
    const assets = { updateAsset: vi.fn(async () => {}) };
    await writeMapShare(assets, scene({ mapPath: 'm.atlasmap' }), share);
    expect(assets.updateAsset).toHaveBeenLastCalledWith('s1', { data: { mapPath: 'm.atlasmap', sharing: share } });
    await writeMapShare(assets, scene({ mapPath: 'm.atlasmap', sharing: share }), null);
    expect(assets.updateAsset).toHaveBeenLastCalledWith('s1', { data: { mapPath: 'm.atlasmap' } });
  });

  it('survives the vault check and is dropped from copies', () => {
    const json = 'atlas-vtt/collections/c/scenes/s1.json';
    const map = 'atlas-vtt/collections/c/scenes/Inn.atlasmap';
    const metadata = { assets: {}, collections: {} } as unknown as AssetMetadata;
    adoptUnindexedFiles(metadata, new Set([json, map]), new Map([[json, { name: 'Inn', mapPath: map, sharing: share }]]), new Set(), 1);
    expect((Object.values(metadata.assets)[0] as SceneAsset).data?.sharing).toEqual(share);
    const plan = { steps: [], rewrites: new Map<string, string>(), recordPaths: new Map<string, string>() };
    const copy = transferredRecord(scene({ mapPath: map, sharing: share }), { targetCollectionId: 'd', newIds: new Map([['s1', 's2']]), plan, now: 2 });
    expect((copy as SceneAsset).data).toEqual({ mapPath: map });
    const moved = transferredRecord(scene({ mapPath: map, sharing: share }), { targetCollectionId: 'd', newIds: new Map(), plan, now: 2 });
    expect((moved as SceneAsset).data?.sharing).toEqual(share);
  });
});

describe('linked notes of a map', () => {
  const map = migrateMapFile({
    background: 'maps/inn.png',
    objects: {
      pins: { p1: { id: 'p1', kind: 'pin', x: 1, y: 1, notePath: 'Notes/Inn.md' }, p2: { id: 'p2', kind: 'pin', x: 2, y: 2, notePath: 'Notes/Plot.md', gmOnly: true } },
      tokens: {
        t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: 'a.png', notePath: 'Notes/Hero.md' },
        t2: { id: 't2', kind: 'character', x: 0, y: 0, imagePath: 'b.png', statblockPath: 'Monsters/Ogre.md', isHidden: true },
      },
    },
  });

  it('lists pins and tokens, and player-safe shares never offer what players cannot see', () => {
    expect(linkedNotesOf(map).map((note) => [note.path, note.hidden])).toEqual([
      ['Notes/Inn.md', false], ['Notes/Plot.md', true], ['Notes/Hero.md', false], ['Monsters/Ogre.md', true],
    ]);
    expect(offeredNotes(map, 'player-safe').map((note) => note.path)).toEqual(['Notes/Inn.md', 'Notes/Hero.md']);
    expect(offeredNotes(map, 'full')).toHaveLength(4);
  });
});

describe('ticked notes follow the vault (I3)', () => {
  const sceneWith = (id: string, notes: string[]): SceneAsset => ({ ...scene({ mapPath: `${id}.atlasmap`, sharing: { ...share, notes } }), id });
  const fakeAssets = (scenes: SceneAsset[]) => ({
    getAssets: vi.fn(async () => [...scenes]) as never,
    getAssetById: vi.fn(async (id: string) => scenes.find((candidate) => candidate.id === id) ?? null) as never,
    updateAsset: vi.fn(async () => {}),
  });

  it('re-reads each scene before writing, so a concurrent map path update is not undone (F-b)', async () => {
    const live = sceneWith('a', ['Notes/Inn.md']);
    const store = new Map<string, SceneAsset>([[live.id, live]]);
    const assets = {
      // The list was read before FileReferenceService moved the map.
      getAssets: vi.fn(async () => { const stale = [{ ...live }]; store.set(live.id, { ...live, data: { ...live.data, mapPath: 'moved/a.atlasmap' } }); return stale; }) as never,
      getAssetById: vi.fn(async (id: string) => store.get(id) ?? null) as never,
      updateAsset: vi.fn(async (id: string, updates: { data?: SceneAsset['data'] }) => { store.set(id, { ...store.get(id)!, ...updates } as SceneAsset); }),
    };
    await followVaultChange(assets, { rename: ['Notes', 'Archive'] });
    const written = store.get(live.id)!.data!;
    expect(written.mapPath).toBe('moved/a.atlasmap');
    expect(mapShareOf(store.get(live.id)!)?.notes).toEqual(['Archive/Inn.md']);
  });

  it('keeps a renamed or moved note ticked under its new path, folders included', async () => {
    const assets = fakeAssets([sceneWith('a', ['Notes/Inn.md', 'Other/Keep.md']), sceneWith('b', ['Other/Keep.md'])]);
    await followVaultChange(assets, { rename: ['Notes', 'Archive/Notes'] });
    expect(assets.updateAsset).toHaveBeenCalledTimes(1);
    const data = (assets.updateAsset.mock.calls[0] as unknown as [string, { data: { sharing: MapShare } }])[1].data;
    expect(data.sharing.notes).toEqual(['Archive/Notes/Inn.md', 'Other/Keep.md']);
  });

  it('unticks a deleted note, so a new file at its path is not shared', async () => {
    const assets = fakeAssets([sceneWith('a', ['Notes/Inn.md', 'Other/Keep.md'])]);
    await followVaultChange(assets, { removed: 'Notes/Inn.md' });
    const data = (assets.updateAsset.mock.calls[0] as unknown as [string, { data: { sharing: MapShare } }])[1].data;
    expect(data.sharing.notes).toEqual(['Other/Keep.md']);
  });

  it('writes nothing when no ticked note is affected', async () => {
    const assets = fakeAssets([sceneWith('a', ['Notes/Inn.md']), scene({ mapPath: 'm.atlasmap' })]);
    await followVaultChange(assets, { rename: ['Notes/Inn.md.bak', 'x'] });
    await followVaultChange(assets, { removed: 'Elsewhere' });
    expect(assets.updateAsset).not.toHaveBeenCalled();
  });
});
