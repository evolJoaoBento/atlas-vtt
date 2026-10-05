import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/app/services/AssetService';
import { LEGACY_SHARING_EXTENSION_ID, movedLegacySceneData } from '../../src/app/services/legacySceneData';
import { sceneAsset } from '../mocks/sceneAsset';

describe('movedLegacySceneData', () => {
  it('moves a data.sharing a fork of Atlas left into the data of its extension once, and keeps newer extension data', () => {
    expect(movedLegacySceneData(sceneAsset({ data: { mapPath: 'm', sharing: { a: 1 } } as never }))?.data)
      .toEqual({ mapPath: 'm', extensions: { 'atlas-vtt-connect': { a: 1 } } });
    expect(movedLegacySceneData(sceneAsset({ data: { mapPath: 'm', sharing: { a: 1 }, extensions: { 'atlas-vtt-connect': { b: 2 } } } as never }))?.data)
      .toEqual({ mapPath: 'm', extensions: { 'atlas-vtt-connect': { b: 2 } } });
    expect(movedLegacySceneData(sceneAsset({ data: { mapPath: 'm' } }))).toBeNull();
  });

  it('keeps other extensions beside the moved share and leaves its input alone', () => {
    const asset = sceneAsset({ data: { mapPath: 'm', sharing: { a: 1 }, extensions: { other: 'x' } } as never });
    expect(movedLegacySceneData(asset)?.data).toEqual({ mapPath: 'm', extensions: { other: 'x', [LEGACY_SHARING_EXTENSION_ID]: { a: 1 } } });
    expect(asset.data).toEqual({ mapPath: 'm', sharing: { a: 1 }, extensions: { other: 'x' } });
  });

  it('leaves no empty extension object behind', () => {
    expect(movedLegacySceneData(sceneAsset({ data: { mapPath: 'm', sharing: undefined } as never }))?.data).toEqual({ mapPath: 'm' });
  });

  it('only reads scene records', () => {
    const token = { id: 't', type: 'token', name: 'x', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, data: { sharing: 1 } } as unknown as Asset;
    expect(movedLegacySceneData(token)).toBeNull();
    expect(movedLegacySceneData(sceneAsset())).toBeNull();
  });
});
