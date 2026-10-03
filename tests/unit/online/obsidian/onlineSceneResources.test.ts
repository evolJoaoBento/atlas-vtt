/**
 * Resources in the online scene: the GM's real projection, through the converter and the remote store,
 * drawn by Atlas's own token UI and initiative list. What the player window shows of resources is
 * a bar per resource in the colour it shows, no numbers, a grey skull on a downed token, and an HP bar
 * in the initiative list; this is what the scene shows too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { RemoteSceneApplier } from '../../../../src/app/online/obsidian/RemoteSceneApplier';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { projectForPlayers, type ProjectedState } from '../../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../../src/app/online/scene/projectRecords';
import { TokenUIRenderer } from '../../../../src/app/pixi/TokenUIRenderer';
import { isTokenDowned } from '../../../../src/app/pixi/token-renderer/isTokenDowned';
import { viewResourceDefinitions } from '../../../../src/app/pixi/token-renderer/viewResourceDefinitions';
import { resourceColor } from '../../../../src/app/resources/resourceColors';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { visibleResources } from '../../../../src/app/resources/visibleResources';
import { PlayerInitiativePanel } from '../../../../src/app/services/PlayerInitiativePanel';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import type { Character, TokenEntity } from '../../../../src/app/types';
import { createDefaultInitiativeState } from '../../../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { coverageOfFog, fakeAssetIds, playerScene, playerToken } from '../sceneFixtures';

const IMAGES: RemoteImages = { background: () => null, token: () => null };
const COLLECTIONS = { getCollectionForMap: () => null, getCollectionSettings: () => { throw new Error('a remote scene has no collection'); } };

const DEFINITIONS: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: true, slot: 0 },
  { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#a855f7', visibleToPlayers: true, slot: 1 },
  { key: 'mana', name: 'Mana', field: 'mana', direction: 'drains', color: '#3b82f6', visibleToPlayers: true, slot: 2 },
  { key: 'doom', name: 'Doom', field: 'doom', direction: 'drains', color: '#111111', defeatedWhenSpent: true, visibleToPlayers: false, slot: 3 },
];
const character = (id: string, resources: Character['resources']): Character => ({ id, kind: 'character', x: 70, y: 70, imagePath: `${id}.png`, name: id, resources });
const TOKENS = {
  // Worn down: HP turns yellow below 70%, so the colour the window shows is not the definition's
  hurt: character('hurt', { hp: { current: 5, max: 10 }, stress: { current: 3, max: 6 }, mana: { current: 1, max: 2 } }),
  fallen: character('fallen', { hp: { current: 0, max: 10 } }),
  // A resource players do not see downs it
  ghoul: character('ghoul', { hp: { current: 9, max: 10 }, doom: { current: 0, max: 5 } }),
};

function sceneStore(definitions: readonly ResourceDefinition[] = DEFINITIONS): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'online-resources', undefined, false, { remote: true });
  const state: ProjectedState = {
    background: null, grid: null,
    objects: { tokens: TOKENS, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 }, widgetValues: {},
    initiative: {
      ...createDefaultInitiativeState(), isActive: true, round: 1,
      entries: [{ id: 'e1', tokenId: 'hurt', name: 'hurt', initiative: 12, initiativeModifier: 0, imagePath: '', isActive: true, isNPC: false, order: 0 }],
    },
    initiativeTrackerOpen: true,
  };
  const scene = projectForPlayers(state, {
    sceneId: 's', rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
    coverage: coverageOfFog({}), assets: fakeAssetIds(), mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(), resources: definitions,
  });
  new RemoteSceneApplier({ store, images: IMAGES }).apply(scene);
  return store;
}

const tokenOf = (store: ReturnType<typeof sceneStore>, id: string): TokenEntity => store.getState().objects.tokens[id]!;
const definitionsOf = (store: ReturnType<typeof sceneStore>) => (id?: string): readonly ResourceDefinition[] =>
  viewResourceDefinitions(store.getState(), COLLECTIONS, id);

function tokenUi(store: ReturnType<typeof sceneStore>): TokenUIRenderer {
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = definitionsOf(store);
  return ui;
}

function mockCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('resources in the online scene', () => {
  it('draws the bars the window draws, from the first two sockets, in the colours it shows', () => {
    mockCanvas();
    const store = sceneStore();
    const ui = tokenUi(store);
    try {
      ui.update(tokenOf(store, 'hurt'), 70);
      expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['bar0', 'bar1']);
      const shown = visibleResources(tokenOf(store, 'hurt'), definitionsOf(store)('hurt'), 'player');
      // HP at 50% is yellow in the window (its definition is green); stress keeps its own colour
      expect(shown.map(({ definition, value }) => resourceColor(definition, value))).toEqual(['#eab308', '#a855f7']);
      expect(shown.map(({ value }) => value.current / value.max)).toEqual([0.5, 0.5]);
    } finally { ui.destroy(); }
  });

  it('shows no numbers on hover or selection, and no wheels, where the GM view reveals them', () => {
    mockCanvas();
    const remote = sceneStore();
    const ui = tokenUi(remote);
    try {
      ui.update(tokenOf(remote, 'hurt'), 70);
      ui.setHoverState(true);
      ui.setSelectionState(true);
      expect((ui as unknown as { resources: { getTextAlpha(): number } }).resources.getTextAlpha()).toBe(0);
    } finally { ui.destroy(); }

    // The same token and definitions in a GM view do show them
    const { app } = createInMemoryApp();
    const gm = createViewAtlasStore(app, 'gm-view');
    const gmUi = new TokenUIRenderer(gm);
    gmUi.resourceDefsProvider = () => DEFINITIONS;
    try {
      gmUi.update(TOKENS.hurt, 70);
      gmUi.setHoverState(true);
      expect((gmUi as unknown as { resources: { getTextAlpha(): number } }).resources.getTextAlpha()).toBeGreaterThan(0);
    } finally { gmUi.destroy(); }
  });

  it('darkens the bar of a defeated token and greys it out, also when a resource players do not see downs it', () => {
    mockCanvas();
    const store = sceneStore();
    const ui = tokenUi(store);
    try {
      ui.update(tokenOf(store, 'fallen'), 70);
      expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['bar0']);
      expect((ui as unknown as { defeatedOverlay: { visible: boolean } }).defeatedOverlay.visible).toBe(true);
    } finally { ui.destroy(); }
    const downed = (id: string): boolean => isTokenDowned(tokenOf(store, id), definitionsOf(store)(id));
    expect(downed('fallen')).toBe(true);
    expect(downed('ghoul')).toBe(true);
    expect(downed('hurt')).toBe(false);
    // The resource that downed the ghoul is not drawn: only its HP bar is
    const ghoul = tokenUi(store);
    try {
      ghoul.update(tokenOf(store, 'ghoul'), 70);
      expect(ghoul.getResourceSlots().map((slot) => slot.key)).toEqual(['bar0']);
    } finally { ghoul.destroy(); }
  });

  it('answers for tokens it has stand-ins for, and for no other', () => {
    const store = sceneStore();
    expect(definitionsOf(store)('hurt').map((definition) => definition.key)).toEqual(['bar0', 'bar1', 'downed']);
    expect(definitionsOf(store)('nobody')).toEqual([]);
    expect(definitionsOf(store)()).toEqual([]);
  });

  it('follows the collection: a resource hidden from players is gone from the scene', () => {
    const hidden = DEFINITIONS.map((definition) => ({ ...definition, visibleToPlayers: false }));
    const store = sceneStore(hidden);
    expect(definitionsOf(store)('hurt')).toEqual([]);
    expect(tokenOf(store, 'hurt')).not.toHaveProperty('resources');
  });

  it("lists the HP bar after a combatant's name, at its share, in Atlas's own initiative list", () => {
    const store = sceneStore();
    const { app } = createInMemoryApp();
    const panel = new PlayerInitiativePanel(app, {
      getLocalPlayerViewSettings: () => ({ showInitiative: true, showTokenNameplates: true }) as never,
      onChange: () => () => {},
    });
    const parent = document.body.appendChild(document.createElement('div'));
    panel.mount(parent);
    panel.present(store);
    const bar = parent.querySelector<HTMLProgressElement>('progress.atlas-player-initiative__hp');
    expect(bar).not.toBeNull();
    expect(bar!.value / bar!.max).toBeCloseTo(0.5);
    panel.destroy();
  });

  it('never gives a stand-in a wheel socket, however many bars arrive, and keeps the downed stand-in out of sight', () => {
    mockCanvas();
    const store = sceneStore();
    const applier = new RemoteSceneApplier({ store, images: IMAGES });
    const bar = { color: '#3b82f6', share: 0.5, spent: false };
    applier.apply({
      ...playerScene(), tokens: { t1: playerToken({ name: 'Many', resources: Array.from({ length: 6 }, () => bar), downed: true }) },
    });
    expect(store.getState().tokenSettings.hiddenResources).toEqual(['downed']);
    const ui = tokenUi(store);
    try {
      ui.update(tokenOf(store, 't1'), 70);
      expect(ui.getResourceSlots().map((slot) => [slot.key, slot.kind])).toEqual([['bar0', 'bar'], ['bar1', 'bar']]);
      expect(isTokenDowned(tokenOf(store, 't1'), definitionsOf(store)('t1'))).toBe(true);
    } finally { ui.destroy(); }
  });

  it('keeps the downed stand-in on a healed token, so the grey eases out as it does in a GM view', () => {
    const store = sceneStore();
    const before = tokenOf(store, 'fallen');
    new RemoteSceneApplier({ store, images: IMAGES }).apply(playerScene({ tokens: { fallen: playerToken({ name: 'Fallen', resources: [{ color: '#22c55e', share: 1, spent: false }], downed: false }) } }));
    const after = tokenOf(store, 'fallen');
    const definitions = definitionsOf(store)('fallen');
    expect(isTokenDowned(before, definitions)).toBe(true);
    expect(isTokenDowned(after, definitions)).toBe(false);
  });
});
