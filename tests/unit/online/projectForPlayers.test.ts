import { describe, expect, it } from 'vitest';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';
import type { Character, Token } from '../../../src/app/types';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import { createDefaultInitiativeState } from '../../../src/app/types/initiativeTypes';
import { decodeControl, encodeControl } from '../../../src/app/online/protocol';
import { isDrawingRecords, isFogRecords, isPlayerSceneBody } from '../../../src/app/online/scene/sceneValidation';
import { fakeAssetIds } from './sceneFixtures';
import { FogCoverage } from '../../../src/app/online/scene/FogCoverage';
import type { PlayerViewRules } from '../../../src/app/online/scene/playerViewRules';
import { projectForPlayers, type ProjectedState, type ProjectionContext } from '../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../src/app/online/scene/projectRecords';
import { coverageOfFog } from './sceneFixtures';

const ALL_ON: PlayerViewRules = { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true };
const ALL_OFF: PlayerViewRules = { showGrid: false, showTokenNameplates: false, showWidgets: false, showInitiative: false };
/** HP (a bar that defeats the token) and stress (a second bar), both shown to players, as a collection with the two sets them up. */
const DEFINITIONS: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: true },
  { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#a855f7', visibleToPlayers: true },
];

function gmState(overrides: Partial<ProjectedState> = {}): ProjectedState {
  return {
    background: 'atlas-vtt/assets/lair.png',
    grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1 },
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
    ...overrides,
  };
}
function withTokens(tokens: Record<string, Token | Character>, extra: Partial<ProjectedState['objects']> = {}): ProjectedState {
  const state = gmState();
  return { ...state, objects: { ...state.objects, tokens, ...extra } };
}
function context(overrides: Partial<ProjectionContext> = {}): ProjectionContext {
  return {
    sceneId: 'scene-1', rules: ALL_ON, coverage: FogCoverage.EMPTY, assets: fakeAssetIds(),
    mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(), resources: DEFINITIONS, ...overrides,
  };
}
function hero(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero', kind: 'character', x: 140, y: 140, imagePath: 'atlas-vtt/assets/hero.png', name: 'Anna',
    resources: { hp: { current: 7, max: 10 }, stress: { current: 2, max: 6 } }, ringColor: '#3366ff', conditions: ['prone'], ...overrides,
  };
}
const fogOver = (x: number, y: number, width: number, height: number): FogCoverage => coverageOfFog({
  f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x, y, width, height } satisfies FogOperation,
});

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, into));
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      keysOf(item, into);
    }
  }
  return into;
}

describe('projectForPlayers', () => {
  it('sends visible tokens with the fields players may see', () => {
    const scene = projectForPlayers(withTokens({ hero: hero() }), context());
    expect(scene.tokens.hero).toEqual({
      x: 140, y: 140, size: 1, rotation: 0, layer: 0, image: expect.any(String), ring: '#3366ff',
      conditions: [{ id: 'prone', value: null }], name: 'Anna', hp: null, stress: null,
      resources: [{ color: '#22c55e', share: 0.7, spent: false }, { color: '#a855f7', share: 0.33, spent: false }], downed: false,
    });
    expect(scene.tokens.hero?.image).not.toContain('hero');
  });

  it('drops hidden tokens', () => {
    const scene = projectForPlayers(withTokens({ hero: hero(), ghost: hero({ id: 'ghost', isHidden: true }) }), context());
    expect(Object.keys(scene.tokens)).toEqual(['hero']);
  });

  it('follows the name setting', () => {
    const scene = projectForPlayers(withTokens({ hero: hero() }), context({ rules: ALL_OFF }));
    expect(scene.tokens.hero?.name).toBeNull();
    const statblock = projectForPlayers(withTokens({ hero: hero({ name: '', statblockName: 'Goblin boss', statblockPath: 'b.md' }) }), context());
    expect(statblock.tokens.hero?.name).toBe('Goblin boss');
  });

  it('never gives a plain token a name or bars, and drops a hidden ring', () => {
    const plain: Token = { id: 'rock', kind: 'token', x: 0, y: 0, imagePath: 'rock.png', showRing: false };
    expect(projectForPlayers(withTokens({ rock: plain }), context()).tokens.rock).toMatchObject({ name: null, resources: [], downed: false, ring: null });
    const white: Token = { id: 'rock', kind: 'token', x: 0, y: 0, imagePath: 'rock.png' };
    expect(projectForPlayers(withTokens({ rock: white }), context()).tokens.rock?.ring).toBe('#ffffff');
  });

  it('drops a token completely under fog and sends one half under it', () => {
    const coverage = fogOver(0, 0, 500, 500);
    const hiddenByFog = hero({ id: 'a', x: 200, y: 200 });
    const halfUnder = hero({ id: 'b', x: 500, y: 200 });
    const scene = projectForPlayers(withTokens({ a: hiddenByFog, b: halfUnder }), context({ coverage }));
    expect(Object.keys(scene.tokens)).toEqual(['b']);
  });

  it('gives each image one asset id and the map its size', () => {
    const assets = fakeAssetIds();
    const scene = projectForPlayers(withTokens({ hero: hero(), twin: hero({ id: 'twin' }) }), context({ assets }));
    expect(scene.tokens.twin?.image).toBe(scene.tokens.hero?.image);
    expect(scene.map).toEqual({ asset: assets.idFor('atlas-vtt/assets/lair.png'), width: 1000, height: 800, cellSize: 70 });
    const bare = projectForPlayers(gmState({ background: null, grid: null }), context({ mapSize: { width: 0, height: 0 } }));
    expect(bare.map).toEqual({ asset: null, width: 0, height: 0, cellSize: 70 });
  });

  it('sends the grid only when it is shown', () => {
    expect(projectForPlayers(gmState(), context()).grid).toEqual({
      type: 'square', size: 70, offsetX: 0, offsetY: 0, color: null, opacity: 0.5,
      lineType: 'solid', lineWidth: 1, hexNumbers: null, hexNumberOpacity: null,
    });
    expect(projectForPlayers(gmState(), context({ rules: { ...ALL_ON, showGrid: false } })).grid).toBeNull();
    const hidden = gmState({ grid: { enabled: true, visible: false, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } });
    expect(projectForPlayers(hidden, context()).grid).toBeNull();
    const off = gmState({ grid: { enabled: false, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } });
    expect(projectForPlayers(off, context()).grid).toBeNull();
    expect(projectForPlayers(hidden, context()).map.cellSize).toBe(70);
    const hex = gmState({ grid: { enabled: true, type: 'hex-vertical', size: 60, offsetX: 3, offsetY: 4, opacity: 1, hexNumbers: 'column-row' } });
    expect(projectForPlayers(hex, context()).grid).toMatchObject({ type: 'hex-vertical', size: 60, hexNumbers: 'column-row', hexNumberOpacity: 0.8 });
  });

  it('lists initiative only for tokens players receive', () => {
    const initiative = {
      ...createDefaultInitiativeState(),
      entries: [
        { id: 'e1', tokenId: 'hero', name: 'Anna', initiative: 15, initiativeModifier: 0, hp: { current: 7, max: 10 }, imagePath: '', isActive: false, isDefeated: false, isNPC: false, order: 0 },
        { id: 'e2', tokenId: 'ghost', name: 'Ghost', initiative: 9, initiativeModifier: 0, hp: { current: 1, max: 1 }, imagePath: '', isActive: false, isDefeated: false, isNPC: true, order: 1 },
      ],
    };
    const state = { ...withTokens({ hero: hero(), ghost: hero({ id: 'ghost', isHidden: true }) }), initiative, initiativeTrackerOpen: true };
    expect(projectForPlayers(state, context()).initiative?.entries.map((entry) => entry.tokenId)).toEqual(['hero']);
  });

  it('never sends a GM-only or unknown field', () => {
    const secretHero = {
      ...hero({
        notePath: 'SECRET/notes/villain.md', statblockPath: 'SECRET/bestiary/villain.md', statblockName: 'SECRET-statblock',
        tags: ['SECRET-tag'], playerLinked: true, playerId: 'SECRET-player', playerCharacterId: 'SECRET-character',
        hasVision: true, visionInnerRadius: 11, visionOuterRadius: 22, instanceNumber: 3, showNameplate: true,
        hope: 2, difficulty: 'SECRET-cr', maxHpOverridden: true, maxStressOverridden: true,
        statblockResources: { mana: { current: 1, max: 2 } }, conditionValues: { prone: 2 },
      }),
      futureField: 'SECRET-future',
    };
    const state = {
      ...gmState({ background: 'SECRET/maps/lair.png' }),
      objects: {
        tokens: { hero: secretHero, hidden: hero({ id: 'hidden', name: 'SECRET-hidden', isHidden: true }) },
        fog: { f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 900, y: 900, width: 5, height: 5, futureField: 'SECRET-future' } },
        pins: { p: { id: 'p', kind: 'pin', x: 1, y: 1, notePath: 'SECRET/pin.md', gmOnly: true, hex: true } },
        texts: { t: { id: 't', kind: 'text', x: 50, y: 50, text: 'Sign', fontSize: 12, fontFamily: 'serif', color: '#000000', futureField: 'SECRET-future' } },
        drawings: { d: { id: 'd', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 1, y: 1 }], color: '#000000', width: 2, opacity: 1, futureField: 'SECRET-future' } },
        walls: { w: { id: 'w', label: 'SECRET-wall' } },
        lights: { l: { id: 'l', label: 'SECRET-light' } },
        audios: { a: { id: 'a', filePath: 'SECRET/music.mp3' } },
      },
      widgetSettings: {
        widgets: {
          w1: { id: 'w1', type: 'counter', label: 'Torches', icon: 'flame', visible: true, visibleToPlayers: true, value: 1, order: 0, color: '#ff0000', futureField: 'SECRET-future' },
          w2: { id: 'w2', type: 'counter', label: 'SECRET-widget', icon: 'flame', visible: true, visibleToPlayers: false, value: 1, order: 1 },
        },
        globalVisible: true, position: 'top', scale: 1,
      },
      initiative: {
        ...createDefaultInitiativeState(),
        entries: [{
          id: 'e1', tokenId: 'hero', name: 'Anna', initiative: 15, initiativeModifier: 0, hp: { current: 7, max: 10 },
          stress: { current: 1, max: 6 }, imagePath: 'SECRET/art.png', statblockPath: 'SECRET/statblock.md',
          isActive: false, isDefeated: false, isNPC: false, order: 0, futureField: 'SECRET-future',
        }],
      },
      initiativeTrackerOpen: true,
      dmNotePath: 'SECRET/dm.md',
      diceLog: [{ formula: 'SECRET-roll' }],
      pinnedNotePreviews: { x: { notePath: 'SECRET/preview.md' } },
      lootRoller: { open: true, table: 'SECRET-loot' },
    } as unknown as ProjectedState;

    const scene = projectForPlayers(state, context());
    const json = JSON.stringify(scene);
    expect(json).not.toContain('SECRET');
    const neverSent = [
      'isHidden', 'notePath', 'statblockPath', 'statblockName', 'tags', 'playerLinked', 'playerId', 'playerCharacterId',
      'hasVision', 'visionInnerRadius', 'visionOuterRadius', 'instanceNumber', 'showNameplate', 'hope', 'difficulty',
      'maxHpOverridden', 'maxStressOverridden', 'statblockResources', 'conditionValues', 'imagePath', 'kind', 'futureField',
      'pins', 'gmOnly', 'hex', 'walls', 'lights', 'audios', 'dmNotePath', 'diceLog', 'pinnedNotePreviews', 'lootRoller',
      'visibleToPlayers', 'visible', 'initiativeModifier', 'isDefeated', 'isNPC', 'timestamp', 'offsetX', 'isErasing', 'overriddenMax', 'direction',
      'defeatedWhenSpent', 'field', 'key', 'slot', 'current', 'max',
    ];
    const keys = keysOf({ ...scene, grid: null, texts: {}, drawings: {} });
    for (const key of neverSent) expect(keys.has(key), key).toBe(false);
    expect(scene.initiative?.entries[0]).not.toHaveProperty('stress');
    expect(keysOf(scene.widgets).has('color')).toBe(false);
  });

  it('projects messy map data into messages players accept', () => {
    const messyHero = hero({ resources: { hp: { current: '7', max: '10' } } as unknown as Character['resources'], rotation: Number.NaN, size: -2 });
    const lost = hero({ id: 'lost', x: Number.NaN });
    const sneaky = { ...hero({ id: 'sneaky' }), isHidden: 1 } as unknown as Character;
    const state = {
      ...withTokens({ hero: messyHero, lost, sneaky }),
      grid: { enabled: true, size: 'big', offsetX: null, offsetY: 4, opacity: 7, lineType: 'wavy' },
      objects: {
        ...withTokens({ hero: messyHero, lost, sneaky }).objects,
        texts: { t: { id: 't', kind: 'text', x: 5, y: 5, text: null, fontFamily: 3, color: null } },
        drawings: { d: { id: 'd', kind: 'drawing', type: 'spray', points: [null, { x: 1, y: 'a' }, { x: 2, y: 2 }], width: -1 } },
        fog: { f: { id: 'f', kind: 'fog', type: 'brush', timestamp: 'late', isErasing: 1, points: [{ x: 0, y: 0 }], brushRadius: 'wide' } },
      },
      widgetSettings: { widgets: { w: { id: 'w', type: 'dial', label: 5, visible: true, visibleToPlayers: true, value: 'x', order: 0 } }, globalVisible: true, position: 'top', scale: 1 },
    } as unknown as ProjectedState;

    const scene = projectForPlayers(state, context());
    expect(Object.keys(scene.tokens)).toEqual(['hero']);
    expect(scene.tokens.hero).toMatchObject({ resources: [{ color: '#22c55e', share: 0.7, spent: false }], rotation: 0, size: 1 });
    const { fog, drawings, ...body } = scene;
    const snapshot = decodeControl(encodeControl({ v: 1, type: 'scene-snapshot', seq: 1, scene: body, fogParts: 1, drawingParts: 1 }));
    const fogPart = decodeControl(encodeControl({ v: 1, type: 'scene-fog', seq: 2, part: 0, records: fog }));
    const drawingPart = decodeControl(encodeControl({ v: 1, type: 'scene-drawings', seq: 3, part: 0, records: drawings }));
    expect(snapshot.kind).toBe('message');
    expect(fogPart.kind).toBe('message');
    expect(drawingPart.kind).toBe('message');
  });

  it("sends the measurement of the map's collection, or else of its grid", () => {
    const grid = { ...gmState().grid!, unitType: 'meters' as const, unitDistance: 1.5, measurementType: 'units' as const };
    expect(projectForPlayers(gmState({ grid }), context()).measurement).toEqual({
      mode: 'metric', unitType: 'meters', unitDistance: 1.5, diagonalRule: 'equidistant', rangeBands: [], snapToGrid: true,
    });
    expect(projectForPlayers(gmState({ grid: { ...grid, snapToGrid: false } }), context()).measurement.snapToGrid).toBe(false);
    const collectionGrid = {
      unitType: 'feet' as const, unitDistance: 5, measurementMode: 'abstract' as const, diagonalRule: 'alternating' as const,
      abstractRangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'x'.repeat(300), maxSquares: Number.NaN }],
    };
    expect(projectForPlayers(gmState({ grid }), context({ collectionGrid })).measurement).toEqual({
      mode: 'abstract', unitType: 'feet', unitDistance: 5, diagonalRule: 'alternating', snapToGrid: true,
      rangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'x'.repeat(128), maxSquares: 1 }],
    });
  });
});

describe('projectForPlayers out-of-range numbers', () => {
  it('clamps wire numbers so the scene passes the player validator', () => {
    const far = hero({ id: 'far', x: 1e12, y: 5, size: 1e6 });
    const state = {
      ...withTokens({ far }),
      grid: { enabled: true, size: 1e9, offsetX: 1e12, offsetY: -1e12, opacity: 1, lineWidth: 1e9 },
    } as unknown as ProjectedState;
    const scene = projectForPlayers(state, context({ mapSize: { width: 1e9, height: 1e9 } }));
    const { fog, drawings, ...body } = scene;
    expect(scene.tokens.far).toMatchObject({ x: 10_000_000, size: 100 });
    expect(isPlayerSceneBody(body)).toBe(true);
    expect(isFogRecords(fog)).toBe(true);
    expect(isDrawingRecords(drawings)).toBe(true);
  });

  it('decides coverage on the raw position, not the clamped one', () => {
    const far = hero({ id: 'far', x: 1e12, y: 5 });
    const covered = coverageOfFog({
      f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 0, y: 0, width: 500, height: 500 } satisfies FogOperation,
    });
    // Clamped x (1e7) is still far from the fog, and so is the raw x: kept either way.
    expect(Object.keys(projectForPlayers(withTokens({ far }), context({ coverage: covered })).tokens)).toEqual(['far']);
  });
});

describe('projectForPlayers fix round 1', () => {
  it('names from the statblock only when one is linked', () => {
    const unlinked = hero({ name: '', statblockName: 'Goblin boss' });
    expect(projectForPlayers(withTokens({ hero: unlinked }), context()).tokens.hero?.name).toBeNull();
    const linked = hero({ name: '', statblockPath: 'b.md' });
    expect(projectForPlayers(withTokens({ hero: linked }), context()).tokens.hero?.name).toBe('Unknown Creature');
  });

  it('sends no conditions for plain tokens', () => {
    const plain = { id: 'rock', kind: 'token', x: 0, y: 0, imagePath: 'rock.png', conditions: ['prone'] } as unknown as Token;
    expect(projectForPlayers(withTokens({ rock: plain }), context()).tokens.rock?.conditions).toEqual([]);
  });

  it('drops the initiative entry of a fogged token', () => {
    const initiative = {
      ...createDefaultInitiativeState(),
      entries: [
        { id: 'e1', tokenId: 'a', name: 'A', initiative: 15, initiativeModifier: 0, hp: { current: 1, max: 1 }, imagePath: '', isActive: false, isDefeated: false, isNPC: false, order: 0 },
        { id: 'e2', tokenId: 'b', name: 'B', initiative: 9, initiativeModifier: 0, hp: { current: 1, max: 1 }, imagePath: '', isActive: false, isDefeated: false, isNPC: false, order: 1 },
      ],
    };
    const state = { ...withTokens({ a: hero({ id: 'a', x: 200, y: 200 }), b: hero({ id: 'b', x: 800, y: 200 }) }), initiative, initiativeTrackerOpen: true };
    const scene = projectForPlayers(state, context({ coverage: fogOver(0, 0, 500, 500) }));
    expect(scene.initiative?.entries.map((entry) => entry.tokenId)).toEqual(['b']);
  });
});
