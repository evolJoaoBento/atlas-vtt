import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene, type RemoteSceneState } from '../../../../src/app/online/obsidian/remoteScene';
import { mayMoveAsOnlinePlayer, ONLINE_DRAG_CANCEL, ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { InteractionController } from '../../../../src/app/pixi/token-renderer/InteractionController';

const connected = (movable: string[]): RemoteSceneState => ({
  ...initialRemoteScene(), movableTokenIds: movable, status: { ...initialRemoteScene().status, tone: 'connected' },
});

function makeController(options: { player: boolean; remoteScene: RemoteSceneState | null; selectedIds?: string[] }) {
  const setSelection = vi.fn();
  const viewport = {
    on: vi.fn(), off: vi.fn(),
    toWorld: vi.fn((point: { x: number; y: number }) => point),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  } as any;
  const state = {
    activeTool: 'move', selectedIds: options.selectedIds ?? [], setSelection, setIsDragging: vi.fn(),
    setTokenPositions: vi.fn(), moveToken: vi.fn(), grid: { snapToGrid: false },
    objects: { tokens: { a: { id: 'a', x: 35, y: 35 }, b: { id: 'b', x: 105, y: 35 } } },
    remoteScene: options.remoteScene,
  };
  const store = { getState: () => state } as any;
  const eventBus = new EventEmitter();
  const controller = new InteractionController(viewport, store, {} as any, eventBus, {} as any, options.player);
  const sprites: Record<string, { position: { x: number; y: number; set: ReturnType<typeof vi.fn> } }> = {
    a: { position: { x: 35, y: 35, set: vi.fn() } },
    b: { position: { x: 105, y: 35, set: vi.fn() } },
  };
  controller.setTokenSpriteProvider((id) => (sprites[id] ?? null) as any);
  const drops: unknown[] = [];
  eventBus.on(ONLINE_TOKEN_DROPPED, (drop) => drops.push(drop));
  const press = (tokenId: string, extra: Record<string, unknown> = {}): void => controller.handleViewportTokenPointerDown(tokenId, {
    button: 0, shiftKey: false, altKey: false, global: { x: sprites[tokenId]!.position.x, y: sprites[tokenId]!.position.y }, stopPropagation: vi.fn(), ...extra,
  } as any);
  const dragTo = (x: number, y: number): void => {
    const onMove = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    const onUp = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointerup')[1];
    onMove({ global: { x, y } });
    onUp({ global: { x, y } });
  };
  return { controller, viewport, setSelection, drops, press, dragTo, state, eventBus, sprites };
}

describe('mayMoveAsOnlinePlayer', () => {
  it('allows a token the GM gave this player, only while admitted, and never outside the online scene', () => {
    expect(mayMoveAsOnlinePlayer({ remoteScene: connected(['a']) }, 'a')).toBe(true);
    expect(mayMoveAsOnlinePlayer({ remoteScene: connected(['a']) }, 'b')).toBe(false);
    expect(mayMoveAsOnlinePlayer({ remoteScene: { ...connected(['a']), status: { ...connected([]).status, tone: 'pending' } } }, 'a')).toBe(false);
    expect(mayMoveAsOnlinePlayer({ remoteScene: null }, 'a')).toBe(false);
  });
});

describe('dragging in the online scene', () => {
  it('drags only a token the GM gave this player', () => {
    const t = makeController({ player: true, remoteScene: connected(['a']) });
    t.press('b');
    expect(t.viewport.plugins.pause).not.toHaveBeenCalled();
    t.press('a');
    expect(t.viewport.plugins.pause).toHaveBeenCalledWith('drag');
    expect(t.controller.isDraggingTokens()).toBe(true);
  });

  it('drags one token at a time: no Shift groups, no Alt copies', () => {
    const t = makeController({ player: true, remoteScene: connected(['a', 'b']), selectedIds: ['a', 'b'] });
    t.press('a', { shiftKey: true, altKey: true });
    expect(t.setSelection).toHaveBeenCalledWith(['a']);
    t.dragTo(175, 105);
    expect(t.drops).toEqual([{ id: 'a', x: 175, y: 105 }]);
  });

  it('sends each drop to the view once, where it was dropped', () => {
    const t = makeController({ player: true, remoteScene: connected(['a']) });
    t.press('a');
    t.dragTo(245, 175);
    expect(t.drops).toEqual([{ id: 'a', x: 245, y: 175 }]);
  });

  it('drags nothing while not admitted, and nothing in the local player window', () => {
    const waiting = makeController({ player: true, remoteScene: { ...connected(['a']), status: { ...connected([]).status, tone: 'ended' } } });
    waiting.press('a');
    expect(waiting.viewport.plugins.pause).not.toHaveBeenCalled();
    const local = makeController({ player: true, remoteScene: null });
    local.press('a');
    expect(local.viewport.plugins.pause).not.toHaveBeenCalled();
  });

  it('cancels a drag in progress: the token goes back and nothing is dropped', () => {
    const t = makeController({ player: true, remoteScene: connected(['a']) });
    t.press('a');
    const onMove = t.viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    onMove({ global: { x: 175, y: 105 } });
    t.eventBus.emit(ONLINE_DRAG_CANCEL);
    expect(t.sprites.a!.position.set).toHaveBeenLastCalledWith(35, 35);
    expect(t.controller.isDraggingTokens()).toBe(false);
    expect(t.viewport.plugins.resume).toHaveBeenCalledWith('drag');
    expect(t.viewport.off).toHaveBeenCalledWith('pointerup', expect.anything(), expect.anything());
    expect(t.drops).toEqual([]);
  });

  it('GM view: keeps group drags and sends no drop', () => {
    const t = makeController({ player: false, remoteScene: null, selectedIds: ['a', 'b'] });
    t.press('b');
    expect(t.setSelection).not.toHaveBeenCalled();
    t.dragTo(175, 105);
    expect(t.state.setTokenPositions).toHaveBeenLastCalledWith([{ id: 'a', x: 105, y: 105 }, { id: 'b', x: 175, y: 105 }]);
    expect(t.drops).toEqual([]);
  });
});
