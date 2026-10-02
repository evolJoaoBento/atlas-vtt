/**
 * An Online scene client on a real remote store, with a fake session service (or a real one),
 * a fake viewport, manual animation frames and a manual clock, and a real laser hub.
 */
import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import type { OnlineSceneSink } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { OnlineSceneClient, type OnlineSceneService } from '../../../../src/app/online/obsidian/OnlineSceneClient';
import type { FollowViewport, Frames } from '../../../../src/app/online/obsidian/ViewportFollower';
import type { PlayerSessionState } from '../../../../src/app/online/PlayerSession';
import { GLIDE_MS } from '../../../../src/app/online/view/camera';
import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';
import { LaserHub } from '../../../../src/app/pixi/laser/LaserHub';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';

export class FakeViewport implements FollowViewport {
  screenWidth = 800;
  screenHeight = 600;
  center = { x: 0, y: 0 };
  scale = { x: 1 };
  readonly listeners = new Set<(event: { type: string }) => void>();
  setZoom(zoom: number): void { this.scale.x = zoom; }
  moveCenter(x: number, y: number): void { this.center = { x, y }; }
  on(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.add(listener); }
  off(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.delete(listener); }
  /** pixi-viewport's `moved` event after one of its plugins moved it. */
  moved(type: string): void { for (const listener of [...this.listeners]) listener({ type }); }
}

export const admitted = (players: string[] = []): PlayerSessionState => ({
  status: 'admitted', playerId: 'me', title: 'Table', reason: null,
  players: players.map((playerId) => ({ playerId, name: playerId, connected: true })),
});

let count = 0;

export interface OnlineSceneSetupOptions {
  /** A real service; the fake one records what the client sends. */
  service?: OnlineSceneService;
  /** The fake service finds no joined session. */
  noSession?: boolean;
  /** Attach right away (the default); the end-to-end test attaches on admission. */
  attach?: boolean;
  laserColor?: string;
}

export function onlineSceneSetup(options: OnlineSceneSetupOptions = {}) {
  const vault = createInMemoryApp();
  const store = createViewAtlasStore(vault.app, `online-${count++}`, undefined, false, { remote: true });
  let sink: OnlineSceneSink | null = null;
  const detach = vi.fn();
  const fake = {
    attach: vi.fn((given: OnlineSceneSink) => {
      if (options.noSession) return null;
      sink = given;
      return detach;
    }),
    images: { background: (): string | null => null, token: (): string | null => null },
    reconnect: vi.fn(),
    sendDiceRoll: vi.fn((): boolean => true),
    sendTokenMove: vi.fn((): boolean => true),
    sendLaser: vi.fn((): boolean => true),
  };
  const service: OnlineSceneService = options.service ?? fake;
  let queue: Array<() => void> = [];
  const frames: Frames = { request: (draw) => { queue.push(draw); return queue.length; }, cancel: () => { queue = []; } };
  let now = 0;
  const viewport = new FakeViewport();
  const backdrop = { show: vi.fn(), dispose: vi.fn() };
  const initiative = { mount: vi.fn(), present: vi.fn(), hold: vi.fn(), destroy: vi.fn() };
  const eventBus = new EventEmitter();
  const hub = new LaserHub();
  const showRemote = vi.spyOn(hub, 'showRemote');
  const closeTab = vi.fn();
  const parent = document.createElement('div');
  const client = new OnlineSceneClient({
    store, service, viewport, backdrop, initiative, parent, eventBus, laserHub: hub, laserColor: () => options.laserColor ?? LASER_PALETTE[0]!, closeTab, frames, now: () => now,
  });
  const attached = options.attach === false ? false : client.attach();
  const runFrames = (): void => { const due = queue; queue = []; due.forEach((draw) => draw()); };
  const settle = (): void => { now += GLIDE_MS + 1; runFrames(); runFrames(); };
  return {
    vault, store, fake, client, attached, viewport, backdrop, initiative, eventBus, hub, showRemote, closeTab, detach, runFrames, settle,
    sink: (): OnlineSceneSink => {
      if (!sink) throw new Error('The client did not attach to the fake service');
      return sink;
    },
    pendingFrames: (): number => queue.length,
  };
}
