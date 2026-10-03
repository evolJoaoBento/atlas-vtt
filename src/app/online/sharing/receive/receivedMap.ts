/**
 * A received map payload as an Atlas map file, pointing only at files the receiver wrote: the
 * images it saved and the notes it pulled (or pulled before). Every other path is cleared: any
 * string under a path key (`notePath`, `imagePath`, `notePaths`, an audio's `path`, the
 * `background`, any future `*Path`) goes unless allowed, and so does any other string naming a
 * file of the receiver's vault, so a crafted map can never point at (and later re-share) the
 * receiver's own files. Pins whose note is gone are dropped.
 */
import { ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile, type MapFile } from '../../../services/MapPersistence';
import { mapStrings } from '../../../utils/mapStrings';
import { playerSceneToAtlasState } from '../../obsidian/playerSceneToAtlasState';
import { setOwn } from '../../scene/sceneDiff';
import { PATH_KEY, replaceStrings } from '../model/buildMapPayload';
import { IMAGE_REF_PREFIX, NOTE_REF_PREFIX, type MapPayload } from '../model/mapPayload';

export interface ReceivedMapContext {
  /** Fingerprint → the vault path the receiver saved that image to. */
  images: ReadonlyMap<string, string>;
  /** Item id → the vault path of that note on the receiver's side, pulled now or before. */
  notes: ReadonlyMap<string, string>;
  /** Whether a string is a path of the receiver's vault. */
  isFile: (path: string) => boolean;
}

const FULL_EXTRAS = ['widgetSettings', 'widgetValues', 'initiative', 'initiativeTrackerOpen', 'tokenSettings'] as const;

function fromPlayerSafe(payload: Extract<MapPayload, { mode: 'player-safe' }>, context: ReceivedMapContext): Record<string, unknown> {
  const image = (id: string | null): string | null => (id ? context.images.get(id) ?? null : null);
  const parts = playerSceneToAtlasState(payload.scene, { background: image, token: image });
  const tokens = { ...parts.state.objects.tokens };
  for (const [id, note] of Object.entries(payload.tokenNotes)) {
    const path = context.notes.get(note);
    const token = tokens[id];
    if (path && token) setOwn(tokens, id, { ...token, notePath: path });
  }
  const pins: MapFile['objects']['pins'] = {};
  payload.pins.forEach((pin, index) => {
    const notePath = context.notes.get(pin.note);
    if (!notePath) return;
    const id = `shared-pin-${index}`;
    setOwn(pins, id, { id, kind: 'pin', x: pin.x, y: pin.y, notePath, ...(pin.icon ? { icon: pin.icon } : {}), ...(pin.label ? { label: pin.label } : {}), ...(pin.hex ? { hex: true } : {}) });
  });
  const { objects, ...rest } = parts.state;
  return { ...rest, objects: { tokens, fog: objects.fog, pins, texts: objects.texts, drawings: objects.drawings, walls: {}, lights: {} } };
}

function fromFull(payload: Extract<MapPayload, { mode: 'full' }>, context: ReceivedMapContext): Record<string, unknown> {
  const resolved = mapStrings(payload.map, (text) => {
    if (text.startsWith(IMAGE_REF_PREFIX)) return context.images.get(text.slice(IMAGE_REF_PREFIX.length)) ?? '';
    if (text.startsWith(NOTE_REF_PREFIX)) return context.notes.get(text.slice(NOTE_REF_PREFIX.length)) ?? '';
    return text;
  });
  const map = migrateMapFile(resolved);
  const extras = Object.fromEntries(FULL_EXTRAS.flatMap((key) => (resolved[key] === undefined ? [] : [[key, resolved[key]]])));
  return { background: map.background, grid: map.grid, objects: map.objects, camera: map.camera, ...extras };
}

/** Clears every path not allowed (by key, or because it names a file here), then drops pins without a note. */
export function clearForeignPaths(state: Record<string, unknown>, allowed: ReadonlySet<string>, isFile: (path: string) => boolean): Record<string, unknown> {
  const swept = replaceStrings(state, (text, underPathKey) => (allowed.has(text) || !(underPathKey || isFile(text)) ? text : '')) as Record<string, unknown>;
  const map = migrateMapFile(swept);
  const pins = Object.fromEntries(Object.entries(map.objects.pins).filter(([, pin]) => allowed.has(pin.notePath)));
  const tokens = Object.fromEntries(Object.entries(map.objects.tokens).map(([id, token]) => {
    const cleaned: Record<string, unknown> = { ...token };
    for (const key of Object.keys(cleaned)) if (PATH_KEY.test(key) && cleaned[key] === '' && key !== 'imagePath') cleaned[key] = undefined;
    return [id, cleaned];
  }));
  return { ...swept, background: map.background || null, objects: { ...map.objects, tokens, pins } };
}

export function receivedMapState(payload: MapPayload, context: ReceivedMapContext): Record<string, unknown> {
  const body = payload.mode === 'player-safe' ? fromPlayerSafe(payload, context) : fromFull(payload, context);
  const allowed = new Set([...context.images.values(), ...context.notes.values()]);
  const cleared = clearForeignPaths(body, allowed, context.isFile);
  return { ...cleared, schema: ATLAS_SCHEMA, version: ATLAS_VERSION, name: payload.name, camera: cleared.camera ?? { x: 0, y: 0, scale: 1 } };
}
