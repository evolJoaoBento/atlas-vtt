import { beforeEach, describe, expect, it, vi } from 'vitest';

const { presentTabInPlayerWindow, presentTabToPlayers, openContextMenuGlobal } = vi.hoisted(() => ({
  presentTabInPlayerWindow: vi.fn(() => Promise.resolve()),
  presentTabToPlayers: vi.fn(() => Promise.resolve()),
  openContextMenuGlobal: vi.fn(),
}));

vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTabInPlayerWindow }));
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentTabToPlayers }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

import { activePresentationTarget, addPresentationTarget } from '../../src/app/services/presentationTargets';
import { openPresentMenu, presentTab } from '../../src/app/react/tabPresenting';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';

const app = {} as never;
const view = {} as never;

describe('the eye button', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('presents in the player window and offers no menu without a target', () => {
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
    expect(presentTabToPlayers).not.toHaveBeenCalled();
    expect(openPresentMenu(app, view, 't1', { x: 1, y: 2 })).toBe(false);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('presents to online players only while a target is active, with the player window in its menu', () => {
    const stop = addPresentationTarget({ id: 't', label: 'online players', isActive: () => true });
    presentTab(app, view, 't1');
    expect(presentTabToPlayers).toHaveBeenCalledWith(view, 't1');
    expect(presentTabInPlayerWindow).not.toHaveBeenCalled();

    expect(openPresentMenu(app, view, 't1', { x: 1, y: 2 })).toBe(true);
    const [entries, position] = openContextMenuGlobal.mock.calls[0] as [ContextMenuEntry[], { x: number; y: number }];
    expect(position).toEqual({ x: 1, y: 2 });
    expect(entries).toHaveLength(1);
    const entry = entries[0] as Extract<ContextMenuEntry, { type: 'item' }>;
    expect(entry.label).toBe('Open player window');
    entry.onClick();
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
    stop();
  });

  it('the eye opens the player window again once the last target is removed', () => {
    const stop = addPresentationTarget({ id: 't', label: 'online players', isActive: () => true });
    stop();
    expect(activePresentationTarget()).toBeNull();
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
  });
});
