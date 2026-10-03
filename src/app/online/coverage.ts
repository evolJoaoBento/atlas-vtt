/**
 * What online players receive of every Atlas map object and field. The tables are
 * records over Atlas's own types, so a new object kind or field fails the build
 * until it is recorded here (see `docs/online-play-features.md`).
 *
 * - `sent`: changes what players receive: the value itself, or what it decides
 *   (a hidden token never reaches players).
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
import type { ProjectedState } from './scene/projectForPlayers';

export type Coverage =
  | { readonly status: 'sent' }
  | { readonly status: 'gm-only'; readonly reason: string }
  | { readonly status: 'not-yet'; readonly piece: string };

export type CoverageTable<K extends PropertyKey> = Readonly<Record<K, Coverage>>;

/** Every key of every member of a union; `keyof` of a union keeps only the shared ones. */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never;

const SENT: Coverage = { status: 'sent' };
const gmOnly = (reason: string): Coverage => ({ status: 'gm-only', reason });
const notYet = (piece: string): Coverage => ({ status: 'not-yet', piece });

const KIND = gmOnly('the record kind; players get each kind in its own list');
const DYNAMIC_LIGHTING = notYet('dynamic lighting and vision (an experimental feature since Atlas 0.5)');
const TOKEN_RESOURCES = notYet('token resources (Atlas 0.5), shown to players by their visibleToPlayers');
const LOCAL_PLAYER_LINK = gmOnly('links the token to a local player character, not to an online player');

export const OBJECT_COVERAGE: CoverageTable<keyof ViewAtlasState['objects']> = {
  tokens: SENT,
  fog: SENT,
  texts: SENT,
  drawings: SENT,
  pins: gmOnly('note pins link GM notes; the player window hides them'),
  walls: DYNAMIC_LIGHTING,
  lights: DYNAMIC_LIGHTING,
  lightZones: DYNAMIC_LIGHTING,
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
  vision: DYNAMIC_LIGHTING,
  light: DYNAMIC_LIGHTING,
  side: notYet('initiative by sides (Atlas 0.5)'),
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

/** The store fields the projection reads (`sliceOf` in `sceneSources.ts` watches the same ones). */
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
