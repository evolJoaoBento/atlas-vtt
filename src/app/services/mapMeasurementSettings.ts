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

/** The grid defaults of the collection holding the map at `mapPath`; null for a map outside a collection. */
export function collectionGridDefaultsFor(assetService: AssetService, mapPath: string | null): CollectionGridDefaults | null {
  return collectionSettingsFor(assetService, mapPath)?.gridDefaults ?? null;
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
