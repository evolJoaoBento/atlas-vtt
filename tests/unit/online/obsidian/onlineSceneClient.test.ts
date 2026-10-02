import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapService } from '../../../../src/app/services/MapService';
import { WidgetSyncService } from '../../../../src/app/services/WidgetSyncService';
import { getHistoryStore } from '../../../../src/app/stores/history';
import { laserColor } from '../../../../src/app/online/tools/laserColors';
import { playerScene } from '../sceneFixtures';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

const setup = onlineSceneSetup;

afterEach(() => { vi.restoreAllMocks(); });

/** Spies on every method of a class the remote store must never reach. */
function spyOnAll(proto: object): Array<ReturnType<typeof vi.spyOn>> {
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof (proto as Record<string, unknown>)[name] === 'function')
    .map((name) => vi.spyOn(proto as Record<string, (...args: unknown[]) => unknown>, name));
}

describe('OnlineSceneClient', () => {
  it('shows the scene in the store, the session in the status bar, and the initiative panel', () => {
    const t = setup();
    expect(t.attached).toBe(true);
    expect(t.initiative.mount).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(t.initiative.present).toHaveBeenCalledWith(t.store);
    t.sink().session(admitted());
    expect(t.store.getState().remoteScene?.status).toMatchObject({ title: 'Table', connection: 'Connected', message: 'Waiting for the GM to show a scene.' });
    const scene = playerScene();
    t.sink().scene(scene);
    expect(Object.keys(t.store.getState().objects.tokens)).toEqual(['t1']);
    expect(t.store.getState().remoteScene?.status.message).toBeNull();
    expect(t.backdrop.show).toHaveBeenLastCalledWith(scene, null, t.store.getState().grid);
  });

  it('keeps only the tokens the GM gives this player as movable', () => {
    const t = setup();
    t.sink().control(['t1']);
    expect(t.store.getState().remoteScene?.movableTokenIds).toEqual(['t1']);
  });

  it('follows the GM and offers Follow GM once the player breaks away', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.sink().camera({ sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 });
    t.settle();
    expect(t.viewport.center).toEqual({ x: 200, y: 100 });
    t.viewport.moved('drag');
    expect(t.store.getState().remoteScene?.following).toBe(false);
    t.client.controls.followGm();
    expect(t.store.getState().remoteScene?.following).toBe(true);
    t.client.controls.fitMap();
    expect(t.store.getState().remoteScene?.following).toBe(false);
  });

  it('puts the camera back when the map image moved the viewport', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.sink().camera({ sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 });
    t.settle();
    t.viewport.center = { x: 500, y: 400 };
    t.eventBus.emit('background-sprite-updated', { x: 0, y: 0, width: 1000, height: 800 });
    t.settle();
    expect(t.viewport.center).toEqual({ x: 200, y: 100 });
  });

  it('redraws arriving images at most once a frame', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.settle();
    t.sink().images();
    t.sink().images();
    t.sink().images();
    expect(t.pendingFrames()).toBe(1);
  });

  it("shows the shared dice log in Atlas's dice log, newest first, under each roller's name", () => {
    const t = setup();
    t.sink().diceLog([
      { id: 'r2', name: 'Anna', formula: '2d6+1', dice: [{ die: 'd6', value: 4 }, { die: 'd6', value: 2 }], modifier: 1, total: 7, at: 2000 },
      { id: 'r1', name: 'GM', formula: 'd20', dice: [{ die: 'd20', value: 11 }], modifier: 0, total: 11, at: 1000 },
    ]);
    expect(t.store.getState().diceLog).toEqual([
      { id: 'r2', timestamp: 2000, formula: '2d6+1', rolls: [{ die: 'd6', value: 4, max: 6 }, { die: 'd6', value: 2, max: 6 }], modifiers: 1, total: 7, rolledBy: 'Anna' },
      { id: 'r1', timestamp: 1000, formula: 'd20', rolls: [{ die: 'd20', value: 11, max: 20 }], modifiers: 0, total: 11, rolledBy: 'GM' },
    ]);
  });

  it("draws other people's lasers on this scene in their colours, and nobody's for another scene", () => {
    const t = setup();
    t.sink().session(admitted(['p1', 'p2']));
    t.sink().scene(playerScene());
    t.sink().laser({ from: 'p2', sceneId: 'scene-1', points: [{ x: 1, y: 2 }], lifted: false, dt: [0] });
    t.sink().laser({ from: 'gm', sceneId: 'scene-1', points: [], lifted: true, color: '#ffffff' });
    t.sink().laser({ from: 'p1', sceneId: 'other', points: [{ x: 1, y: 2 }], lifted: false });
    expect(t.showRemote.mock.calls).toEqual([
      [{ from: 'p2', color: laserColor('p2', ['p1', 'p2']), points: [{ x: 1, y: 2 }], lifted: false, dt: [0] }],
      [{ from: 'gm', color: '#ffffff', points: [], lifted: true }],
    ]);
  });

  it('shows the end of the session, keeps the scene, and offers Reconnect after a lost connection', () => {
    const t = setup();
    t.sink().session(admitted());
    t.sink().scene(playerScene());
    t.sink().session({ ...admitted(), status: 'lost', reason: 'connection-lost' });
    expect(t.store.getState().remoteScene?.status).toMatchObject({ tone: 'ended', message: 'Lost the connection to your GM.', reconnect: true });
    expect(Object.keys(t.store.getState().objects.tokens)).toEqual(['t1']);
    t.client.controls.reconnect();
    expect(t.fake.reconnect).toHaveBeenCalledOnce();
  });

  it('rolls through the session', () => {
    const t = setup();
    expect(t.client.controls.rollDice({ d20: 1 }, 2)).toBe(true);
    expect(t.fake.sendDiceRoll).toHaveBeenCalledWith({ d20: 1 }, 2);
  });

  it('closes its tab when the session is left from elsewhere', () => {
    const t = setup();
    t.sink().close();
    expect(t.closeTab).toHaveBeenCalledOnce();
  });

  it('says it could not attach without a joined session', () => {
    expect(setup({ noSession: true }).attached).toBe(false);
  });

  it('dispose lets go of the session, the camera, the panel and the events', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.client.dispose();
    expect(t.detach).toHaveBeenCalledOnce();
    expect(t.initiative.destroy).toHaveBeenCalledOnce();
    expect(t.backdrop.dispose).toHaveBeenCalledOnce();
    expect(t.viewport.listeners.size).toBe(0);
    expect(t.eventBus.listenerCount('background-sprite-updated')).toBe(0);
    expect(t.pendingFrames()).toBe(0);
  });

  describe("the player's vault stays untouched", () => {
    it('never reaches map loading, widget sync or the vault, and keeps history paused with no map path', async () => {
      const mapSpies = spyOnAll(MapService.prototype);
      const widgetSpies = spyOnAll(WidgetSyncService.prototype);
      const t = setup();
      const before = JSON.stringify([[...t.vault.files].sort(), [...t.vault.folders].sort()]);
      t.sink().session(admitted(['p1']));
      t.sink().scene(playerScene());
      t.sink().scene(playerScene({ sceneId: 'scene-2' }));
      t.sink().control(['t1']);
      t.sink().diceLog([]);
      t.sink().images();
      t.settle();
      await t.store.flushStorage();
      expect(mapSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
      expect(widgetSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
      expect(t.store.getState().mapPath).toBeNull();
      expect(t.store.getState().persistenceEnabled).toBe(false);
      expect(getHistoryStore(t.store)?.getState().isTracking).toBe(false);
      expect(getHistoryStore(t.store)?.getState().pastStates).toHaveLength(0);
      expect(JSON.stringify([[...t.vault.files].sort(), [...t.vault.folders].sort()])).toBe(before);
      expect(t.vault.app.vault.create).not.toHaveBeenCalled();
    });
  });
});
