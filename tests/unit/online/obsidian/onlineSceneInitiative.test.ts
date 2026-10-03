/**
 * Initiative in the online scene is exactly what the player window shows: Atlas's own
 * `PlayerInitiativePanel` is drawn twice, once over the GM's store with the GM's collection rules and
 * once over the remote store that the real projection, the converter and the applier fill (the player's own
 * vault says something else), and the two lists must be the same markup.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { RemoteSceneApplier } from '../../../../src/app/online/obsidian/RemoteSceneApplier';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { projectForPlayers, type ProjectedState } from '../../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../../src/app/online/scene/projectRecords';
import { PlayerInitiativePanel } from '../../../../src/app/services/PlayerInitiativePanel';
import { createViewAtlasStore, type ViewAtlasState } from '../../../../src/app/storeFactory';
import type { Character } from '../../../../src/app/types';
import type { InitiativeRules } from '../../../../src/app/types/initiativeRulesTypes';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { coverageOfFog, fakeAssetIds } from '../sceneFixtures';

const rules = vi.hoisted(() => ({ value: { mode: 'turn-order', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
vi.mock('../../../../src/app/services/mapInitiativeRules', () => ({ mapInitiativeRules: () => rules.value }));
vi.mock('../../../../src/app/resources/collectionResources', () => ({ mapResources: () => [] }));
vi.mock('../../../../src/app/utils/scrollWithin', () => ({ scrollWithin: () => undefined }));
afterEach(() => { document.body.replaceChildren(); });

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const IMAGES: RemoteImages = { background: () => null, token: () => null };

const token = (id: string, overrides: Partial<Character> = {}): Character => ({ id, kind: 'character', x: 70, y: 70, imagePath: '', name: id, ...overrides });
const TOKENS: Record<string, Character> = {
  hero: token('hero', { side: 'players' }),
  scout: token('scout', { vision: { enabled: true, range: 100 } }),
  orc: token('orc'),
  boss: token('boss', { side: 'opponents', vision: { enabled: true, range: 100 } }),
  spy: token('spy', { isHidden: true }),
  lurker: token('lurker', { isHidden: true }),
};
const entry = (tokenId: string, initiative: number, order: number, overrides: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: false, order, ...overrides,
});

function gmState(initiative: Partial<InitiativeState>): ProjectedState {
  return {
    background: null, grid: null,
    objects: { tokens: TOKENS, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, lightZones: {}, audios: {} },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 }, widgetValues: {},
    initiative: { ...createDefaultInitiativeState(), round: 3, ...initiative },
    initiativeTrackerOpen: true,
  } as ProjectedState;
}

const SETTINGS = { getLocalPlayerViewSettings: () => ({ showInitiative: true, showTokenNameplates: true }) as never, onChange: () => () => {} };

function drawn(store: StoreApi<ViewAtlasState>): string {
  const { app } = createInMemoryApp();
  const panel = new PlayerInitiativePanel(app, SETTINGS);
  const parent = document.body.appendChild(document.createElement('div'));
  panel.mount(parent);
  panel.present(store);
  const html = parent.querySelector('.atlas-player-initiative')?.outerHTML ?? '';
  panel.destroy();
  return html;
}

/** The player window over the GM's store, and the online scene over the projection; the same list is drawn. */
function bothLists(initiative: Partial<InitiativeState>, gmRules: InitiativeRules): { window: string; online: string } {
  const state = gmState(initiative);
  rules.value = gmRules;
  const window = drawn(createStore(() => state) as unknown as StoreApi<ViewAtlasState>);
  const scene = projectForPlayers(state, {
    sceneId: 's', rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
    coverage: coverageOfFog({}), assets: fakeAssetIds(), mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(), initiativeRules: gmRules,
  });
  const { app } = createInMemoryApp();
  const remote = createViewAtlasStore(app, 'online-initiative', undefined, false, { remote: true });
  new RemoteSceneApplier({ store: remote, images: IMAGES }).apply(scene);
  // The player's own vault knows nothing of the GM's table
  rules.value = TURN_ORDER;
  return { window, online: drawn(remote) };
}

const labels = (html: string): string[] => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.atlas-player-initiative__side-label')].map((el) => el.textContent ?? '');
const names = (html: string): string[] => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.atlas-player-initiative__name')].map((el) => el.textContent ?? '');

describe('the online initiative list is the player window\'s list', () => {
  const ENTRIES = [entry('orc', 21, 0), entry('hero', 17, 1), entry('boss', 12, 2), entry('scout', 9, 3), entry('spy', 8, 4), entry('lurker', 7, 5)];

  it('in turn order: numbers, the turn and the round', () => {
    const { window, online } = bothLists({ entries: ENTRIES.map((e, i) => (i === 1 ? { ...e, isActive: true } : e)), isActive: true }, TURN_ORDER);
    expect(online).toBe(window);
    expect(window).toContain('atlas-player-initiative__value');
    expect(window).toContain('atlas-player-initiative__card--active');
    expect(window).toContain('Round 3');
    expect(names(online)).toEqual(['orc', 'hero', 'boss', 'scout']);
  });

  it('by sides in a fight: the sides in order, the side to act marked, no numbers and no card turn', () => {
    const { window, online } = bothLists({ entries: ENTRIES, isActive: true, sides: { first: 'opponents', active: 'players' } }, TURN_ORDER);
    expect(online).toBe(window);
    expect(labels(online)).toEqual(['Opponents', 'Players']);
    expect(online).toContain('atlas-player-initiative__side--active');
    expect(online).not.toContain('atlas-player-initiative__value');
    expect(online).not.toContain('atlas-player-initiative__card--active');
    expect(names(online)).toEqual(['orc', 'boss', 'hero', 'scout']);
  });

  it('by sides between fights, from the collection\'s rules, which the player\'s own vault does not have', () => {
    const { window, online } = bothLists({ entries: ENTRIES }, { ...SIDES, firstSide: 'opponents' });
    expect(online).toBe(window);
    expect(labels(online)).toEqual(['Opponents', 'Players']);
    expect(online).not.toContain('atlas-player-initiative__side--active');
    expect(online).not.toContain('atlas-player-initiative__value');
    expect(online).not.toContain('Round');
  });

  it('keeps a fight in turn order in turn order, and a fight by sides by sides, whatever the rules say now', () => {
    const turnOrderFight = bothLists({ entries: ENTRIES, isActive: true }, SIDES);
    expect(turnOrderFight.online).toBe(turnOrderFight.window);
    expect(labels(turnOrderFight.online)).toEqual([]);
    const sidesFight = bothLists({ entries: ENTRIES, isActive: true, sides: { first: 'players', active: 'players' } }, TURN_ORDER);
    expect(sidesFight.online).toBe(sidesFight.window);
    expect(labels(sidesFight.online)).toEqual(['Players', 'Opponents']);
  });

  it('fades a combatant that sits out, in both modes', () => {
    const entries = [entry('hero', 5, 0, { sitsOut: true }), entry('orc', 4, 1)];
    for (const gmRules of [SIDES, TURN_ORDER]) {
      const { window, online } = bothLists({ entries, isActive: gmRules === TURN_ORDER }, gmRules);
      expect(online).toBe(window);
      expect(online).toContain('atlas-player-initiative__card--sitting-out');
    }
  });

  it('leaves out a side whose combatants are all hidden', () => {
    const { window, online } = bothLists({ entries: [entry('spy', 4, 0), entry('lurker', 3, 1), entry('orc', 2, 2)] }, SIDES);
    expect(online).toBe(window);
    expect(labels(online)).toEqual(['Opponents']);
  });

  it('draws nothing when the GM has no list, and follows the GM back to turn order', () => {
    const { app } = createInMemoryApp();
    const remote = createViewAtlasStore(app, 'online-initiative-2', undefined, false, { remote: true });
    const applier = new RemoteSceneApplier({ store: remote, images: IMAGES });
    const send = (initiative: Partial<InitiativeState>, gmRules: InitiativeRules): void => applier.apply(projectForPlayers(gmState(initiative), {
      sceneId: 's', rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
      coverage: coverageOfFog({}), assets: fakeAssetIds(), mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(), initiativeRules: gmRules,
    }));
    const { app: panelApp } = createInMemoryApp();
    const panel = new PlayerInitiativePanel(panelApp, SETTINGS);
    const parent = document.body.appendChild(document.createElement('div'));
    panel.mount(parent);
    panel.present(remote);
    const shown = (): string[] => labels(parent.innerHTML);
    send({ entries: ENTRIES }, SIDES);
    expect(shown()).toEqual(['Players', 'Opponents']);
    // The GM edits the collection's rules: the open list regroups without a new fight
    send({ entries: ENTRIES }, { ...SIDES, firstSide: 'opponents' });
    expect(shown()).toEqual(['Opponents', 'Players']);
    send({ entries: ENTRIES }, TURN_ORDER);
    expect(shown()).toEqual([]);
    expect(parent.querySelectorAll('.atlas-player-initiative__value')).toHaveLength(4);
    applier.apply(null);
    expect(parent.querySelector('.atlas-player-initiative')).toBeNull();
    panel.destroy();
  });
});
