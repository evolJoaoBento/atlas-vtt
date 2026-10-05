/**
 * Builds a map's payload on the sender's machine, from the saved map file. Images are hashed
 * first (and the background's size read), so the payload never goes out without its art.
 */
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { readSceneLighting } from '../../../lighting/sceneLightingOptions';
import { isPersistedMapEnvelope, migrateMapFile, type MapFile } from '../../../services/MapPersistence';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import { ASSET_LIMITS, mimeForPath, sceneAssetIds, type Hasher } from '../../assets/assetIds';
import type { ImageFiles } from '../../scene/AssetRegistry';
import { FogCoverage } from '../../scene/FogCoverage';
import { clipToMap } from '../../scene/objectBounds';
import type { PlayerViewRules } from '../../scene/playerViewRules';
import { projectForPlayers, type ProjectedState } from '../../scene/projectForPlayers';
import { createProjectionMemo, projectFog } from '../../scene/projectRecords';
import { setOwn } from '../../scene/sceneDiff';
import type { MapSize } from '../../scene/sceneTypes';
import { IMAGE_REF_PREFIX, MAP_PAYLOAD_FORMAT, NOTE_REF_PREFIX, type FullMapPayload, type PlayerSafeMapPayload, type SharedPin } from './mapPayload';

/** A saved map: its file's map data, the state the projection reads, and the scene settings a full share carries. */
export interface SharedMapSource {
  map: MapFile;
  state: ProjectedState;
  extra: Record<string, unknown>;
  /** The saved scene has dynamic lighting on, whether or not this device has the feature switched on. */
  lit: boolean;
}

/**
 * Why a lit map is never shared player-safe: what its players see is decided by sight and light,
 * which a share does not work out yet, so it would hold tokens and pins no player token sees.
 */
export const LIT_MAP_NOT_PLAYER_SAFE = 'This map has dynamic lighting on, so it cannot be shared player-safe yet: the share would hold tokens and pins that no player token sees. Share it Full (as a co-GM sees it), or switch its lighting off first.';

export interface MapImages {
  /** Vault path → fingerprint, for the background and token images that could be hashed. */
  fingerprints: ReadonlyMap<string, string>;
  size: MapSize;
}

export interface PayloadContext {
  rules: PlayerViewRules;
  collectionGrid: CollectionGridDefaults | null;
  /** The cone angle the sender's measure tool opens on this map (`mapConeAngle`), the same as in live play. */
  coneAngle: number;
  /** The initiative rules of the map's collection, which say whether the list is by sides before a fight (`projectSides`). */
  initiativeRules: InitiativeRules;
  images: MapImages;
  /** The item id of a ticked note this recipient gets; null for any other path. */
  noteItem(path: string): string | null;
  /** Item ids of every ticked note this recipient gets. */
  linked: string[];
  /** Whether a string is a path in the sender's vault (cleared from full shares unless it is an image or a ticked note). */
  isFile(path: string): boolean;
}

const SHARED_SCENE_ID = 'shared-map';
const FULL_FIELDS = ['widgetSettings', 'widgetValues', 'initiative', 'initiativeTrackerOpen', 'tokenSettings'] as const;

/** Reads a map file: its envelope, migrated; null when it cannot be read. */
export async function readSharedMap(read: (path: string) => Promise<string>, mapPath: string): Promise<SharedMapSource | null> {
  try {
    const envelope: unknown = JSON.parse(await read(mapPath));
    if (!isPersistedMapEnvelope(envelope)) return null;
    const stored = (envelope.state ?? {}) as Record<string, unknown>;
    const map = migrateMapFile(stored);
    // The projection checks every field it reads, as for a live store.
    const state = {
      background: map.background, grid: map.grid, objects: { ...map.objects, audios: {} },
      widgetSettings: stored.widgetSettings, widgetValues: stored.widgetValues ?? {},
      initiative: stored.initiative ?? null, initiativeTrackerOpen: stored.initiativeTrackerOpen === true,
    } as unknown as ProjectedState;
    const extra = Object.fromEntries(FULL_FIELDS.flatMap((key) => (stored[key] === undefined ? [] : [[key, stored[key]]])));
    return { map, state, extra, lit: Boolean(readSceneLighting(stored.lighting).enabled) };
  } catch {
    return null;
  }
}

/** The background and token images of a map. */
export function imagePathsOf(map: MapFile): string[] {
  const paths = new Set<string>();
  if (map.background) paths.add(map.background);
  for (const token of Object.values(map.objects.tokens)) if (token.imagePath) paths.add(token.imagePath);
  return [...paths];
}

export async function hashMapImages(
  map: MapFile, files: ImageFiles, hash: Hasher,
  dimensions: (bytes: ArrayBuffer) => Promise<MapSize | null> = (bytes) => imageDimensions(new Blob([bytes])),
): Promise<MapImages> {
  const fingerprints = new Map<string, string>();
  let size: MapSize = { width: 0, height: 0 };
  for (const path of imagePathsOf(map)) {
    const stat = files.stat(path);
    if (!stat || stat.size > ASSET_LIMITS.fileBytes || !mimeForPath(path)) continue;
    try {
      const bytes = await files.read(path);
      fingerprints.set(path, await hash(bytes));
      if (path === map.background) size = (await dimensions(bytes)) ?? size;
    } catch {
      // an unreadable image is left out, as online play does
    }
  }
  return { fingerprints, size };
}

/** Null for a lit map (`LIT_MAP_NOT_PLAYER_SAFE`): a player-safe share of it is refused. */
export function playerSafePayload(source: SharedMapSource, name: string, context: PayloadContext): PlayerSafeMapPayload | null {
  if (source.lit) return null;
  const memo = createProjectionMemo();
  const coverage = FogCoverage.fromPlayerFog(projectFog(source.map.objects.fog, memo));
  const scene = projectForPlayers(source.state, {
    sceneId: SHARED_SCENE_ID, rules: context.rules, coverage, memo, mapSize: context.images.size,
    assets: { idFor: (path) => (path ? context.images.fingerprints.get(path) ?? null : null) },
    collectionGrid: context.collectionGrid, coneAngle: context.coneAngle, initiativeRules: context.initiativeRules,
  });
  // Pins players cannot see (GM-only, under fog) and pins whose note is not ticked are left out.
  const pins: SharedPin[] = Object.values(source.map.objects.pins).flatMap((pin): SharedPin[] => {
    if (pin.gmOnly) return [];
    // A pin is shown only where the fog surely leaves the map revealed, inside the map.
    const inMap = clipToMap({ x: pin.x, y: pin.y, width: 1, height: 1 }, context.images.size);
    if (!inMap || !coverage.reveal(context.images.size).revealed(inMap)) return [];
    const note = context.noteItem(pin.notePath);
    if (!note) return [];
    return [{ x: pin.x, y: pin.y, note, ...(pin.icon ? { icon: pin.icon } : {}), ...(pin.label ? { label: pin.label } : {}), ...(pin.hex ? { hex: true } : {}) }];
  });
  const tokenNotes: Record<string, string> = {};
  for (const id of Object.keys(scene.tokens)) {
    const token = source.map.objects.tokens[id];
    const path = token && 'notePath' in token && token.notePath ? token.notePath : token && 'statblockPath' in token ? token.statblockPath : undefined;
    const note = path ? context.noteItem(path) : null;
    if (note) setOwn(tokenNotes, id, note);
  }
  return { format: MAP_PAYLOAD_FORMAT, mode: 'player-safe', name, scene, pins, tokenNotes, notes: [...context.linked], images: sceneAssetIds(scene) };
}

/** Keys that hold vault paths (`notePath`, `imagePath`, `notePaths`, an audio's `path`, the `background`), and everything nested under them. A new `*Path` field is covered by its name. */
export const PATH_KEY = /paths?$|^background$/i;

/** `value` with `replace` applied to every string in it, told whether the string sits under a path key. */
export function replaceStrings(value: unknown, replace: (text: string, underPathKey: boolean) => string, underPathKey = false): unknown {
  if (typeof value === 'string') return replace(value, underPathKey);
  if (Array.isArray(value)) return value.map((item: unknown) => replaceStrings(item, replace, underPathKey));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]): [string, unknown] => [key, replaceStrings(item, replace, underPathKey || PATH_KEY.test(key))]));
  }
  return value;
}

export function fullPayload(source: SharedMapSource, name: string, context: PayloadContext): FullMapPayload {
  const { map } = source;
  const body = { background: map.background, grid: map.grid, objects: map.objects, camera: map.camera, ...source.extra };
  // Paths go by key, whether or not the file exists: only images and ticked notes stay, as references.
  // Any other string that is an existing file is cleared too, wherever it is.
  const replaced = replaceStrings(body, (text, underPathKey) => {
    const image = context.images.fingerprints.get(text);
    if (image) return `${IMAGE_REF_PREFIX}${image}`;
    const note = context.noteItem(text);
    if (note) return `${NOTE_REF_PREFIX}${note}`;
    return underPathKey || context.isFile(text) ? '' : text;
  }) as Record<string, unknown>;
  return {
    format: MAP_PAYLOAD_FORMAT, mode: 'full', name, map: replaced,
    notes: [...context.linked], images: [...new Set(context.images.fingerprints.values())],
  };
}
