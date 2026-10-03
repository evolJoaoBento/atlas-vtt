/**
 * What online players receive of every Atlas map object and field. The tables are
 * records over Atlas's own types, so a new object kind or field fails the build
 * until it is recorded here (see `docs/online-play-features.md`).
 *
 * - `sent`: changes what players receive: the value itself, or what it decides
 *   (a hidden token never reaches players).
 * - `lighting`: never sent, in any message; with dynamic lighting on and the scene lit it
 *   decides what players receive, through the lighting the GM's player window is drawn by
 *   (`PlayerLighting`): which tokens they see and the darkness over the map. Off, it changes nothing.
 * - `gm-only`: never changes what players receive; `reason` says why.
 * - `not-yet`: not sent yet; `piece` names the work expected to add it.
 *
 * `tests/unit/online/coverage.test.ts` checks every entry against the projection.
 */
import type { GridState } from '../services/MapPersistence';
import type { ViewAtlasState } from '../storeFactory';
import type { DrawingStroke, TextElement, TokenEntity } from '../types';
import type { CollectionGridDefaults } from '../types/collectionSettingsTypes';
import type { FogOperation } from '../types/fogTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import type { SceneLighting } from '../types/lightingTypes';
import type { ProjectedState } from './scene/projectForPlayers';

export type Coverage =
  | { readonly status: 'sent' }
  | { readonly status: 'lighting' }
  | { readonly status: 'gm-only'; readonly reason: string }
  | { readonly status: 'not-yet'; readonly piece: string };

export type CoverageTable<K extends PropertyKey> = Readonly<Record<K, Coverage>>;

/** Every key of every member of a union; `keyof` of a union keeps only the shared ones. */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never;

const SENT: Coverage = { status: 'sent' };
const LIGHTING: Coverage = { status: 'lighting' };
const gmOnly = (reason: string): Coverage => ({ status: 'gm-only', reason });
const notYet = (piece: string): Coverage => ({ status: 'not-yet', piece });

const KIND = gmOnly('the record kind; players get each kind in its own list');
const TOKEN_RESOURCES = notYet('token resources (Atlas 0.5), shown to players by their visibleToPlayers');
const LOCAL_PLAYER_LINK = gmOnly('links the token to a local player character, not to an online player');
const INITIATIVE_SIDES = notYet('initiative by sides (Atlas 0.5)');
/** Only how the player window draws what it shows (tints, looks): never what it shows or hides. */
const LIGHTING_LOOK = gmOnly('the look of the lit picture; players get what it shows, not how it is tinted');

export const OBJECT_COVERAGE: CoverageTable<keyof ViewAtlasState['objects']> = {
  tokens: SENT,
  fog: SENT,
  texts: SENT,
  drawings: SENT,
  pins: gmOnly('note pins link GM notes; the player window hides them'),
  walls: LIGHTING,
  lights: LIGHTING,
  lightZones: LIGHTING,
  audios: notYet('ambient audio (behind AMBIENT_AUDIO_ENABLED)'),
};

export const TOKEN_FIELD_COVERAGE: CoverageTable<KeysOfUnion<TokenEntity>> = {
  id: SENT,
  kind: SENT,
  x: SENT,
  y: SENT,
  imagePath: SENT,
  size: SENT,
  rotation: SENT,
  layer: SENT,
  showRing: SENT,
  ringColor: SENT,
  conditions: SENT,
  conditionValues: SENT,
  isHidden: SENT,
  name: SENT,
  statblockPath: SENT,
  statblockName: SENT,
  resources: TOKEN_RESOURCES,
  overriddenMax: gmOnly('records which maximums the GM set by hand'),
  showNameplate: gmOnly('players see nameplates by the Show nameplates player view setting, as in the player window'),
  tags: gmOnly('tags organise the GM\'s tokens'),
  notePath: gmOnly('note links stay on the GM\'s machine'),
  difficulty: gmOnly('the statblock rating is shown to the GM only'),
  playerLinked: LOCAL_PLAYER_LINK,
  playerId: LOCAL_PLAYER_LINK,
  playerCharacterId: LOCAL_PLAYER_LINK,
  vision: LIGHTING,
  light: LIGHTING,
  side: INITIATIVE_SIDES,
  instanceNumber: notYet('instance badges, with the scene\'s Show instance badges setting (a later piece)'),
};

export const TEXT_FIELD_COVERAGE: CoverageTable<keyof TextElement> = {
  id: SENT,
  kind: KIND,
  x: SENT,
  y: SENT,
  text: SENT,
  fontSize: SENT,
  fontFamily: SENT,
  color: SENT,
  backgroundColor: SENT,
  padding: SENT,
  borderRadius: SENT,
  opacity: SENT,
  width: SENT,
  height: SENT,
  align: SENT,
  bold: SENT,
  italic: SENT,
  rotation: SENT,
  scale: SENT,
};

export const DRAWING_FIELD_COVERAGE: CoverageTable<keyof DrawingStroke> = {
  id: SENT,
  kind: KIND,
  timestamp: SENT,
  type: SENT,
  points: SENT,
  color: SENT,
  width: SENT,
  opacity: SENT,
  icon: SENT,
};

export const FOG_FIELD_COVERAGE: CoverageTable<KeysOfUnion<FogOperation>> = {
  id: SENT,
  kind: KIND,
  timestamp: SENT,
  type: SENT,
  isErasing: SENT,
  offsetX: SENT,
  offsetY: SENT,
  points: SENT,
  brushRadius: SENT,
  x: SENT,
  y: SENT,
  width: SENT,
  height: SENT,
};

export const GRID_FIELD_COVERAGE: CoverageTable<keyof GridState> = {
  enabled: SENT,
  visible: SENT,
  type: SENT,
  size: SENT,
  offsetX: SENT,
  offsetY: SENT,
  color: SENT,
  opacity: SENT,
  lineType: SENT,
  lineWidth: SENT,
  hexNumbers: SENT,
  hexNumberOpacity: SENT,
  // Sent in the measurement, so the page's drag ruler snaps as the GM's tokens do.
  snapToGrid: SENT,
  scale: gmOnly('used while aligning the grid to the map'),
  mapScale: gmOnly('used while aligning the grid to the map'),
  autoDetect: gmOnly('a one-time request to align the grid on the first load'),
  // Without a collection, these decide the measurement players get.
  unitType: SENT,
  unitDistance: SENT,
  measurementType: SENT,
};

/** The store fields the projection reads (`sliceOf` in `sceneSources.ts` watches them, and those of `LIGHTING_STATE_COVERAGE`). */
export const SCENE_FIELD_COVERAGE: CoverageTable<keyof ProjectedState> = {
  background: SENT,
  grid: SENT,
  objects: SENT,
  widgetSettings: SENT,
  widgetValues: SENT,
  initiative: SENT,
  initiativeTrackerOpen: SENT,
};

/** The collection's measurement settings, which decide how the page labels distances (ruler, measure tool). */
export const MEASUREMENT_FIELD_COVERAGE: CoverageTable<keyof CollectionGridDefaults> = {
  unitType: SENT,
  unitDistance: SENT,
  measurementMode: SENT,
  abstractRangeBands: SENT,
  diagonalRule: SENT,
  coneAngle: notYet("the game system's cone angle (Atlas 0.5); players' cones open 90 degrees"),
};

/** The store fields the view's lighting reads besides `objects`. */
export type LightingStoreField = Extract<keyof ViewAtlasState, 'lighting' | 'exploredMask' | 'exploredEdits' | 'heldTokens'>;

/**
 * The store fields the view's lighting reads besides `objects`. `sliceOf` watches every one marked
 * `lighting` (`LIGHTING_SLICE_FIELDS`), so the table and what projects again cannot drift apart; a
 * new store field the lighting reads must be added here by hand (the store's saved state is untyped).
 */
export const LIGHTING_STATE_COVERAGE: CoverageTable<LightingStoreField> = {
  lighting: LIGHTING,
  // Players see the explored memory (undimmed) where the window shows it, as part of the darkness's outline.
  exploredMask: LIGHTING,
  exploredEdits: gmOnly('counts the edits of the explored memory by hand, for undo; the saved mask they lead to decides'),
  heldTokens: LIGHTING,
};

/** The fields of `LIGHTING_STATE_COVERAGE` that decide what players see. */
export const LIGHTING_SLICE_FIELDS: readonly LightingStoreField[] = (Object.keys(LIGHTING_STATE_COVERAGE) as LightingStoreField[])
  .filter((field) => LIGHTING_STATE_COVERAGE[field].status === 'lighting');

/** A map's token display settings (`tokenSettings`), saved with the map; the projection reads none of them yet. */
export const TOKEN_SETTINGS_COVERAGE: CoverageTable<keyof ViewAtlasState['tokenSettings']> = {
  showNameplates: gmOnly('players see nameplates by the Show nameplates player view setting, as in the player window'),
  hiddenResources: TOKEN_RESOURCES,
  showInstanceBadges: notYet('instance badges, with the Show instance badges setting (a later piece)'),
  tokenRingSize: notYet('the token ring size of the scene (a later piece); players draw rings at the default size'),
};

/** A scene's lighting options (`SceneLighting`). */
export const SCENE_LIGHTING_COVERAGE: CoverageTable<keyof SceneLighting> = {
  enabled: LIGHTING,
  ambient: LIGHTING,
  ambientColor: LIGHTING_LOOK,
  tokenVision: LIGHTING,
  exploredMemory: LIGHTING,
  exploredColor: LIGHTING_LOOK,
  unexploredColor: LIGHTING_LOOK,
  litThreshold: LIGHTING,
  sightOnDrop: LIGHTING,
  brightThreshold: LIGHTING,
  darkSightLook: LIGHTING_LOOK,
  darkSightTint: LIGHTING_LOOK,
};

export const INITIATIVE_COVERAGE: CoverageTable<keyof InitiativeState> = {
  entries: SENT,
  currentIndex: gmOnly('the cursor of the tracker; players see whose turn it is by isActive on each entry'),
  round: SENT,
  isActive: SENT,
  config: gmOnly('how the tracker of the GM sorts'),
  sides: INITIATIVE_SIDES,
};

export const INITIATIVE_ENTRY_COVERAGE: CoverageTable<keyof InitiativeEntry> = {
  id: SENT,
  tokenId: SENT,
  name: SENT,
  initiative: SENT,
  initiativeModifier: gmOnly('the statblock modifier the GM rolls with'),
  imagePath: gmOnly('players see the image of the token itself, by its id'),
  statblockPath: gmOnly('note links stay on the GM\'s machine'),
  isActive: SENT,
  isNPC: gmOnly('players see every entry alike'),
  order: SENT,
  sitsOut: INITIATIVE_SIDES,
};
