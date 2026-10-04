import type { App } from 'obsidian';
import { resolveMeasurementSettings } from '../app/grid/measurementFormat';
import { mapResources } from '../app/resources/collectionResources';
import { AssetService } from '../app/services/AssetService';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { mapInitiativeRules } from '../app/services/mapInitiativeRules';
import { mapConeAngle } from '../app/services/mapMeasurementSettings';
import type { ApiEvents } from './events';
import type { MapRules, RulesApi } from './types/rules';

export function mapRules(app: App, mapPath: string | null): MapRules {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  const settings = collectionId ? assets.getCollectionSettings(collectionId) : null;
  return Object.freeze({
    collectionId,
    gridDefaults: settings?.gridDefaults ?? null,
    measurement: { ...resolveMeasurementSettings(settings?.gridDefaults, null), coneAngle: mapConeAngle(assets, mapPath) },
    resources: mapResources(assets, mapPath),
    conditions: settings?.conditions ?? [],
    initiative: mapInitiativeRules(app, mapPath),
    dice: mapDiceRules(app, mapPath),
  });
}

export function rulesApi(app: App): RulesApi {
  return Object.freeze({ forMap: (mapPath: string | null): MapRules => mapRules(app, mapPath) });
}

/** `rules-changed` for collection settings saves and once the asset index has loaded; returns the stop. */
export function watchRules(app: App, events: ApiEvents): () => void {
  let live = true;
  const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (collectionId: string) => {
    if (live) events.emit('rules-changed', collectionId ?? null);
  });
  AssetService.getInstance(app).initialize().then(
    () => { if (live) events.emit('rules-changed', null); },
    () => undefined,
  );
  return (): void => {
    live = false;
    app.workspace.offref(ref);
  };
}
