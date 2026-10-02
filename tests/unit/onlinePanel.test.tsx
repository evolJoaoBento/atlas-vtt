import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';

const { service, presentViewToPlayers, stopPresenting, ui, openJoinSessionModal } = vi.hoisted(() => ({
  service: { start: vi.fn(() => Promise.resolve()), stop: vi.fn(), allow: vi.fn(), deny: vi.fn(), kick: vi.fn() },
  presentViewToPlayers: vi.fn(() => Promise.resolve()),
  stopPresenting: vi.fn(),
  ui: { view: null as unknown },
  openJoinSessionModal: vi.fn(),
}));

vi.mock('../../src/app/online/OnlineSessionService', () => ({ OnlineSessionService: { forApp: () => service } }));
vi.mock('../../src/app/online/obsidian/ui/JoinSessionModal', () => ({ openJoinSessionModal }));
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentViewToPlayers, stopPresenting }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));

import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { OnlinePanel } from '../../src/app/react/components/online/OnlinePanel';
import { TokenControl } from '../../src/app/online/control/TokenControl';
import type { SessionPlayer } from '../../src/app/online/GmSession';
import { onlineSessionStore, resetOnlineSessionStore } from '../../src/app/online/onlineSessionStore';
import { presentedScene, type PresentedView } from '../../src/app/services/PresentedScene';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

const TOKENS = {
  hero: { id: 'hero', kind: 'character', name: 'Hero' },
  goblin: { id: 'goblin', kind: 'character', name: '', statblockName: 'Goblin' },
  crate: { id: 'crate', kind: 'token' },
};

/** A map view showing Tavern; `ui.view` is that view, so the panel presents it. */
function mapView(): { presented: PresentedView; tavern: string; tabMetaStore: ReturnType<typeof createTabMetaStore> } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().setActiveTab(tavern);
  const atlasStore = createStore(() => ({ isMapLoading: false, objects: { tokens: TOKENS } }));
  ui.view = { tabMetaStore, atlasStore };
  return { presented: { tabMetaStore, atlasStore, register: () => {} } as unknown as PresentedView, tavern, tabMetaStore };
}

function hosting(players: SessionPlayer[] = []): TokenControl {
  const control = new TokenControl();
  onlineSessionStore.setState({ status: 'hosting', joinUrl: 'https://example.org/join/#abc', players, tokenControl: control, error: null });
  return control;
}

function renderPanel(): { setOnlinePanelOpen: ReturnType<typeof vi.fn> } {
  const setOnlinePanelOpen = vi.fn();
  const store = create(() => ({ isOnlinePanelOpen: true, setOnlinePanelOpen }));
  render(<ViewStoreProvider store={store as never}><OnlinePanel /></ViewStoreProvider>);
  return { setOnlinePanelOpen };
}

const anna: SessionPlayer = { playerId: 'p1', name: 'Anna', status: 'admitted' };
const dan: SessionPlayer = { playerId: 'p4', name: 'Dan', status: 'gone' };

beforeEach(() => {
  vi.clearAllMocks();
  mapView();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => Promise.resolve()) } });
});
afterEach(() => {
  cleanup();
  resetOnlineSessionStore();
  presentedScene.clear();
});

describe('online panel', () => {
  it('offers to start a session while not hosting', () => {
    renderPanel();
    expect(screen.getByText(/Start a session to get a link/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start online session' }));
    expect(service.start).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Stop online session' })).toBeNull();
  });

  it('waits while starting and shows a failed start with the button back', () => {
    onlineSessionStore.setState({ status: 'starting' });
    renderPanel();
    expect((screen.getByRole('button', { name: 'Starting…' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { onlineSessionStore.setState({ status: 'error', error: 'Timed out reaching the signaling server' }); });
    expect(screen.getByRole('alert').textContent).toBe('Timed out reaching the signaling server');
    expect((screen.getByRole('button', { name: 'Start online session' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the status, the link and no players yet while hosting, and stops the session', () => {
    hosting();
    renderPanel();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Join link' }) as HTMLInputElement).value).toBe('https://example.org/join/#abc');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.org/join/#abc');
    expect(screen.getByText('No players yet. Share the link to invite them.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop online session' }));
    expect(service.stop).toHaveBeenCalledOnce();
  });

  it('shows a hosting error under the status', () => {
    hosting();
    act(() => { onlineSessionStore.setState({ error: 'Lost the signaling server' }); });
    renderPanel();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Lost the signaling server');
  });

  it('lets the GM allow or deny waiting players', () => {
    hosting([{ playerId: 'p2', name: 'Bob', status: 'pending' }]);
    renderPanel();
    const bob = within(screen.getByRole('listitem', { name: 'Bob' }));
    fireEvent.click(bob.getByRole('button', { name: 'Allow' }));
    fireEvent.click(bob.getByRole('button', { name: 'Deny' }));
    expect(service.allow).toHaveBeenCalledWith('p2');
    expect(service.deny).toHaveBeenCalledWith('p2');
  });

  it('lists players with the tokens they control, and removes a player with its X button', () => {
    const { presented, tavern } = mapView();
    const control = hosting([anna, dan]);
    control.set('hero', 'p1', true);
    act(() => { presentedScene.present(presented, tavern); });
    renderPanel();

    const row = within(screen.getByRole('listitem', { name: 'Anna' }));
    expect(row.getByText('Hero')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Tokens…' })).toBeNull();
    act(() => { control.set('goblin', 'p1', true); });
    expect(row.getByText('Goblin')).toBeTruthy();

    fireEvent.click(row.getByRole('button', { name: 'Remove player Anna' }));
    expect(service.kick).toHaveBeenCalledWith('p1');
    expect(within(screen.getByRole('listitem', { name: 'Dan' })).getByText('Disconnected')).toBeTruthy();
  });

  it('presents this view or stops presenting', () => {
    const { presented, tavern } = mapView();
    hosting();
    renderPanel();
    expect(screen.getByText('Players see no scene.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop presenting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Present to players' }));
    expect(presentViewToPlayers).toHaveBeenCalledWith(ui.view);

    act(() => { presentedScene.present(presented, tavern); });
    expect(screen.getByText('Players see Tavern.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Present to players' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop presenting' }));
    expect(stopPresenting).toHaveBeenCalledOnce();
  });

  it('closes with its close button', () => {
    const { setOnlinePanelOpen } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close online session' }));
    expect(setOnlinePanelOpen).toHaveBeenCalledWith(false);
  });

  // Review Focus
  it('does not show the characters of another map while the presented scene is held', () => {
    const { presented, tavern, tabMetaStore } = mapView();
    const control = hosting([anna]);
    control.set('hero', 'p1', true);
    act(() => { presentedScene.present(presented, tavern); });
    renderPanel();
    const row = within(screen.getByRole('listitem', { name: 'Anna' }));
    expect(row.getByText('Hero')).toBeTruthy();

    act(() => {
      const caves = tabMetaStore.getState().addTab('Caves.atlasmap', 'Caves');
      tabMetaStore.getState().setActiveTab(caves);
    });
    expect(presentedScene.isHeld()).toBe(true);
    expect(row.queryByText('Hero')).toBeNull();
  });

  it('falls back to the start view when the session stops elsewhere', () => {
    hosting([anna]);
    renderPanel();
    act(() => { resetOnlineSessionStore(); });
    expect(screen.getByRole('button', { name: 'Start online session' })).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: 'Anna' })).toBeNull();
  });

  it('offers to join a session from here while not hosting', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Join online session…' }));
    expect(openJoinSessionModal).toHaveBeenCalledOnce();
  });

  it('marks a player who joined from Obsidian', () => {
    hosting([{ ...anna, client: 'obsidian' }, dan]);
    renderPanel();
    expect(within(screen.getByRole('listitem', { name: 'Anna' })).getByRole('img', { name: 'Joined from Obsidian' })).toBeTruthy();
    expect(within(screen.getByRole('listitem', { name: 'Dan' })).queryByRole('img', { name: 'Joined from Obsidian' })).toBeNull();
  });
});
