import { afterEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ leave: vi.fn() }));
const clients = vi.hoisted(() => ({ made: [] as Array<{ attach: () => boolean; dispose: () => void }> }));

vi.mock('pixi.js', () => ({ Sprite: class {}, Texture: { WHITE: {} } }));
vi.mock('../../../../src/app/atlas-view', () => ({
  AtlasView: class {
    navigation = true;
    app: { workspace: unknown };
    leaf: unknown;
    containerEl = { addClass: (): void => undefined };
    isClosed = false;
    renderer = { getLaserHub: () => ({}) };
    atlasStore = {};
    serviceManager = { getRendererService: () => ({ getViewport: () => ({}) }), getEventBus: () => ({}) };
    constructor(leaf: { app: { workspace: unknown } }) { this.leaf = leaf; this.app = leaf.app; }
    async onOpen(): Promise<void> {}
    async onClose(): Promise<void> {}
  },
}));
vi.mock('../../../../src/app/services/PlayerInitiativePanel', () => ({ PlayerInitiativePanel: class {} }));
vi.mock('../../../../src/app/online/obsidian/RemoteMapBackdrop', () => ({ RemoteMapBackdrop: class {} }));
vi.mock('../../../../src/app/online/obsidian/OnlineJoinService', () => ({ OnlineJoinService: { forApp: () => service } }));
vi.mock('../../../../src/app/online/obsidian/OnlineSceneClient', () => ({
  OnlineSceneClient: class {
    controls = {};
    attach = vi.fn(() => true);
    dispose = vi.fn();
    resize = vi.fn();
    constructor() { clients.made.push(this); }
  },
}));

import { OnlineSceneView } from '../../../../src/app/online/obsidian/OnlineSceneView';

function workspace(): { leaves: Array<{ view: unknown; detach: ReturnType<typeof vi.fn> }>; revealLeaf: ReturnType<typeof vi.fn>; onLayoutReady: (cb: () => void) => void; getLeavesOfType: () => unknown[] } {
  const leaves: Array<{ view: unknown; detach: ReturnType<typeof vi.fn> }> = [];
  return { leaves, revealLeaf: vi.fn(), onLayoutReady: (cb) => cb(), getLeavesOfType: () => leaves };
}

function openView(ws: ReturnType<typeof workspace>): { view: OnlineSceneView; leaf: { view: unknown; detach: ReturnType<typeof vi.fn> } } {
  const leaf = { app: { workspace: ws }, view: null as unknown, detach: vi.fn() };
  const view = new OnlineSceneView(leaf as never);
  leaf.view = view;
  ws.leaves.push(leaf);
  return { view, leaf };
}

afterEach(() => { vi.clearAllMocks(); clients.made.length = 0; });

describe('OnlineSceneView', () => {
  it('is not a navigation target, so opening a file or going back never replaces it', () => {
    expect(openView(workspace()).view.navigation).toBe(false);
  });

  it('closes a copy of the tab and shows the one that has the session, without ending the session', async () => {
    const ws = workspace();
    const first = openView(ws);
    await first.view.onOpen();
    expect(first.view.isAttached).toBe(true);
    const copy = openView(ws);
    await copy.view.onOpen();
    expect(copy.leaf.detach).toHaveBeenCalledOnce();
    expect(ws.revealLeaf).toHaveBeenCalledWith(first.leaf);
    expect(copy.view.isAttached).toBe(false);
    expect(clients.made).toHaveLength(1);
    await copy.view.onClose();
    expect(service.leave).not.toHaveBeenCalled();
    expect(clients.made[0]!.dispose).not.toHaveBeenCalled();
    expect(first.view.onlineControls()).not.toBeNull();
  });

  it('leaves the session when the attached tab closes', async () => {
    const ws = workspace();
    const first = openView(ws);
    await first.view.onOpen();
    await first.view.onClose();
    expect(clients.made[0]!.dispose).toHaveBeenCalledOnce();
    expect(service.leave).toHaveBeenCalledOnce();
  });
});
