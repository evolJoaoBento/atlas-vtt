import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../../../src/app/online/obsidian/remoteScene';

const controls = { followGm: vi.fn(), fitMap: vi.fn(), reconnect: vi.fn(), rollDice: vi.fn((): string | null => null) };
const storeState: Record<string, unknown> = {
  activeTool: 'move', setActiveTool: vi.fn(), selectionMode: 'box', setSelectionMode: vi.fn(), isGMView: true, setGMView: vi.fn(),
  isCommandPaletteOpen: false, setCommandPaletteOpen: vi.fn(), isAssetManagerOpen: false, assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false, setDiceTrayOpen: vi.fn(), initiativeTrackerOpen: false, lootRoller: { open: false }, setLootRollerOpen: vi.fn(),
  isOnlinePanelOpen: false, setOnlinePanelOpen: vi.fn(), setInitiativeTrackerOpen: vi.fn(), objects: { tokens: {} },
  setSelection: vi.fn(), openAssetManager: vi.fn(), closeAssetManager: vi.fn(), remoteScene: null,
};

vi.mock('../../../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => ({ getState: () => storeState }),
}));
vi.mock('../../../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: {
      getViewType: () => 'atlas-online-scene',
      onlineControls: () => controls,
      serviceManager: { getEventBus: () => null, getToolController: () => null, getNotePreviewUIManager: () => null },
    },
  }),
}));
vi.mock('../../../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: () => {},
}));
vi.mock('../../../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
vi.mock('../../../../src/app/packages/components/primitives/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LabelTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../../src/app/packages/components/primitives/ToolButton', () => ({
  ToolButton: ({ label, onClick }: { label: string; onClick?: () => void }) => <button type="button" onClick={onClick}>{label}</button>,
}));
vi.mock('../../../../src/app/packages/components/primitives/DropdownMenu', () => ({ DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownMenuItem', () => ({ DropdownMenuItem: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownToggleRow', () => ({ DropdownToggleRow: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownSliderRow', () => ({ DropdownSliderRow: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownModeSelector', () => ({ DropdownModeSelector: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/Toggle', () => ({ Toggle: () => <div>GM view switch</div> }));
vi.mock('../../../../src/app/react/components/CommandPalette', () => ({ CommandPalette: () => <div>palette</div> }));
vi.mock('../../../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => <div>asset manager</div> }));
vi.mock('../../../../src/app/react/components/dice/DiceDropdownMenu', () => ({ DiceDropdownMenu: () => null }));

import { MainToolbar } from '../../../../src/app/packages/components/MainToolbar';

const GM_ONLY = ['Fog Tool', 'Draw Tool', 'Text Tool', 'Note Pin Tool', 'Online session', 'Loot Roller', 'Asset Manager', 'Command Palette'];

afterEach(() => {
  cleanup();
  storeState.remoteScene = null;
  vi.clearAllMocks();
});

describe('the online scene toolbar', () => {
  it("keeps the player's tools only, and the palette and asset manager away", () => {
    storeState.remoteScene = initialRemoteScene();
    render(<MainToolbar viewId="online" />);
    for (const label of ['Move/Select', 'Measure Line', 'Roll Dice']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    for (const label of GM_ONLY) expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(screen.queryByText('GM view switch')).toBeNull();
    expect(screen.queryByText('palette')).toBeNull();
    expect(screen.queryByText('asset manager')).toBeNull();
  });

  it('shows Follow GM and Fit map only while the player has broken away', () => {
    storeState.remoteScene = initialRemoteScene();
    const { rerender } = render(<MainToolbar viewId="online" />);
    expect(screen.queryByRole('button', { name: 'Follow GM' })).toBeNull();
    storeState.remoteScene = { ...initialRemoteScene(), following: false };
    rerender(<MainToolbar viewId="online" />);
    fireEvent.click(screen.getByRole('button', { name: 'Follow GM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
    expect(controls.followGm).toHaveBeenCalledOnce();
    expect(controls.fitMap).toHaveBeenCalledOnce();
  });

  it('GM toolbar: a map view keeps every tool and no Follow GM', () => {
    render(<MainToolbar viewId="map" />);
    for (const label of GM_ONLY) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow GM' })).toBeNull();
    expect(screen.getByText('GM view switch')).toBeTruthy();
  });
});
