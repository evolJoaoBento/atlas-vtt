import { TFile, type App } from 'obsidian';
import { imageDimensions } from '../app/imageProcessing/imageDimensions';
import { readSceneLighting } from '../app/lighting/sceneLightingOptions';
import { ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile, parseSceneFile } from '../app/services/MapPersistence';
import { createDefaultWidgets } from '../app/storeFactory';
import { createDefaultInitiativeState } from '../app/types/initiativeTypes';
import { frozenCopy } from './frozen';
import type { SavedMapInput } from './types/scenes';

export type SavedMap = SavedMapInput & { mapSize: { width: number; height: number } };

/** Only the fields of `SavedMapInput`, from a migrated map file; pins, walls, lights, camera, notes and logs stay behind. */
function savedMapInput(state: ReturnType<typeof parseSceneFile>['state']): SavedMapInput {
  const map = migrateMapFile(state);
  return {
    background: map.background,
    grid: map.grid,
    objects: { tokens: map.objects.tokens, texts: map.objects.texts, drawings: map.objects.drawings, fog: map.objects.fog },
    widgets: { settings: { ...createDefaultWidgets(), ...state.widgetSettings }, values: state.widgetValues ?? {} },
    initiative: { ...createDefaultInitiativeState(), ...state.initiative } as SavedMapInput['initiative'],
    lighting: readSceneLighting((state as { lighting?: unknown }).lighting),
  };
}

/** The background's natural size, read from its file's header; 0 x 0 without a readable one. */
async function backgroundSize(app: App, path: string | null): Promise<SavedMap['mapSize']> {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  if (!(file instanceof TFile)) return { width: 0, height: 0 };
  try {
    return (await imageDimensions(new Blob([await app.vault.readBinary(file)]))) ?? { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

/** The saved map at `path`, migrated, as a frozen copy; null when there is no such file. A file that exists but cannot be read throws. */
export async function readSavedMap(app: App, path: string): Promise<SavedMap | null> {
  if (typeof path !== 'string' || !path.endsWith('.atlasmap')) throw new Error('[Atlas API] readMap needs the path of an .atlasmap file.');
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const input = savedMapInput(parseSceneFile(await app.vault.read(file)).state);
  return frozenCopy({ ...input, mapSize: await backgroundSize(app, input.background) });
}

/** The text of a new map file at `mapPath` holding `map`, as Atlas's own save would write it. */
export function savedMapText(map: SavedMapInput, mapPath: string, name: string): string {
  const state = {
    schema: ATLAS_SCHEMA, version: ATLAS_VERSION, name, mapPath,
    background: map.background, grid: map.grid,
    objects: { tokens: map.objects.tokens, fog: map.objects.fog, pins: {}, texts: map.objects.texts, drawings: map.objects.drawings, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
    widgetSettings: map.widgets.settings, widgetValues: map.widgets.values, initiative: map.initiative,
    ...(map.lighting ? { lighting: map.lighting } : {}),
  };
  return JSON.stringify({ state, version: ATLAS_VERSION }, null, 2);
}
