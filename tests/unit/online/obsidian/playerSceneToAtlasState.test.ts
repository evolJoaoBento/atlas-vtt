import { describe, expect, it } from 'vitest';
import {
  emptyRemoteScene, plainBuilders, playerSceneToAtlasState,
} from '../../../../src/app/online/obsidian/playerSceneToAtlasState';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import type { PlayerScene } from '../../../../src/app/online/scene/sceneTypes';
import { NEUTRAL_BADGE_COLOR } from '../../../../src/app/online/view/layers/tokenUiDrawing';
import { fogRect, playerScene, playerToken } from '../sceneFixtures';

const images: RemoteImages = {
  background: (id) => (id ? `blob:map/${id}` : null),
  token: (id) => (id ? `blob:token/${id}` : null),
};
const noImages: RemoteImages = { background: () => null, token: () => null };

describe('playerSceneToAtlasState', () => {
  it('shows the map and token art by object URL, one URL per use', () => {
    const { state } = playerSceneToAtlasState(playerScene(), images);
    expect(state.background).toBe('blob:map/map-asset');
    expect(state.objects.tokens.t1).toEqual({
      id: 't1', kind: 'token', x: 100, y: 100, size: 1, rotation: 0, layer: 0,
      imagePath: 'blob:token/asset-1', showRing: true, ringColor: '#ffffff',
    });
  });

  it("shows a token whose art has not arrived as Atlas's default token, and no map image yet", () => {
    const { state } = playerSceneToAtlasState(playerScene(), noImages);
    expect(state.background).toBeNull();
    expect(state.objects.tokens.t1?.imagePath).toBe('');
  });

  it('makes a token with a name, a bar or a downed mark a character, with a plate only for a sent name', () => {
    const bar = { color: '#22c55e', share: 0.7, spent: false };
    const scene = playerScene({
      tokens: {
        named: playerToken({ name: 'Anna', resources: [bar], ring: null }),
        unnamed: playerToken({ resources: [{ color: '#a855f7', share: 0.25, spent: false }] }),
        downed: playerToken({ downed: true }),
        plain: playerToken(),
      },
    });
    const parts = playerSceneToAtlasState(scene, images);
    const { tokens } = parts.state.objects;
    expect(tokens.named).toMatchObject({ kind: 'character', name: 'Anna', showNameplate: true, resources: { bar0: { current: 70, max: 100 } }, showRing: false });
    expect(tokens.named).not.toHaveProperty('ringColor');
    expect(tokens.unnamed).toMatchObject({ kind: 'character', name: '', resources: { bar0: { current: 25, max: 100 } } });
    expect(tokens.unnamed).not.toHaveProperty('showNameplate');
    expect(tokens.downed).toMatchObject({ kind: 'character', resources: { downed: { current: 0, max: 1 } } });
    expect(tokens.plain).toMatchObject({ kind: 'token' });
    // Atlas draws each bar from a stand-in definition of the colour sent; nothing of the GM's definitions
    expect(parts.resources.named).toEqual([
      expect.objectContaining({ key: 'bar0', color: '#22c55e', slot: 0, visibleToPlayers: true }),
      expect.objectContaining({ key: 'downed', visibleToPlayers: false, defeatedWhenSpent: true }),
    ]);
    expect(tokens.named).toMatchObject({ resources: { downed: { current: 1, max: 1 } } });
    expect(parts.resources.downed).toEqual([expect.objectContaining({ key: 'downed', visibleToPlayers: false, defeatedWhenSpent: true })]);
    expect(parts.resources).not.toHaveProperty('plain');
  });

  it('leaves hp and stress alone: a GM of an older version sent them, and nothing draws them any more', () => {
    const scene = playerScene({ tokens: { old: playerToken({ name: 'Old', hp: { current: 3, max: 8 }, stress: { current: 1, max: 4 } }) } });
    const old = playerSceneToAtlasState(scene, images).state.objects.tokens.old;
    expect(old).toMatchObject({ kind: 'character', name: 'Old' });
    expect(old).not.toHaveProperty('resources');
    expect(old).not.toHaveProperty('hp');
    expect(old).not.toHaveProperty('stress');
  });

  it('gives conditions neutral definitions, valued where a value was sent', () => {
    const scene = playerScene({
      tokens: { a: playerToken({ name: 'A', conditions: [{ id: 'prone', value: null }, { id: 'frightened', value: 2 }] }) },
    });
    const parts = playerSceneToAtlasState(scene, images);
    expect(parts.state.objects.tokens.a).toMatchObject({ conditions: ['prone', 'frightened'], conditionValues: { frightened: 2 } });
    expect(parts.conditions).toEqual([
      { id: 'prone', name: 'Condition', color: NEUTRAL_BADGE_COLOR },
      { id: 'frightened', name: 'Condition', color: NEUTRAL_BADGE_COLOR, valued: true },
    ]);
  });

  it('rebuilds fog, texts and drawings in their orders', () => {
    const scene = playerScene({
      fog: {
        f1: fogRect(4, { erase: true, x: 10, y: 20, width: 30, height: 40 }),
        f2: { type: 'brush', erase: false, order: 5, radius: 12, points: [{ x: 1, y: 2 }] },
        f3: { type: 'lasso', erase: true, order: 6, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 4, y: 7 }] },
      },
    });
    const { objects } = playerSceneToAtlasState(scene, images).state;
    expect(objects.fog).toEqual({
      f1: { id: 'f1', kind: 'fog', timestamp: 4, isErasing: true, type: 'rectangle', x: 10, y: 20, width: 30, height: 40 },
      f2: { id: 'f2', kind: 'fog', timestamp: 5, isErasing: false, type: 'brush', brushRadius: 12, points: [{ x: 1, y: 2 }] },
      f3: { id: 'f3', kind: 'fog', timestamp: 6, isErasing: true, type: 'lasso', points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 4, y: 7 }] },
    });
    expect(objects.texts.x1).toEqual({
      id: 'x1', kind: 'text', x: 50, y: 50, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#000000',
      padding: 4, borderRadius: 0, opacity: 1, align: 'center', bold: false, italic: false, rotation: 0, scale: 1,
    });
    expect(objects.drawings.d1).toEqual({
      id: 'd1', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#ff0000', width: 4, opacity: 1,
    });
  });

  it('shows the grid as the GM sends it, and a hidden grid with the map cell size so tokens keep their size', () => {
    const shown = playerSceneToAtlasState(playerScene(), images).state.grid;
    expect(shown).toEqual({
      enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1,
      snapToGrid: true, measurementType: 'units', unitType: 'feet', unitDistance: 5,
    });
    const hidden = playerSceneToAtlasState(playerScene({ grid: null, map: { asset: null, width: 0, height: 0, cellSize: 50 } }), images).state.grid;
    expect(hidden).toMatchObject({ enabled: true, visible: false, size: 50 });
  });

  it('numbers the cells as the GM sends them, on any grid, and reads the hex numbers of a GM before Atlas 0.5.1', () => {
    const gridOf = (patch: Partial<NonNullable<PlayerScene['grid']>>) =>
      playerSceneToAtlasState(playerScene({ grid: { ...playerScene().grid!, ...patch } }), images).state.grid;
    expect(gridOf({ cellNumbers: 'letter-number', cellNumberOpacity: 0.3 })).toMatchObject({ type: 'square', cellNumbers: 'letter-number', cellNumberOpacity: 0.3 });
    expect(gridOf({ type: 'hex-vertical', hexNumbers: 'sequential', hexNumberOpacity: 0.6 })).toMatchObject({ cellNumbers: 'sequential', cellNumberOpacity: 0.6 });
    // An older GM's hex numbers on a square grid: its Atlas drew none there.
    expect(gridOf({ hexNumbers: 'column-row' })).not.toHaveProperty('cellNumbers');
    expect(gridOf({ type: 'hex-vertical', hexNumbers: 'sequential', cellNumbers: null })).not.toHaveProperty('cellNumbers');
  });

  it("takes the GM's measurement for the ruler, snapping included", () => {
    const scene: PlayerScene = playerScene({
      measurement: {
        mode: 'abstract', unitType: 'custom', unitDistance: 1, diagonalRule: 'alternating',
        rangeBands: [{ name: 'Close', maxSquares: 2 }], snapToGrid: false, coneAngle: 53.13,
      },
    });
    const parts = playerSceneToAtlasState(scene, images);
    expect(parts.measurement).toEqual({
      mode: 'abstract', unitType: 'custom', unitDistance: 1, ruleDistance: 1, diagonalRule: 'alternating', rangeBands: [{ name: 'Close', maxSquares: 2 }], coneAngle: 53.13,
    });
    expect(parts.state.grid).toMatchObject({ snapToGrid: false, measurementType: 'abstract' });
    expect(parts.state.grid).not.toHaveProperty('unitType');
  });

  it('shows counters and clocks by their value and timers by their remaining time, all to players', () => {
    const scene = playerScene({
      widgets: [
        { id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', value: 3 },
        { id: 'doom', type: 'clock', label: 'Doom', icon: 'no-such-icon', value: 2 },
        { id: 'fuse', type: 'timer', label: 'Fuse', icon: 'hourglass', value: 90 },
      ],
    });
    const { widgetSettings, widgetValues } = playerSceneToAtlasState(scene, images).state;
    expect(widgetSettings).toMatchObject({ globalVisible: true, position: 'top', scale: 1 });
    expect(widgetSettings.widgets.torches).toEqual({
      id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', visible: true, visibleToPlayers: true, value: 3, order: 0, scope: 'scene',
    });
    expect(widgetSettings.widgets.doom).toMatchObject({ type: 'counter', icon: 'star', order: 1 });
    expect(widgetSettings.widgets.fuse).toMatchObject({ type: 'timer', value: 90, duration: 90, direction: 'down', order: 2 });
    expect(widgetValues).toEqual({ torches: 3, doom: 2 });
  });

  it("opens the initiative order players may see, each entry with its token's art", () => {
    const scene = playerScene({
      initiative: { round: 3, active: true, entries: [{ id: 'e1', tokenId: 't1', initiative: 15, name: 'Anna', hp: null, hpShare: 0.4, isActive: true }] },
    });
    const state = playerSceneToAtlasState(scene, images).state;
    expect(state.initiativeTrackerOpen).toBe(true);
    expect(state.initiative).toMatchObject({ round: 3, isActive: true, currentIndex: 0 });
    expect(state.initiative.entries).toEqual([{
      id: 'e1', tokenId: 't1', name: 'Anna', initiative: 15, initiativeModifier: 0,
      imagePath: 'blob:token/asset-1', isActive: true, isNPC: true, order: 0,
    }]);
    // The bar after the name comes with the scene, by token, for the initiative list to draw
    expect(playerSceneToAtlasState(scene, images).initiativeHealth).toEqual({ t1: { current: 40, max: 100 } });
    const closed = playerSceneToAtlasState(playerScene({ initiative: null }), images).state;
    expect(closed.initiativeTrackerOpen).toBe(false);
    expect(closed.initiative.entries).toEqual([]);
  });

  it('places a token where this view shows it instead of where the GM has it', () => {
    const builders = plainBuilders(images, (id) => (id === 't1' ? { x: 500, y: 600 } : null));
    const { tokens } = playerSceneToAtlasState(playerScene(), images, builders).state.objects;
    expect(tokens.t1).toMatchObject({ x: 500, y: 600 });
  });

  it('takes named fields only: keys the network adds never reach the store', () => {
    const base = playerScene();
    const extra = { notePath: 'GM/secret.md', tags: ['boss'], isHidden: true, statblockPath: 'Bestiary/x.md', secret: 1 };
    const scene = playerScene({
      tokens: { t1: { ...playerToken(), ...extra } as never },
      texts: { x1: { ...base.texts.x1!, secret: 1 } as never },
      drawings: { d1: { ...base.drawings.d1!, secret: 1 } as never },
      fog: { f1: { ...base.fog.f1!, secret: 1 } as never },
      widgets: [{ ...base.widgets[0]!, secret: 1 } as never],
      initiative: { ...base.initiative!, entries: [{ ...base.initiative!.entries[0]!, secret: 1 } as never] },
    });
    const text = JSON.stringify(playerSceneToAtlasState(scene, images).state);
    for (const key of ['notePath', 'tags', 'isHidden', 'statblockPath', 'secret']) expect(text).not.toContain(`"${key}"`);
    expect(playerSceneToAtlasState(scene, images).state.objects).toMatchObject({ pins: {}, walls: {}, lights: {}, audios: {} });
  });

  it('shows an empty map without a scene', () => {
    const { state, conditions } = emptyRemoteScene(plainBuilders(images));
    expect(state.background).toBeNull();
    expect(state.objects.tokens).toEqual({});
    expect(state.grid).toMatchObject({ visible: false, size: 70 });
    expect(state.initiativeTrackerOpen).toBe(false);
    expect(conditions).toEqual([]);
  });
});
