/**
 * Every field the coverage tables mark `sent` comes back out of the converter: Atlas state →
 * the GM's real projection → `playerSceneToAtlasState`. A field added to a table as `sent`
 * without a check here fails.
 */
import { describe, expect, it } from 'vitest';
import {
  DRAWING_FIELD_COVERAGE, FOG_FIELD_COVERAGE, GRID_FIELD_COVERAGE, MEASUREMENT_FIELD_COVERAGE, OBJECT_COVERAGE,
  RESOURCE_DEFINITION_COVERAGE, SCENE_FIELD_COVERAGE, TEXT_FIELD_COVERAGE, TOKEN_FIELD_COVERAGE, type Coverage, type CoverageTable, type KeysOfUnion,
} from '../../../../src/app/online/coverage';
import { playerSceneToAtlasState, type RemoteSceneParts } from '../../../../src/app/online/obsidian/playerSceneToAtlasState';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { projectForPlayers, type ProjectedState } from '../../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../../src/app/online/scene/projectRecords';
import type { PlayerScene } from '../../../../src/app/online/scene/sceneTypes';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import type { GridState } from '../../../../src/app/services/MapPersistence';
import type { Character, DrawingStroke, TextElement, Token, TokenEntity } from '../../../../src/app/types';
import type { CollectionGridDefaults } from '../../../../src/app/types/collectionSettingsTypes';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { createDefaultInitiativeState } from '../../../../src/app/types/initiativeTypes';
import type { AnyWidget } from '../../../../src/app/types/widgetTypes';
import { coverageOfFog, fakeAssetIds } from '../sceneFixtures';

const IMAGES: RemoteImages = {
  background: (id) => (id ? `blob:map/${id}` : null),
  token: (id) => (id ? `blob:token/${id}` : null),
};

const hero: Character = {
  id: 'hero', kind: 'character', x: 140, y: 210, imagePath: 'art/hero.png', size: 2, rotation: 45, layer: 3,
  showRing: true, ringColor: '#3366ff', conditions: ['prone', 'frightened'], conditionValues: { frightened: 2 },
  name: 'Anna', resources: { hp: { current: 7, max: 10 }, stress: { current: 2, max: 6 }, mana: { current: 1, max: 2 } },
  statblockPath: 'Bestiary/Anna.md', statblockName: 'Anna (statblock)', notePath: 'GM/anna.md', tags: ['pc'],
};
const goblin: Character = { id: 'goblin', kind: 'character', x: 350, y: 70, imagePath: 'art/goblin.png', name: '', statblockPath: 'Bestiary/Goblin.md', statblockName: 'Goblin' };
const imp: Character = { id: 'imp', kind: 'character', x: 560, y: 70, imagePath: 'art/imp.png', name: '', statblockPath: 'Bestiary/Imp.md' };
const crate: Token = { id: 'crate', kind: 'token', x: 420, y: 70, imagePath: 'art/crate.png', showRing: false };
// Spent hit points, drawn red and darkened, and a resource players never see that downs its token
const fallen: Character = { id: 'fallen', kind: 'character', x: 630, y: 70, imagePath: 'art/fallen.png', name: 'Fallen', resources: { hp: { current: 0, max: 10 } } };
const ghoul: Character = { id: 'ghoul', kind: 'character', x: 700, y: 70, imagePath: 'art/ghoul.png', name: 'Ghoul', resources: { doom: { current: 0, max: 5 } } };
const spy: Character = { id: 'spy', kind: 'character', x: 490, y: 70, imagePath: 'art/spy.png', name: 'Spy', isHidden: true };

const sign: TextElement = {
  id: 'sign', kind: 'text', x: 50, y: 60, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#112233',
  backgroundColor: '#ffffff', padding: 4, borderRadius: 2, opacity: 0.9, width: 120, height: 40, align: 'left',
  bold: true, italic: true, rotation: 10, scale: 1.5,
};
const line: DrawingStroke = {
  id: 'line', kind: 'drawing', timestamp: 5, type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 30, y: 90 }],
  color: '#ff0000', width: 4, opacity: 0.8,
};
const stamp: DrawingStroke = { id: 'stamp', kind: 'drawing', timestamp: 6, type: 'icon', points: [{ x: 200, y: 200 }], color: '#00ff00', width: 40, opacity: 1, icon: 'skull' };
const brush: FogOperation = {
  id: 'brush', kind: 'fog', type: 'brush', timestamp: 1, isErasing: true, offsetX: 10, offsetY: 20, brushRadius: 30,
  points: [{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 120, y: 260 }],
};
const lasso: FogOperation = { id: 'lasso', kind: 'fog', type: 'lasso', timestamp: 2, isErasing: true, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }] };
// Painted far from everything, so it hides nothing the checks look at.
const rect: FogOperation = { id: 'rect', kind: 'fog', type: 'rectangle', timestamp: 3, isErasing: false, x: 2000, y: 2000, width: 100, height: 50 };

/** HP (first bar), stress (second bar), a wheel and a resource players never see that defeats a token when spent. */
const DEFINITIONS: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: true, slot: 0 },
  { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#a855f7', visibleToPlayers: true, slot: 1 },
  { key: 'mana', name: 'Mana', field: 'mana', direction: 'drains', color: '#3b82f6', visibleToPlayers: true, slot: 2 },
  { key: 'doom', name: 'Doom', field: 'doom', direction: 'drains', color: '#111111', defeatedWhenSpent: true, visibleToPlayers: false, slot: 3 },
];
const GM_GRID: GridState = {
  enabled: true, visible: true, snapToGrid: false, type: 'hex-vertical', size: 70, offsetX: 5, offsetY: 7, color: '#222222',
  opacity: 0.4, lineType: 'dashed', lineWidth: 2, hexNumbers: 'column-row', hexNumberOpacity: 0.6,
  unitType: 'meters', unitDistance: 1.5, measurementType: 'units', scale: 1, mapScale: 1, autoDetect: false,
};
const COLLECTION: CollectionGridDefaults = {
  unitType: 'yards', unitDistance: 2, measurementMode: 'abstract', abstractRangeBands: [{ name: 'Close', maxSquares: 2 }], diagonalRule: 'alternating', coneAngle: 53.13,
};
const WIDGETS: Record<string, AnyWidget> = {
  torches: { id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', visible: true, visibleToPlayers: true, value: 0, order: 0 },
  doom: { id: 'doom', type: 'clock', label: 'Doom', icon: 'skull', visible: true, visibleToPlayers: true, value: 0, order: 1, segments: 6 },
  fuse: { id: 'fuse', type: 'timer', label: 'Fuse', icon: 'hourglass', visible: true, visibleToPlayers: true, value: 90, order: 2, duration: 120, direction: 'down' },
  secret: { id: 'secret', type: 'counter', label: 'Secret', icon: 'star', visible: true, visibleToPlayers: false, value: 1, order: 3 },
};

interface Variant { collection?: CollectionGridDefaults | null; grid?: GridState; trackerOpen?: boolean; definitions?: readonly ResourceDefinition[] }
interface Trip { back: RemoteSceneParts; sent: PlayerScene }
interface Trips { full: Trip; noCollection: Trip; disabledGrid: Trip; hiddenGrid: Trip; closedTracker: Trip; renamedHp: Trip; staticHp: Trip }
type Check = (trips: Trips) => void;
type Checks<K extends PropertyKey> = { readonly [P in K]?: Check };

function trip({ collection = COLLECTION, grid = GM_GRID, trackerOpen = true, definitions = DEFINITIONS }: Variant = {}): Trip {
  const fog = { brush, lasso, rect };
  const state: ProjectedState = {
    background: 'atlas-vtt/assets/tavern.png',
    grid,
    objects: {
      tokens: { hero, goblin, imp, crate, fallen, ghoul, spy }, fog, texts: { sign }, drawings: { line, stamp },
      pins: {}, walls: {}, lights: {}, audios: {},
    },
    widgetSettings: { widgets: WIDGETS, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: { torches: 3, doom: 2 },
    initiative: {
      ...createDefaultInitiativeState(), isActive: true, round: 2,
      entries: [{
        id: 'e1', tokenId: 'hero', name: 'Anna', initiative: 17, initiativeModifier: 2,
        imagePath: 'art/hero.png', isActive: true, isNPC: false, order: 0,
      }],
    },
    initiativeTrackerOpen: trackerOpen,
  };
  const sent = projectForPlayers(state, {
    sceneId: 'scene-1',
    rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
    coverage: coverageOfFog(fog), assets: fakeAssetIds(), mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(),
    collectionGrid: collection, resources: definitions,
  });
  return { back: playerSceneToAtlasState(sent, IMAGES), sent };
}

const TRIPS: Trips = {
  full: trip(),
  noCollection: trip({ collection: null }),
  disabledGrid: trip({ grid: { ...GM_GRID, enabled: false } }),
  hiddenGrid: trip({ grid: { ...GM_GRID, visible: false } }),
  closedTracker: trip({ trackerOpen: false }),
  renamedHp: trip({ definitions: DEFINITIONS.map((definition) => (definition.key === 'hp' ? { ...definition, key: 'health' } : definition)) }),
  staticHp: trip({ definitions: DEFINITIONS.map((definition) => (definition.key === 'hp' ? { ...definition, direction: 'static' as const } : definition)) }),
};

const tokenOf = (t: Trip, id: string): Record<string, unknown> => t.back.state.objects.tokens[id] as unknown as Record<string, unknown>;
const field = (id: string, key: string, value: unknown): Check => (t) => expect(tokenOf(t.full, id)[key]).toEqual(value);

const TOKEN_CHECKS: Checks<KeysOfUnion<TokenEntity>> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.tokens).sort()).toEqual(['crate', 'fallen', 'ghoul', 'goblin', 'hero', 'imp']),
  kind: (t) => {
    expect(tokenOf(t.full, 'hero').kind).toBe('character');
    expect(tokenOf(t.full, 'crate').kind).toBe('token');
  },
  x: field('hero', 'x', 140),
  y: field('hero', 'y', 210),
  imagePath: (t) => expect(tokenOf(t.full, 'hero').imagePath).toBe(IMAGES.token(t.full.sent.tokens.hero?.image ?? null)),
  size: field('hero', 'size', 2),
  rotation: field('hero', 'rotation', 45),
  layer: field('hero', 'layer', 3),
  showRing: (t) => {
    expect(tokenOf(t.full, 'hero').showRing).toBe(true);
    expect(tokenOf(t.full, 'crate').showRing).toBe(false);
  },
  ringColor: field('hero', 'ringColor', '#3366ff'),
  conditions: field('hero', 'conditions', ['prone', 'frightened']),
  conditionValues: field('hero', 'conditionValues', { frightened: 2 }),
  isHidden: (t) => {
    expect(t.full.back.state.objects.tokens).not.toHaveProperty('spy');
    for (const token of Object.values(t.full.back.state.objects.tokens)) expect(token).not.toHaveProperty('isHidden');
  },
  name: field('hero', 'name', 'Anna'),
  statblockPath: (t) => {
    expect(tokenOf(t.full, 'imp').name).toBe('Unknown Creature');
    for (const token of Object.values(t.full.back.state.objects.tokens)) expect(token).not.toHaveProperty('statblockPath');
  },
  statblockName: field('goblin', 'name', 'Goblin'),
  // The two first resources are bars, filled to their share out of 100 and drawn from stand-in definitions of the colour the window shows
  resources: (t) => {
    expect(tokenOf(t.full, 'hero').resources).toEqual({ bar0: { current: 70, max: 100 }, bar1: { current: 33, max: 100 }, downed: { current: 1, max: 1 } });
    expect(t.full.back.resources.hero).toEqual([
      expect.objectContaining({ key: 'bar0', color: '#22c55e', direction: 'drains', slot: 0, visibleToPlayers: true }),
      expect.objectContaining({ key: 'bar1', color: '#a855f7', slot: 1, visibleToPlayers: true }),
      expect.objectContaining({ key: 'downed', defeatedWhenSpent: true }),
    ]);
    expect(tokenOf(t.full, 'crate')).not.toHaveProperty('resources');
    // A spent HP bar is darkened by Atlas and red; the downed state rides on a resource players never see
    expect(tokenOf(t.full, 'fallen').resources).toEqual({ bar0: { current: 0, max: 100 }, downed: { current: 0, max: 1 } });
    expect(t.full.back.resources.fallen?.[0]).toMatchObject({ key: 'bar0', defeatedWhenSpent: true, direction: 'drains' });
    expect(t.full.back.resources.ghoul).toEqual([expect.objectContaining({ key: 'downed', visibleToPlayers: false, defeatedWhenSpent: true })]);
    expect(tokenOf(t.full, 'ghoul').resources).toEqual({ downed: { current: 0, max: 1 } });
  },
};

/** What each definition field decides, seen on the Atlas store the online scene draws. */
const RESOURCE_CHECKS: Checks<keyof ResourceDefinition> = {
  key: (t) => {
    expect(Object.keys(tokenOf(t.renamedHp, 'hero').resources as object)).toEqual(['bar0', 'downed']);
    expect(t.renamedHp.back.initiativeHealth).toEqual({});
  },
  direction: (t) => expect(tokenOf(t.staticHp, 'hero').resources).toMatchObject({ bar0: { current: 100, max: 100 } }),
  color: (t) => expect(t.full.back.resources.hero?.slice(0, 2).map((definition) => definition.color)).toEqual(['#22c55e', '#a855f7']),
  defeatedWhenSpent: (t) => {
    expect(t.full.back.resources.fallen?.[0]?.color).toBe('#ef4444');
    expect(t.full.back.resources.hero?.[0]).not.toHaveProperty('defeatedWhenSpent');
  },
  visibleToPlayers: (t) => expect(Object.keys(tokenOf(t.full, 'hero').resources as object)).not.toContain('bar3'),
  // A resource in a wheel socket is not drawn for players: the window has no wheels for them
  slot: (t) => expect(Object.keys(tokenOf(t.full, 'hero').resources as object)).toEqual(['bar0', 'bar1', 'downed']),
};

const TEXT_SAME = [
  'id', 'x', 'y', 'text', 'fontSize', 'fontFamily', 'color', 'backgroundColor', 'padding', 'borderRadius', 'opacity',
  'width', 'height', 'align', 'bold', 'italic', 'rotation', 'scale',
] as const satisfies ReadonlyArray<keyof TextElement>;
const TEXT_CHECKS: Checks<keyof TextElement> = Object.fromEntries(TEXT_SAME.map((key) => [
  key, ((t) => expect(t.full.back.state.objects.texts.sign?.[key]).toEqual(sign[key])) satisfies Check,
]));

const DRAWING_CHECKS: Checks<keyof DrawingStroke> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.drawings).sort()).toEqual(['line', 'stamp']),
  timestamp: (t) => expect(t.full.back.state.objects.drawings.line?.timestamp).toBe(5),
  type: (t) => expect(t.full.back.state.objects.drawings.stamp?.type).toBe('icon'),
  points: (t) => expect(t.full.back.state.objects.drawings.line?.points).toEqual(line.points),
  color: (t) => expect(t.full.back.state.objects.drawings.line?.color).toBe('#ff0000'),
  width: (t) => expect(t.full.back.state.objects.drawings.line?.width).toBe(4),
  opacity: (t) => expect(t.full.back.state.objects.drawings.line?.opacity).toBe(0.8),
  icon: (t) => {
    expect(t.full.back.state.objects.drawings.stamp?.icon).toBe('skull');
    expect(t.full.back.state.objects.drawings.line).not.toHaveProperty('icon');
  },
};

const FOG_CHECKS: Checks<KeysOfUnion<FogOperation>> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.fog).sort()).toEqual(['brush', 'lasso', 'rect']),
  timestamp: (t) => expect(t.full.back.state.objects.fog.lasso?.timestamp).toBe(2),
  type: (t) => expect(t.full.back.state.objects.fog.rect?.type).toBe('rectangle'),
  isErasing: (t) => {
    expect(t.full.back.state.objects.fog.brush?.isErasing).toBe(true);
    expect(t.full.back.state.objects.fog.rect?.isErasing).toBe(false);
  },
  // The GM applies the drag offset before sending, so the points moved and no offset is left.
  offsetX: (t) => {
    expect(t.full.back.state.objects.fog.brush).toMatchObject({ points: [{ x: 110, y: 120 }, { x: 210, y: 170 }, { x: 130, y: 280 }] });
    expect(t.full.back.state.objects.fog.brush).not.toHaveProperty('offsetX');
  },
  offsetY: (t) => expect(t.full.back.state.objects.fog.brush).not.toHaveProperty('offsetY'),
  points: (t) => expect(t.full.back.state.objects.fog.lasso).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }] }),
  brushRadius: (t) => expect(t.full.back.state.objects.fog.brush).toMatchObject({ brushRadius: 30 }),
  x: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ x: 2000 }),
  y: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ y: 2000 }),
  width: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ width: 100 }),
  height: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ height: 50 }),
};

const gridOf = (t: Trip): GridState | null => t.back.state.grid;
const GRID_CHECKS: Checks<keyof GridState> = {
  enabled: (t) => {
    expect(gridOf(t.full)?.visible).toBe(true);
    expect(gridOf(t.disabledGrid)?.visible).toBe(false);
  },
  visible: (t) => expect(gridOf(t.hiddenGrid)?.visible).toBe(false),
  type: (t) => expect(gridOf(t.full)?.type).toBe('hex-vertical'),
  size: (t) => expect(gridOf(t.full)?.size).toBe(70),
  offsetX: (t) => expect(gridOf(t.full)?.offsetX).toBe(5),
  offsetY: (t) => expect(gridOf(t.full)?.offsetY).toBe(7),
  color: (t) => expect(gridOf(t.full)?.color).toBe('#222222'),
  opacity: (t) => expect(gridOf(t.full)?.opacity).toBe(0.4),
  lineType: (t) => expect(gridOf(t.full)?.lineType).toBe('dashed'),
  lineWidth: (t) => expect(gridOf(t.full)?.lineWidth).toBe(2),
  hexNumbers: (t) => expect(gridOf(t.full)?.hexNumbers).toBe('column-row'),
  hexNumberOpacity: (t) => expect(gridOf(t.full)?.hexNumberOpacity).toBe(0.6),
  snapToGrid: (t) => expect(gridOf(t.full)?.snapToGrid).toBe(false),
  // Without a collection, the map's grid decides the measurement.
  unitType: (t) => {
    expect(t.noCollection.back.measurement.unitType).toBe('meters');
    expect(gridOf(t.noCollection)?.unitType).toBe('meters');
  },
  unitDistance: (t) => expect(t.noCollection.back.measurement.unitDistance).toBe(1.5),
  measurementType: (t) => expect(t.noCollection.back.measurement.mode).toBe('metric'),
};

const MEASUREMENT_CHECKS: Checks<keyof CollectionGridDefaults> = {
  unitType: (t) => expect(t.full.back.measurement.unitType).toBe('yards'),
  unitDistance: (t) => expect(t.full.back.measurement.unitDistance).toBe(2),
  measurementMode: (t) => expect(t.full.back.measurement.mode).toBe('abstract'),
  abstractRangeBands: (t) => expect(t.full.back.measurement.rangeBands).toEqual([{ name: 'Close', maxSquares: 2 }]),
  diagonalRule: (t) => expect(t.full.back.measurement.diagonalRule).toBe('alternating'),
  coneAngle: (t) => expect(t.full.back.measurement.coneAngle).toBe(53.13),
};

const SCENE_CHECKS: Checks<keyof ProjectedState> = {
  background: (t) => {
    expect(t.full.back.state.background).toBe(IMAGES.background(t.full.sent.map.asset));
    expect(t.full.back.state.background).not.toBeNull();
  },
  grid: (t) => expect(gridOf(t.full)).toMatchObject({ enabled: true, visible: true }),
  objects: (t) => expect(Object.keys(t.full.back.state.objects.tokens)).toHaveLength(6),
  widgetSettings: (t) => {
    expect(Object.keys(t.full.back.state.widgetSettings.widgets)).toEqual(['torches', 'doom', 'fuse']);
    expect(t.full.back.state.widgetSettings.widgets.fuse).toMatchObject({ type: 'timer', value: 90 });
  },
  widgetValues: (t) => expect(t.full.back.state.widgetValues).toEqual({ torches: 3, doom: 2 }),
  initiative: (t) => {
    expect(t.full.back.state.initiative).toMatchObject({ round: 2, isActive: true });
    expect(t.full.back.state.initiative.entries).toMatchObject([
      { tokenId: 'hero', initiative: 17, name: 'Anna', isActive: true, imagePath: tokenOf(t.full, 'hero').imagePath },
    ]);
    // The bar after the name is the token's hp resource, at its share
    expect(t.full.back.initiativeHealth).toEqual({ hero: { current: 70, max: 100 } });
  },
  initiativeTrackerOpen: (t) => {
    expect(t.full.back.state.initiativeTrackerOpen).toBe(true);
    expect(t.closedTracker.back.state.initiativeTrackerOpen).toBe(false);
  },
};

const OBJECT_CHECKS: Checks<keyof typeof OBJECT_COVERAGE> = {
  tokens: (t) => expect(Object.keys(t.full.back.state.objects.tokens).length).toBeGreaterThan(0),
  fog: (t) => expect(Object.keys(t.full.back.state.objects.fog).length).toBeGreaterThan(0),
  texts: (t) => expect(Object.keys(t.full.back.state.objects.texts).length).toBeGreaterThan(0),
  drawings: (t) => expect(Object.keys(t.full.back.state.objects.drawings).length).toBeGreaterThan(0),
};

function everySentField<K extends PropertyKey>(name: string, table: CoverageTable<K>, checks: Checks<K>): void {
  for (const [key, coverage] of Object.entries(table) as Array<[K, Coverage]>) {
    if (coverage.status !== 'sent' && coverage.status !== 'used') continue;
    const check = checks[key];
    expect(check, `${name}.${String(key)} is sent but has no round trip check`).toBeDefined();
    check?.(TRIPS);
  }
}

describe('the converter covers every sent field', () => {
  it('object kinds', () => everySentField('OBJECT_COVERAGE', OBJECT_COVERAGE, OBJECT_CHECKS));
  it('token fields', () => everySentField('TOKEN_FIELD_COVERAGE', TOKEN_FIELD_COVERAGE, TOKEN_CHECKS));
  it('text fields', () => everySentField('TEXT_FIELD_COVERAGE', TEXT_FIELD_COVERAGE, TEXT_CHECKS));
  it('drawing fields', () => everySentField('DRAWING_FIELD_COVERAGE', DRAWING_FIELD_COVERAGE, DRAWING_CHECKS));
  it('fog fields', () => everySentField('FOG_FIELD_COVERAGE', FOG_FIELD_COVERAGE, FOG_CHECKS));
  it('grid fields', () => everySentField('GRID_FIELD_COVERAGE', GRID_FIELD_COVERAGE, GRID_CHECKS));
  it('resource definition fields', () => everySentField('RESOURCE_DEFINITION_COVERAGE', RESOURCE_DEFINITION_COVERAGE, RESOURCE_CHECKS));
  it('measurement fields', () => everySentField('MEASUREMENT_FIELD_COVERAGE', MEASUREMENT_FIELD_COVERAGE, MEASUREMENT_CHECKS));
  it('scene fields', () => everySentField('SCENE_FIELD_COVERAGE', SCENE_FIELD_COVERAGE, SCENE_CHECKS));

  it('keeps GM-only token fields out of the store', () => {
    const back = TRIPS.full.back.state.objects.tokens.hero;
    for (const key of ['notePath', 'tags', 'statblockPath', 'statblockName', 'isHidden', 'difficulty', 'playerId']) expect(back).not.toHaveProperty(key);
  });
});
