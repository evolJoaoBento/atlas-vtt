import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../src/app/online/obsidian/remoteScene';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';

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
});
