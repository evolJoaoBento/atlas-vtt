import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderToolbar, setUpToolbarTestDom, startEditing } from '../toolbarEditorHarness';

vi.mock('../../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

setUpToolbarTestDom();

const barIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.atlas-main-toolbar [data-toolbar-item]')).map((item) => item.dataset.toolbarItem ?? '');

describe("the Online session button and upstream's toolbar editor", () => {
  it('follows Dice in the GM bar, wherever the GM put Dice, and leaves the bar while the editor is open', () => {
    const harness = renderToolbar({ stored: { order: ['dice', 'move', 'fog', 'draw', 'text', 'measure', 'wall', 'pin', 'audio', 'loot', 'assets', 'palette'] } });
    expect(barIds(harness.container).slice(0, 3)).toEqual(['dice', 'online', 'move']);

    // Not in the catalog, so the editor neither moves nor hides it: it is away meanwhile, and back after.
    startEditing(harness);
    expect(barIds(harness.container)).not.toContain('online');
    act(() => harness.store.getState().setToolbarEditing(false));
    expect(barIds(harness.container)).toContain('online');
  });

  it('is not in the player view', () => {
    const harness = renderToolbar({ player: true });
    expect(barIds(harness.container)).not.toContain('online');
  });
});

describe('the online panel and toolbar edit mode', () => {
  it('ends edit mode when the panel opens, and closes the panel when edit mode starts, as the dice tray does', () => {
    const harness = renderToolbar();
    startEditing(harness);
    act(() => harness.store.getState().setOnlinePanelOpen(true));
    expect(harness.store.getState()).toMatchObject({ isOnlinePanelOpen: true, isToolbarEditing: false });
    startEditing(harness);
    expect(harness.store.getState()).toMatchObject({ isOnlinePanelOpen: false, isToolbarEditing: true });
    act(() => harness.store.getState().setOnlinePanelOpen(false));
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });
});
