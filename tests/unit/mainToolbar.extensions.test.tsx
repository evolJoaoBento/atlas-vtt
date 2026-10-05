import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeTool: 'move',
  setActiveTool: vi.fn(),
  isPlayerView: false,
  isGMView: true,
  setGMView: vi.fn(),
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: vi.fn(),
  isAssetManagerOpen: false,
  assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false,
  setDiceTrayOpen: vi.fn(),
  lootRoller: { open: false },
  setLootRollerOpen: vi.fn(),
  objects: { tokens: {} },
  selectedIds: [],
  remoteView: null as object | null,
};

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => ({ getState: () => storeState }),
}));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: { viewId: 'view-1', getViewType: () => 'atlas-vtt', serviceManager: {} },
    mapData: null,
    renderer: null,
  }),
}));
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: () => undefined,
}));
vi.mock('../../src/app/react/hooks/useExperimentalFeature', () => ({ useExperimentalFeature: () => false }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
vi.mock('../../src/app/packages/components/toolbar/ToolbarOverflowMenu', () => ({ ToolbarOverflowMenu: () => null }));
vi.mock('../../src/app/react/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));
vi.mock('../../src/app/react/components/dice/DiceDropdownMenu', () => ({ DiceDropdownMenu: () => null }));
vi.mock('../../src/app/packages/components/toolbar/MoveToolGroup', () => ({ MoveToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/FogToolGroup', () => ({ FogToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/DrawToolGroup', () => ({ DrawToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/TextToolGroup', () => ({ TextToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/MeasureToolGroup', () => ({ MeasureToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/LightingToolGroup', () => ({ LightingToolGroup: () => null }));
vi.mock('../../src/app/packages/components/primitives/Toggle', () => ({ Toggle: () => null }));

import { MainToolbar } from '../../src/app/packages/components/MainToolbar';
import { toolbarSlot } from '../../src/app/extensions/slots';
import type { ToolbarItem } from '../../src/api/types/ui';

const item = (overrides: Partial<ToolbarItem> = {}): ToolbarItem => ({
  id: 'x', icon: 'network', label: 'Online session', priority: 60, onClick: vi.fn(), ...overrides,
});

/** Registers `toolbarItem` inside act; the returned function removes it. */
function add(toolbarItem: ToolbarItem): () => void {
  let remove = (): void => undefined;
  act(() => { remove = toolbarSlot.add('ext', toolbarItem); });
  return () => act(() => { remove(); });
}

describe('MainToolbar with extension items', () => {
  beforeEach(() => {
    storeState.isPlayerView = false;
    storeState.remoteView = null;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    expect(toolbarSlot.list()).toHaveLength(0);
  });

  const button = (): HTMLElement | null => screen.queryByRole('button', { name: 'Online session' });

  it('shows a registered item with its label and no title attribute, and removes it with its disposer', () => {
    render(<MainToolbar viewId="view-1" />);
    expect(button()).toBeNull();
    const remove = add(item());
    expect(button()).not.toBeNull();
    expect(button()?.hasAttribute('title')).toBe(false);
    remove();
    expect(button()).toBeNull();
  });

  it('calls onClick with the view context', () => {
    const onClick = vi.fn();
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ onClick }));
    fireEvent.click(button()!);
    expect(onClick).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    remove();
  });

  it('shows a count badge, and drops it after invalidate once the badge returns null', () => {
    let badge: number | null = 3;
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => badge }));
    expect(screen.getByText('3')).toBeTruthy();
    badge = null;
    act(() => { toolbarSlot.invalidate(); });
    expect(screen.queryByText('3')).toBeNull();
    remove();
  });

  it('shows a dot for a badge of true', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => true }));
    expect(container.querySelector('.atlas-ext-tool__dot')).not.toBeNull();
    remove();
  });

  it('still renders the button, without a badge, when badge or isActive throws', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({
      badge: () => { throw new Error('boom'); },
      isActive: () => { throw new Error('boom'); },
    }));
    expect(button()).not.toBeNull();
    expect(container.querySelector('.atlas-ext-tool__badge, .atlas-ext-tool__dot')).toBeNull();
    remove();
  });

  it('keeps the rest of the toolbar when onClick throws', () => {
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ onClick: () => { throw new Error('boom'); } }));
    expect(() => fireEvent.click(button()!)).not.toThrow();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeTruthy();
    remove();
  });

  it('leaves out an item that is for the remote view only', () => {
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ views: ['remote'] }));
    expect(button()).toBeNull();
    remove();
  });

  it('shows nothing of the extensions in a player view', () => {
    storeState.isPlayerView = true;
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item());
    expect(button()).toBeNull();
    remove();
  });

  it('places an item after the dice and before the loot roller, with an id of its own', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ id: 'dice' }));
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[data-toolbar-item]')).map((el) => el.dataset.toolbarItem);
    expect(ids.indexOf('ext:ext:dice')).toBe(ids.indexOf('dice') + 1);
    expect(ids.indexOf('loot')).toBe(ids.indexOf('ext:ext:dice') + 1);
    remove();
  });

  it('shows the remote view its own items, told it is the remote view, and leaves out map items and GM tools there', () => {
    storeState.isPlayerView = true;
    storeState.remoteView = {};
    const onClick = vi.fn();
    render(<MainToolbar viewId="view-1" />);
    const removeRemote = add(item({ views: ['remote'], onClick }));
    const removeMap = add(item({ id: 'map-only', label: 'Map only' }));
    fireEvent.click(button()!);
    expect(onClick).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'remote', isPlayerView: true });
    expect(screen.queryByRole('button', { name: 'Map only' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Loot Roller' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeTruthy();
    removeRemote();
    removeMap();
  });
});
