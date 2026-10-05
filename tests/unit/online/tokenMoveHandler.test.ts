import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVES_PER_SECOND, MoveRateLimit } from '../../../src/app/online/control/TokenMoveHandler';
import { createHexLayout, nearestHexCenter } from '../../../src/app/grid/hexGeometry';
import { decodeControl, encodeControl, type ControlMessage } from '../../../src/app/online/protocol';
import { moveWorld, partyState, type MoveWorld } from './tokenMoveFixtures';

async function withHero(w: MoveWorld) {
  w.present();
  const a = await w.join('A');
  w.control.set('hero', a.playerId, true);
  return a;
}

describe('token moves on the GM side', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("applies a controller's move snapped to the cell centre as one undo step, and players see it", async () => {
    const w = moveWorld();
    const a = await withHero(w);
    a.move('hero', 300, 150);
    expect(w.token('hero')).toMatchObject({ x: 315, y: 175 });
    expect(w.history().pastStates).toHaveLength(1);
    expect(a.refusals()).toEqual([]);
    await w.tick();
    expect(a.session.scene?.tokens.hero).toMatchObject({ x: 315, y: 175 });
    w.history().undo();
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    w.finish();
  });

  it('refuses a move of a token the player does not control', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    a.move('ally', 300, 150);
    expect(a.refusals()).toEqual(['ally']);
    expect(w.token('ally')).toMatchObject({ x: 280, y: 140 });
    expect(w.history().pastStates).toHaveLength(0);
    w.finish();
  });

  it('refuses a move for another scene, of a hidden token, of a fogged token, and of one players never saw', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    for (const id of ['orc', 'goblin', 'unknown']) w.control.set(id, a.playerId, true);
    a.move('hero', 300, 150, 'an-older-scene');
    a.move('orc', 300, 150);
    a.move('goblin', 300, 150);
    a.move('unknown', 300, 150);
    expect(a.refusals()).toEqual(['hero', 'orc', 'goblin', 'unknown']);
    expect(w.history().pastStates).toHaveLength(0);
    w.finish();
  });

  it('refuses a token that left the projection between the drag and the drop', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    w.store.setState((state) => { state.objects.tokens.hero!.isHidden = true; });
    await w.tick();
    a.move('hero', 300, 150);
    expect(a.refusals()).toEqual(['hero']);
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    w.finish();
  });

  it('refuses a token hidden in the store before the broadcaster has ticked', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    w.store.setState((state) => { state.objects.tokens.hero!.isHidden = true; });
    const steps = w.history().pastStates.length;
    // No tick: the projection still shows the token, the live store no longer does.
    a.move('hero', 300, 150);
    expect(a.refusals()).toEqual(['hero']);
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    expect(w.history().pastStates).toHaveLength(steps);
    w.finish();
  });

  it('refuses any truthy hidden value, as the projection hides it', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    w.store.setState((state) => { (state.objects.tokens.hero as unknown as { isHidden: unknown }).isHidden = 1; });
    a.move('hero', 300, 150);
    expect(a.refusals()).toEqual(['hero']);
    w.finish();
  });

  it('refuses a move while the scene is held, and writes nothing into the map the view shows now', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    const sceneId = w.broadcaster.currentProjection()!.sceneId;
    w.tabs.getState().setActiveTab(w.dungeon);
    expect(w.presented.isHeld()).toBe(true);
    expect(w.broadcaster.currentProjection()?.sceneId).toBe(sceneId);
    a.move('hero', 300, 150, sceneId);
    expect(a.refusals()).toEqual(['hero']);
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    expect(w.history().pastStates).toHaveLength(0);
    w.finish();
  });

  it('refuses a move while the presented map is loading', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    w.store.setState({ isMapLoading: true });
    a.move('hero', 300, 150);
    expect(a.refusals()).toEqual(['hero']);
    w.finish();
  });

  it('refuses a coordinate too large for a number and keeps the connection', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    const sceneId = w.broadcaster.currentProjection()!.sceneId;
    for (let attempt = 0; attempt < 3; attempt++) {
      a.sendRaw(`{"v":1,"type":"token-move","sceneId":"${sceneId}","tokenId":"hero","x":1e400,"y":0}`);
    }
    expect(a.refusals()).toEqual(['hero', 'hero', 'hero']);
    expect(a.session.state.status).toBe('admitted');
    a.move('hero', 300, 150);
    expect(w.token('hero')).toMatchObject({ x: 315, y: 175 });
    w.finish();
  });

  it('clamps to the map area before snapping', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    a.move('hero', 5000, -300);
    expect(w.token('hero')).toMatchObject({ x: 1995, y: 35 });
    w.finish();
  });

  it('moves nothing without a map size: players are sent nothing then, so there is no content to clamp to', async () => {
    const w = moveWorld({ mapSize: { width: 0, height: 0 } });
    const a = await withHero(w);
    // A map of unknown size shows players no token (F-POS), so the hero is not what they see and does not move.
    a.move('hero', 5000, 5000);
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    w.finish();
  });

  it("snaps as the GM's drag does: hex cells, nothing with snapping off, and a switched-off grid still snaps", async () => {
    const hex = partyState();
    hex.grid = { ...hex.grid!, type: 'hex-vertical' };
    const w1 = moveWorld({ state: hex });
    (await withHero(w1)).move('hero', 300, 150);
    expect(w1.token('hero')).toMatchObject(nearestHexCenter(createHexLayout('hex-vertical', 70, 0, 0), { x: 300, y: 150 }));
    w1.finish();

    const free = partyState();
    free.grid = { ...free.grid!, snapToGrid: false };
    const w2 = moveWorld({ state: free });
    (await withHero(w2)).move('hero', 300.5, 150.25);
    expect(w2.token('hero')).toMatchObject({ x: 300.5, y: 150.25 });
    w2.finish();

    const off = partyState();
    off.grid = { ...off.grid!, enabled: false };
    const w3 = moveWorld({ state: off });
    (await withHero(w3)).move('hero', 300, 150);
    expect(w3.token('hero')).toMatchObject({ x: 315, y: 175 });
    w3.finish();
  });

  it(`ignores more than ${MOVES_PER_SECOND} moves a second from one player, without answering them`, async () => {
    const w = moveWorld();
    const a = await withHero(w);
    for (let cell = 1; cell <= 12; cell++) a.move('hero', cell * 70 + 35, 140);
    expect(w.history().pastStates).toHaveLength(MOVES_PER_SECOND);
    expect(w.token('hero')).toMatchObject({ x: 735, y: 175 });
    expect(a.refusals()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    a.move('hero', 105, 140);
    expect(w.token('hero')).toMatchObject({ x: 105, y: 175 });
    expect(w.history().pastStates).toHaveLength(MOVES_PER_SECOND + 1);
    w.finish();
  });

  it('keeps the rate window of a player who reconnects, and forgets one who left the session', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    for (let cell = 1; cell <= MOVES_PER_SECOND; cell++) a.move('hero', cell * 70 + 35, 140);
    expect(w.history().pastStates).toHaveLength(MOVES_PER_SECOND);
    const again = await w.join('A');
    expect(again.playerId).toBe(a.playerId);
    again.move('hero', 105, 140);
    expect(w.history().pastStates).toHaveLength(MOVES_PER_SECOND);
    expect(again.refusals()).toEqual([]);
    w.finish();

    const limit = new MoveRateLimit();
    for (let i = 0; i < MOVES_PER_SECOND; i++) limit.allow('p', 0);
    limit.retain(new Set(['p']));
    expect(limit.allow('p', 1)).toBe(false);
    limit.retain(new Set());
    expect(limit.allow('p', 2)).toBe(true);
  });

  it('applies both drops of a token two players control, in arrival order', async () => {
    const w = moveWorld();
    const a = await withHero(w);
    const b = await w.join('B');
    w.control.set('hero', b.playerId, true);
    a.move('hero', 300, 150);
    b.move('hero', 500, 150);
    expect(w.token('hero')).toMatchObject({ x: 525, y: 175 });
    expect(w.history().pastStates).toHaveLength(2);
    w.finish();
  });

  it('never answers a connection that is not admitted', async () => {
    const w = moveWorld();
    await withHero(w);
    const link = await w.network.client().connect('gm');
    const received: ControlMessage[] = [];
    link.onMessage((_channel, data) => {
      const decoded = decodeControl(data);
      if (decoded.kind === 'message') received.push(decoded.message);
    });
    link.send('control', encodeControl({ v: 1, type: 'join', name: 'Eve', playerKey: 'eve', client: { kind: 'web', version: '1' } }));
    const sceneId = w.broadcaster.currentProjection()!.sceneId;
    link.send('control', encodeControl({ v: 1, type: 'token-move', sceneId, tokenId: 'hero', x: 300, y: 150 }));
    expect(w.token('hero')).toMatchObject({ x: 140, y: 140 });
    expect(received.filter((message) => message.type === 'token-move-refused')).toEqual([]);
    w.finish();
  });
});
