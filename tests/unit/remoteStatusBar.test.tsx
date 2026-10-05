import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStatusBar } from '../../src/app/remote-view/RemoteStatusBar';
import { RemoteViewDice } from '../../src/app/remote-view/RemoteViewDice';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(remote = true) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-status', undefined, false, { remote });
  const dice = new RemoteViewDice(store);
  const view = render(<ViewStoreProvider store={store as never}><RemoteStatusBar /></ViewStoreProvider>);
  return { store, dice, view };
}

describe("the remote view's status bar", () => {
  it('shows nothing until its owner sets a status, and nothing outside a remote view', () => {
    expect(setup().view.container.querySelector('.atlas-remote-status-bar')).toBeNull();
    cleanup();
    expect(setup(false).view.container.querySelector('.atlas-remote-status-bar')).toBeNull();
  });

  it("shows the owner's title, connection, message and tone, and runs its action, guarded", () => {
    const { dice, view } = setup();
    const run = vi.fn(() => { throw new Error('boom'); });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => dice.setStatus({ title: 'The table', connection: 'Disconnected', tone: 'ended', message: 'The GM left.', action: { label: 'Reconnect', run } }));
    const bar = view.container.querySelector('.atlas-remote-status-bar');
    expect(bar?.textContent).toContain('The table');
    expect(bar?.textContent).toContain('Disconnected');
    expect(bar?.textContent).toContain('The GM left.');
    expect(view.container.querySelector('.atlas-remote-status-bar__dot--ended')).not.toBeNull();
    fireEvent.click(screen.getByText('Reconnect'));
    expect(run).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    act(() => dice.setStatus({ title: 'The table', connection: 'Connected', tone: 'connected', message: null }));
    expect(screen.queryByText('Reconnect')).toBeNull();
  });

  it('refuses a malformed status', () => {
    const { dice } = setup();
    expect(() => dice.setStatus({ title: 'x', connection: 'y', tone: 'green', message: null } as never)).toThrow(/RemoteStatus/);
  });
});
