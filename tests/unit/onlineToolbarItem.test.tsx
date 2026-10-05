import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { onlineToolbarItem } from '../../src/app/react/components/online/onlineToolbarItem';
import type { SessionPlayer } from '../../src/app/online/GmSession';

const anna: SessionPlayer = { playerId: 'p1', name: 'Anna', status: 'admitted' };
const bob: SessionPlayer = { playerId: 'p2', name: 'Bob', status: 'pending' };
const cy: SessionPlayer = { playerId: 'p3', name: 'Cy', status: 'pending' };

function renderItem(element: React.ReactNode): HTMLElement {
  return render(<TooltipProvider>{element}</TooltipProvider>).container;
}

describe('online toolbar item', () => {
  it('shows no mark while no session runs', () => {
    const item = onlineToolbarItem({ session: { status: 'idle', players: [] }, open: false, onToggle: vi.fn() });
    const container = renderItem(item.element);
    expect(container.querySelector('.atlas-online-tool__dot')).toBeNull();
    expect(container.querySelector('.atlas-online-tool__badge')).toBeNull();
  });

  it('shows a dot while hosting, and the number of waiting players instead when there are any', () => {
    const hosting = onlineToolbarItem({ session: { status: 'hosting', players: [anna] }, open: false, onToggle: vi.fn() });
    const quiet = renderItem(hosting.element);
    expect(quiet.querySelector('.atlas-online-tool__dot')).not.toBeNull();
    expect(quiet.querySelector('.atlas-online-tool__badge')).toBeNull();

    const waiting = onlineToolbarItem({ session: { status: 'hosting', players: [anna, bob, cy] }, open: false, onToggle: vi.fn() });
    const busy = renderItem(waiting.element);
    expect(busy.querySelector('.atlas-online-tool__dot')).toBeNull();
    expect(busy.querySelector('.atlas-online-tool__badge')?.textContent).toContain('2');
    expect(screen.getByText('2 waiting to join')).toBeTruthy();
  });

  it('toggles the panel, pins while it is open and offers a More tools entry', () => {
    const onToggle = vi.fn();
    const closed = onlineToolbarItem({ session: { status: 'idle', players: [] }, open: false, onToggle });
    expect(closed).toMatchObject({ kind: 'button', pinned: false, active: false });
    expect(closed.menuEntry).toMatchObject({ label: 'Online session', isActive: false });
    closed.menuEntry.onSelect();
    renderItem(closed.element);
    fireEvent.click(screen.getByRole('button', { name: 'Online session' }));
    expect(onToggle).toHaveBeenCalledTimes(2);

    const open = onlineToolbarItem({ session: { status: 'idle', players: [] }, open: true, onToggle });
    expect(open.pinned).toBe(true);
    expect(open.menuEntry.isActive).toBe(true);
  });
});
