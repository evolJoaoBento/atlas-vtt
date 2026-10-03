/**
 * An Obsidian player against the real GM side over `MemoryTransport`: the join service, the
 * Online scene client and its remote store, with the GM's session, scene broadcaster, token
 * control, dice host and laser relay (`toolsWorld`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { ImageDecoder } from '../../../../src/app/online/assets/AssetLoader';
import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import { OnlineJoinService } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import { DICE_ROLLED_EVENT } from '../../../../src/app/tools/diceRolling';
import { nodeHash } from '../assetFixtures';
import { toolsWorld } from '../toolsFixtures';
import { onlineSceneSetup } from './onlineSceneFixtures';

type View = ReturnType<typeof onlineSceneSetup>;

function settings() {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS };
  return {
    getOnlineSettings: (): OnlineSettings => online,
    setOnlineSettings: (partial: Partial<OnlineSettings>): void => { online = { ...online, ...partial }; },
    onChange: (): (() => void) => () => {},
  };
}

/** The GM presents the tavern; Anna joins from Atlas, is let in, and her Online scene tab attaches. */
async function joinFromObsidian() {
  const w = toolsWorld();
  w.present();
  const opened: { view: View | null } = { view: null };
  const decode: ImageDecoder = async () => null;
  const service: OnlineJoinService = new OnlineJoinService({} as App, settings(), '0.5.0', {
    createClient: () => w.network.client(), openStore: async () => null, decode, hash: nodeHash, isHosting: () => false,
    openSceneTab: async () => {
      opened.view = onlineSceneSetup({ service, attach: false });
      opened.view.client.attach();
    },
  });
  expect(service.join('https://example.org/join/#id=gm', 'Anna')).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  const pending = w.gm.getPlayers().find((player) => player.status === 'pending');
  expect(pending).toMatchObject({ name: 'Anna', client: 'obsidian' });
  w.gm.allow(pending!.playerId);
  await vi.advanceTimersByTimeAsync(0);
  await w.tick();
  const view = (): View => {
    if (!opened.view) throw new Error('The Online scene tab did not open');
    return opened.view;
  };
  return { w, service, view, playerId: (): string => service.state?.playerId ?? '' };
}

describe('an Obsidian player end to end', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    joinedSessionStore.setState({ session: null });
    vi.useRealTimers();
  });

  it('joins, opens the tab, and sees the presented scene with nothing the GM hides', async () => {
    const { w, service, view } = await joinFromObsidian();
    const state = view().store.getState();
    expect(Object.keys(state.objects.tokens).sort()).toEqual(['ally', 'hero']);
    expect(state.objects.tokens.hero).toMatchObject({ kind: 'character', name: 'Hero', x: 140, y: 140, showNameplate: true });
    expect(Object.keys(state.objects.fog)).toEqual(['f1']);
    expect(JSON.stringify(state.objects)).not.toContain('art/');
    expect(state.remoteScene?.status).toMatchObject({ title: 'Vault', connection: 'Connected', message: null });
    service.dispose();
    w.finish();
  });

  it("moves a token the GM gave: one drop, the GM snaps it, and the player sees the GM's answer", async () => {
    const { w, service, view, playerId } = await joinFromObsidian();
    w.control.set('hero', playerId(), true);
    await w.tick();
    expect(view().store.getState().remoteScene?.movableTokenIds).toEqual(['hero']);
    view().eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 'hero', x: 300, y: 150 });
    await w.tick();
    expect(w.token('hero')).toMatchObject({ x: 315, y: 175 });
    expect(view().store.getState().objects.tokens.hero).toMatchObject({ x: 315, y: 175 });
    service.dispose();
    w.finish();
  });

  it("rolls through the GM, into the GM's dice log and the player's", async () => {
    const { w, service, view } = await joinFromObsidian();
    expect(view().client.controls.rollDice({ d20: 1 }, 2)).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.feed.published.at(-1)).toMatchObject({ formula: 'd20+2', rolledBy: 'Anna', total: 13 });
    expect(view().store.getState().diceLog[0]).toMatchObject({ formula: 'd20+2', total: 13, rolledBy: 'Anna' });
    service.dispose();
    w.finish();
  });

  it("points Atlas's laser at the GM and sees the GM's", async () => {
    const { w, service, view, playerId } = await joinFromObsidian();
    view().hub.emitLocal({ kind: 'point', x: 40, y: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.shown.at(-1)).toMatchObject({ from: playerId(), points: [{ x: 40, y: 50 }], lifted: false });
    w.hub.emitLocal({ kind: 'point', x: 70, y: 80 });
    await vi.advanceTimersByTimeAsync(0);
    expect(view().showRemote).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'gm', points: [{ x: 70, y: 80 }] }));
    service.dispose();
    w.finish();
  });

  it("never writes the player's vault, dispatches no dice event, and leaves cleanly", async () => {
    const heard = vi.fn();
    document.addEventListener(DICE_ROLLED_EVENT, heard);
    const { w, service, view, playerId } = await joinFromObsidian();
    w.control.set('hero', playerId(), true);
    await w.tick();
    view().eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 'hero', x: 300, y: 150 });
    view().client.controls.rollDice({ d6: 2 }, 0);
    view().hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    await w.tick();
    service.leave();
    await vi.advanceTimersByTimeAsync(0);
    document.removeEventListener(DICE_ROLLED_EVENT, heard);
    const { vault } = view();
    expect([...vault.files.keys()]).toEqual([]);
    expect([...vault.folders]).toEqual(['atlas-vtt']);
    for (const spy of [vault.app.vault.create, vault.app.vault.process, vault.app.vault.read, vault.app.vault.adapter.write, vault.app.vault.adapter.read]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(heard).not.toHaveBeenCalled();
    expect(view().closeTab).toHaveBeenCalledOnce();
    expect(w.gm.getPlayers().map((player) => player.status)).toEqual(['gone']);
    service.dispose();
    w.finish();
  });
});
