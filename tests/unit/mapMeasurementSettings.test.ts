import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../src/app/online/obsidian/remoteScene';
import { mapConeAngle, mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { builtInPresetId } from '../../src/app/gameSystems/presets/presetHelpers';
import { DEFAULT_CONE_ANGLE } from '../../src/app/grid/measurementFormat';
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

  // Online players get `mapConeAngle` (OnlineSessionService), the GM `mapMeasurementSettings`: one function.
  function collection(settings: object) {
    return { getCollectionForMap: vi.fn(() => 'c'), getCollectionSettings: vi.fn(() => settings) };
  }
  const gmCone = (assets: object): number => mapMeasurementSettings(assets as never, { mapPath: 'a.atlasmap', grid: null, remoteScene: null }).coneAngle;

  it("gives online players the GM's cone, a D&D collection without grid defaults or a stored angle included", () => {
    const dnd = builtInPresetId('dnd5e');
    for (const settings of [
      { systemPresetId: dnd },
      { systemPresetId: dnd, gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } },
    ]) {
      const assets = collection(settings);
      expect(mapConeAngle(assets as never, 'a.atlasmap')).toBe(53.13);
      expect(gmCone(assets)).toBe(53.13);
    }
  });

  it('opens a quarter circle for a stored angle no cone opens with, for the GM and players alike', () => {
    for (const coneAngle of [0, 500, Number.NaN]) {
      const assets = collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle } });
      expect(mapConeAngle(assets as never, 'a.atlasmap')).toBe(DEFAULT_CONE_ANGLE);
      expect(gmCone(assets)).toBe(DEFAULT_CONE_ANGLE);
    }
    const stored = collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle: 60 } });
    expect([mapConeAngle(stored as never, 'a.atlasmap'), gmCone(stored)]).toEqual([60, 60]);
  });

  it('opens a quarter circle for a map outside a collection', () => {
    const outside = { getCollectionForMap: vi.fn(() => null), getCollectionSettings: vi.fn() };
    expect(mapConeAngle(outside as never, 'a.atlasmap')).toBe(DEFAULT_CONE_ANGLE);
    expect(gmCone(outside)).toBe(DEFAULT_CONE_ANGLE);
  });

  it("keeps the page's default cone Atlas's", () => {
    expect(PLAYER_DEFAULT_CONE_ANGLE).toBe(DEFAULT_CONE_ANGLE);
  });
});
