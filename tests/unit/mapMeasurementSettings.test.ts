import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../src/app/online/obsidian/remoteScene';
import { collectionGridDefaultsFor, mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { builtInPresetId } from '../../src/app/gameSystems/presets/presetHelpers';
import { DEFAULT_CONE_ANGLE, resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { PLAYER_DEFAULT_CONE_ANGLE } from '../../src/app/online/scene/sceneTypes';

const assets = {
  getCollectionForMap: vi.fn(() => 'c'),
  getCollectionSettings: vi.fn(() => ({ gridDefaults: { unitType: 'meters', unitDistance: 2, measurementMode: 'metric' } })),
};

describe('mapMeasurementSettings', () => {
  it("reads a map's collection, as before", () => {
    expect(mapMeasurementSettings(assets as never, { mapPath: 'a.atlasmap', grid: null, remoteScene: null })).toMatchObject({ unitType: 'meters', unitDistance: 2 });
  });

  it("measures the online scene with the GM's settings and reads no collection", () => {
    assets.getCollectionForMap.mockClear();
    const measurement = { mode: 'abstract' as const, unitType: 'feet' as const, unitDistance: 5, diagonalRule: 'euclidean' as const, rangeBands: [] };
    expect(mapMeasurementSettings(assets as never, { mapPath: null, grid: null, remoteScene: { ...initialRemoteScene(), measurement } })).toBe(measurement);
    expect(assets.getCollectionForMap).not.toHaveBeenCalled();
  });

  it("gives online players the GM's cone, a D&D collection from before cone angles included", () => {
    const older = {
      getCollectionForMap: vi.fn(() => 'c'),
      getCollectionSettings: vi.fn(() => ({
        systemPresetId: builtInPresetId('dnd5e'), gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' },
      })),
    };
    const gm = mapMeasurementSettings(older as never, { mapPath: 'a.atlasmap', grid: null, remoteScene: null });
    const sent = resolveMeasurementSettings(collectionGridDefaultsFor(older as never, 'a.atlasmap') ?? undefined, null);
    expect(gm.coneAngle).toBe(53.13);
    expect(sent).toEqual(gm);
    expect(collectionGridDefaultsFor({ ...older, getCollectionForMap: () => null } as never, 'a.atlasmap')).toBeNull();
  });

  it("keeps the page's default cone Atlas's", () => {
    expect(PLAYER_DEFAULT_CONE_ANGLE).toBe(DEFAULT_CONE_ANGLE);
  });
});
