import { resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import { collectionConeAngle } from '../gameSystems/coneAngle';
import type { ViewAtlasState } from '../storeFactory';
import type { CollectionGridDefaults, CollectionSettings } from '../types/collectionSettingsTypes';
import type { AssetService } from './AssetService';

/** The settings of the collection holding the map at `mapPath`; null for a map outside a collection. */
function collectionSettingsFor(assetService: AssetService, mapPath: string | null): CollectionSettings | null {
  const collectionId = mapPath ? assetService.getCollectionForMap(mapPath) : null;
  return collectionId ? assetService.getCollectionSettings(collectionId) : null;
}

/**
 * The grid defaults of the collection holding the map at `mapPath`, with the cone angle the GM's
 * measure tool uses (`collectionConeAngle`: a collection set up before cone angles takes its
 * system's), so online players' cones open as the GM's; null for a map outside a collection.
 */
export function collectionGridDefaultsFor(assetService: AssetService, mapPath: string | null): CollectionGridDefaults | null {
  const settings = collectionSettingsFor(assetService, mapPath);
  const gridDefaults = settings?.gridDefaults;
  return gridDefaults ? { ...gridDefaults, coneAngle: collectionConeAngle(gridDefaults, settings.systemPresetId) } : null;
}

/** Measurement settings for the map in `state`: its collection's, or, in the online scene, the GM's. */
export function mapMeasurementSettings(
  assetService: AssetService,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid' | 'remoteScene'>,
): MeasurementSettings {
  if (state.remoteScene) return state.remoteScene.measurement;
  const settings = collectionSettingsFor(assetService, state.mapPath);
  if (!settings) return resolveMeasurementSettings(undefined, state.grid);
  const { gridDefaults, systemPresetId } = settings;
  return { ...resolveMeasurementSettings(gridDefaults, state.grid), coneAngle: collectionConeAngle(gridDefaults, systemPresetId) };
}
