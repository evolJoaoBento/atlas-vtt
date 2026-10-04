import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const { ui } = vi.hoisted(() => ({ ui: { view: {} as unknown } }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));

import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { paletteSlot } from '../../src/app/extensions/slots';
import type { PaletteSection } from '../../src/api/types/ui';

function renderPalette(isOpen = true): { onClose: ReturnType<typeof vi.fn>; rerender: (open: boolean) => void } {
  const store = create(() => ({ isPlayerView: false }));
  const onClose = vi.fn();
  const view = (open: boolean): React.ReactElement => (
    <ViewStoreProvider store={store as never}><CommandPalette isOpen={open} onClose={onClose} /></ViewStoreProvider>
  );
  const { rerender } = render(view(isOpen));
  return { onClose, rerender: (open) => rerender(view(open)) };
}

const option = (label: string): HTMLElement | null => screen.queryByRole('button', { name: new RegExp(`^${label}`) });

const headers = (): Array<string | null> =>
  Array.from(document.querySelectorAll('.atlas-command-palette-section-header')).map((el) => el.textContent);

function section(overrides: Partial<PaletteSection> = {}): PaletteSection {
  return {
    id: 'online', title: 'Online play',
    commands: () => [{ id: 'open', icon: 'network', label: 'Online session', keywords: ['host'], run: vi.fn() }],
    ...overrides,
  };
}

function add(paletteSection: PaletteSection): () => void {
  let remove = (): void => undefined;
  act(() => { remove = paletteSlot.add('ext', paletteSection); });
  return () => act(() => { remove(); });
}

describe('Extension sections in the command palette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ui.view = { viewId: 'view-1' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    expect(paletteSlot.list()).toHaveLength(0);
  });

  it('has no extra section while nothing is registered', () => {
    renderPalette();
    expect(headers()).not.toContain('Online play');
    expect(headers()).toContain('Tools');
  });

  it('lists a section\'s commands under its title, after Atlas\'s own, and runs one then closes', () => {
    const run = vi.fn();
    const remove = add(section({ commands: () => [{ id: 'open', icon: 'network', label: 'Online session', run }] }));
    const { onClose } = renderPalette();
    expect(headers().at(-1)).toBe('Online play');
    fireEvent.click(option('Online session')!);
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    remove();
  });

  it('passes the view context to the section and finds a command by its keywords', () => {
    const commands = vi.fn(() => [{ id: 'open', icon: 'network', label: 'Online session', keywords: ['host'], run: vi.fn() }]);
    const remove = add(section({ commands }));
    renderPalette();
    expect(commands).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'host' } });
    expect(option('Online session')).not.toBeNull();
    remove();
  });

  it('asks for commands only while the palette is open, and again after invalidate', () => {
    let label = 'First';
    const remove = add(section({ commands: () => [{ id: 'c', icon: 'x', label, run: vi.fn() }] }));
    const { rerender } = renderPalette(false);
    expect(option('First')).toBeNull();
    rerender(true);
    expect(option('First')).not.toBeNull();
    label = 'Second';
    act(() => { paletteSlot.invalidate(); });
    expect(option('Second')).not.toBeNull();
    remove();
  });

  it('shows nothing of a section whose commands throw, and keeps Atlas\'s own', () => {
    const remove = add(section({ commands: () => { throw new Error('boom'); } }));
    renderPalette();
    expect(headers()).not.toContain('Online play');
    expect(headers()).toContain('Tools');
    remove();
  });

  it('still closes when a command throws', () => {
    const remove = add(section({ commands: () => [{ id: 'c', icon: 'x', label: 'Online session', run: () => { throw new Error('boom'); } }] }));
    const { onClose } = renderPalette();
    fireEvent.click(option('Online session')!);
    expect(onClose).toHaveBeenCalledOnce();
    remove();
  });

  it('is gone once the section is removed', () => {
    const remove = add(section());
    renderPalette();
    expect(option('Online session')).not.toBeNull();
    remove();
    expect(option('Online session')).toBeNull();
  });
});
