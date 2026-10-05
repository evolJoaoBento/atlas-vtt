import { TFile, type App } from 'obsidian';
import { imageDimensions } from '../app/imageProcessing/imageDimensions';
import { readSceneLighting } from '../app/lighting/sceneLightingOptions';
import { tokenSettingsFromFile } from '../app/resources/resourceFileFormat';
import { ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile, parseSceneFile } from '../app/services/MapPersistence';
import { createDefaultWidgets, DEFAULT_TOKEN_SETTINGS } from '../app/storeFactory';
import { createDefaultInitiativeState } from '../app/types/initiativeTypes';
import { frozenCopy } from './frozen';
import type { SavedMap, SavedMapInput } from './types/scenes';

type SavedState = ReturnType<typeof parseSceneFile>['state'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The fields of `SavedMapInput`, from a migrated map file. */
function savedMapInput(state: SavedState, map: ReturnType<typeof migrateMapFile>): SavedMapInput {
  return {
    background: map.background,
    grid: map.grid,
    objects: { tokens: map.objects.tokens, texts: map.objects.texts, drawings: map.objects.drawings, fog: map.objects.fog },
    widgets: { settings: { ...createDefaultWidgets(), ...state.widgetSettings }, values: state.widgetValues ?? {} },
    initiative: { ...createDefaultInitiativeState(), ...state.initiative } as SavedMapInput['initiative'],
    lighting: readSceneLighting((state as { lighting?: unknown }).lighting),
  };
}

/** The rest of the scene `readMap` hands out, normalised as Atlas loads the map; the GM's note, the dice log and explored memory stay behind. */
function savedMapExtras(state: SavedState, map: ReturnType<typeof migrateMapFile>): Required<Omit<SavedMap, keyof SavedMapInput | 'mapSize'>> {
  const tokenSettings = isRecord(state.tokenSettings) ? tokenSettingsFromFile(state.tokenSettings) : {};
  return {
    pins: isRecord(map.objects.pins) ? map.objects.pins : {},
    walls: map.objects.walls,
    lights: map.objects.lights,
    camera: map.camera,
    tokenSettings: { ...DEFAULT_TOKEN_SETTINGS, ...tokenSettings },
    initiativeTrackerOpen: (state as { initiativeTrackerOpen?: unknown }).initiativeTrackerOpen === true,
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
  const { state } = parseSceneFile(await app.vault.read(file));
  const map = migrateMapFile(state);
  const input = savedMapInput(state, map);
  return frozenCopy({ ...input, ...savedMapExtras(state, map), mapSize: await backgroundSize(app, input.background) });
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
