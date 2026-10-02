import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { applyPatch } from '../../../../src/app/online/scene/sceneDiff';
import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';
import { CONFIRM_TIMEOUT_MS, REFUSED_NOTICE_MS } from '../../../../src/app/online/view/TokenMoves';
import { playerScene, playerToken } from '../sceneFixtures';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

/** An admitted player with t1 on the scene and theirs to move. */
function ready(options: Parameters<typeof onlineSceneSetup>[0] = {}) {
  const t = onlineSceneSetup(options);
  const scene = playerScene({ tokens: { t1: playerToken({ name: 'Hero' }), t2: playerToken({ x: 300 }) } });
  t.sink().session(admitted());
  t.sink().control(['t1']);
  t.sink().scene(scene);
  const token = (): { x: number; y: number } | undefined => t.store.getState().objects.tokens.t1;
  return { ...t, scene, token };
}

describe('player tools in the online scene', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one token-move per drop and keeps the token there until the GM answers', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    expect(t.fake.sendTokenMove).toHaveBeenCalledOnce();
    expect(t.fake.sendTokenMove).toHaveBeenCalledWith('t1', 210, 140);
    expect(t.token()).toMatchObject({ x: 210, y: 140 });
    // A patch about another token is no answer.
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t2: playerToken({ x: 370 }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 210, y: 140 });
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS);
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
  });

  it("takes the GM's answer: the token where the GM's scene puts it", () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t1: playerToken({ name: 'Hero', x: 245, y: 175 }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 245, y: 175 });
  });

  it('snaps a refused move back and says so for three seconds', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.sink().moveRefused('t1');
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
    expect(t.store.getState().remoteScene?.notice).toBe('Move not allowed.');
    vi.advanceTimersByTime(REFUSED_NOTICE_MS);
    expect(t.store.getState().remoteScene?.notice).toBeNull();
  });

  it('sends nothing for a token the GM did not give, nor once the session is over', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't2', x: 210, y: 140 });
    t.sink().session({ ...admitted(), status: 'lost', reason: 'ended' });
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    expect(t.fake.sendTokenMove).not.toHaveBeenCalled();
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
  });

  it("keeps a dragged token under the pointer through the GM's patches", () => {
    const t = ready();
    t.store.setState({ isDragging: true, selectedIds: ['t1'] });
    t.store.getState().setTokenPositions([{ id: 't1', x: 400, y: 400 }]);
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t1: playerToken({ name: 'Hero', hp: { current: 1, max: 9 } }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 400, y: 400 });
  });

  it("sends the player's laser in their Atlas colour", () => {
    const t = ready({ laserColor: LASER_PALETTE[2] });
    t.hub.emitLocal({ kind: 'point', x: 12, y: 34 });
    expect(t.fake.sendLaser).toHaveBeenLastCalledWith([{ x: 12, y: 34 }], false, [0], LASER_PALETTE[2]);
  });

  it('stops sending drops and lasers once disposed', () => {
    const t = ready();
    t.client.dispose();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(t.fake.sendTokenMove).not.toHaveBeenCalled();
    expect(t.fake.sendLaser).not.toHaveBeenCalled();
    expect(t.eventBus.listenerCount(ONLINE_TOKEN_DROPPED)).toBe(0);
  });
});
