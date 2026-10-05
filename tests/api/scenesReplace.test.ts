// @vitest-environment node
// Reading an image header needs Blob.arrayBuffer, which jsdom lacks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scenesApi } from '../../src/api/scenes';
import type { SavedMapInput } from '../../src/api/types/scenes';
import { AssetService } from '../../src/app/services/AssetService';
import { assetFilePath } from '../../src/app/services/vault-sync/assetFiles';
import { fakeView, trackerWith } from './apiFakes';
import { emptyMap, MAP_PATH, withScene, type Fixture } from './scenesFixture';

const FOLDER = 'atlas-vtt/collections/Shared with me/Cave';
const image = (path: string, text = path): { path: string; data: ArrayBuffer } => ({ path, data: new TextEncoder().encode(text).buffer });
const withToken = (imagePath: string, fields: Partial<SavedMapInput> = {}): SavedMapInput => emptyMap({
  ...fields, objects: { tokens: { t1: { kind: 'token', id: 't1', x: 0, y: 0, imagePath } }, texts: {}, drawings: {}, fog: {} },
});

/** A scene this extension added: background bg.webp, one token drawn with tok.png. */
async function added(fixture: Fixture): Promise<{ sceneId: string; mapPath: string }> {
  return fixture.scenes.addToCollection({
    collection: { name: 'Shared with me' }, name: 'Cave', folder: FOLDER,
    map: withToken('tok.png', { background: 'bg.webp' }), images: [image('bg.webp', 'old bg'), image('tok.png', 'old token')],
  });
}

const files = (fixture: Fixture): string[] => [...fixture.vault.files.keys()].filter((path) => path.startsWith(FOLDER)).sort();

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('scenes.replaceMap', () => {
  it('C-scenes-5: replaces the map and images of a scene the extension added, keeping its id, name and collection', async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    // Another asset still draws the old token image: it stays.
    await fixture.assets.addTokenAsset({ name: 'Goblin', imagePath: `${FOLDER}/tok.png`, collection: 'Shared with me', tags: [] });
    const pins = { p: { id: 'p', kind: 'pin' as const, x: 1, y: 2, notePath: 'Notes/Cave.md' } };
    const result = await fixture.scenes.replaceMap!(sceneId, { map: emptyMap({ background: 'bg.webp', pins, camera: { x: 3, y: 4, scale: 2 } }), images: [image('bg.webp', 'new bg')] });
    expect(result).toEqual({ sceneId, mapPath });
    const map = (await fixture.scenes.readMap(mapPath))!;
    expect(map.background).toBe(`${FOLDER}/bg (2).webp`);
    expect(map.pins).toEqual(pins);
    expect(map.camera).toEqual({ x: 3, y: 4, scale: 2 });
    expect(map.objects.tokens).toEqual({});
    expect(files(fixture)).toEqual([`${FOLDER}/Cave.atlasmap`, `${FOLDER}/bg (2).webp`, `${FOLDER}/tok.png`]);
    expect(fixture.vault.files.get(`${FOLDER}/bg (2).webp`)).toBe('new bg');
    expect(await fixture.assets.getAssetById(sceneId)).toMatchObject({ name: 'Cave', collection: 'Shared with me', data: { mapPath } });
  });

  it('C-scenes-5: keeps who added a scene in the index only, never in its record file or its extension data', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const scene = (await fixture.assets.getAssetById(sceneId))!;
    expect(scene.data).toMatchObject({ createdBy: 'ext' });
    const record = assetFilePath(scene);
    expect(fixture.vault.files.get(record)).toContain(scene.data!.mapPath!);
    expect(fixture.vault.files.get(record)).not.toContain('createdBy');
    expect(await fixture.scenes.getData(sceneId)).toBeUndefined();
  });

  it("C-scenes-5: refuses the GM's own scene and another extension's, changing nothing", async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    const before = new Map(fixture.vault.files);
    const input = { map: emptyMap(), images: [image('new.webp')] };
    await expect(fixture.scenes.replaceMap!(fixture.sceneId, input)).rejects.toThrow(/only a scene this extension added/);
    const other = scenesApi(fixture.vault.app, { id: 'other' });
    await expect(other.replaceMap!(sceneId, input)).rejects.toThrow(/only a scene this extension added/);
    await expect(fixture.scenes.replaceMap!('nope', input)).rejects.toThrow(/no scene/);
    expect(new Map(fixture.vault.files)).toEqual(before);
    expect(fixture.vault.files.get(MAP_PATH)).toBe(before.get(MAP_PATH));
    expect(fixture.vault.files.get(mapPath)).toBe(before.get(mapPath));
  });

  it('C-scenes-5: malformed input, or a write that fails, leaves the map and its folder as they were', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const before = new Map(fixture.vault.files);
    for (const input of [
      { map: emptyMap({ camera: { x: 0, y: 0, scale: -1 } }), images: [image('new.webp')] },
      { map: emptyMap({ pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: '/abs.md' } } }), images: [] },
      { map: emptyMap(), images: [image('../out.webp')] },
      { map: null, images: [] },
    ]) {
      await expect(fixture.scenes.replaceMap!(sceneId, input as never)).rejects.toThrow(/\[Atlas API\]/);
      expect(new Map(fixture.vault.files)).toEqual(before);
    }
    vi.mocked(fixture.vault.app.vault.process).mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [image('new.webp')] })).rejects.toThrow('disk full');
    expect(new Map(fixture.vault.files)).toEqual(before);
  });

  it('C-scenes-5: refuses a scene open in a map view, also as a tab not shown, so no open view saves over it', async () => {
    const view = fakeView('v1');
    const fixture = await withScene(trackerWith([view]).tracker);
    const { sceneId, mapPath } = await added(fixture);
    view.tabMetaStore.getState().addTab(mapPath, 'Cave');
    const before = fixture.vault.files.get(mapPath);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] })).rejects.toThrow(/open in a map view/);
    expect(fixture.vault.files.get(mapPath)).toBe(before);
    view.close();
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] })).resolves.toEqual({ sceneId, mapPath });
  });
});
