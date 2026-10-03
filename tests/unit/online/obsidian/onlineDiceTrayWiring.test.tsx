import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const setActiveTool = vi.fn();
const setSelectionMode = vi.fn();
const setGMView = vi.fn();
const setCommandPaletteOpen = vi.fn();
const setDiceTrayOpen = vi.fn();
const setSelection = vi.fn();
const openAssetManager = vi.fn();
const closeAssetManager = vi.fn();
const setInitiativeTrackerOpen = vi.fn();
const setOnlinePanelOpen = vi.fn();

const { rollDice, trayProps } = vi.hoisted(() => ({ rollDice: vi.fn(() => true), trayProps: { current: {} as Record<string, any> } }));

let capturedShortcuts: Record<string, (event: KeyboardEvent) => void> = {};

const storeState = {
  activeTool: 'move',
  setActiveTool,
  selectionMode: 'box',
  setSelectionMode,
  isGMView: true,
  setGMView,
  isCommandPaletteOpen: false,
  setCommandPaletteOpen,
  isAssetManagerOpen: false,
  assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false,
  setDiceTrayOpen,
  initiativeTrackerOpen: false,
  lootRoller: { open: false },
  setLootRollerOpen: vi.fn(),
  isOnlinePanelOpen: false,
  setOnlinePanelOpen,
  setInitiativeTrackerOpen,
  objects: { tokens: {} },
  remoteScene: {},
  setSelection,
  openAssetManager,
  closeAssetManager,
};

const storeHook = {
  getState: () => storeState,
};

vi.mock('../../../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => storeHook,
}));

vi.mock('../../../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: {
      getViewType: () => 'atlas-vtt',
      onlineControls: () => ({ rollDice }),
      serviceManager: {
        getEventBus: () => null,
        getToolController: () => ({ getDiceTool: () => ({}) }),
        getNotePreviewUIManager: () => null,
      },
      setFogBrushSize: vi.fn(),
      clearAllFog: vi.fn(),
    },
    mapData: null,
  }),
}));

vi.mock('../../../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: (shortcuts: Record<string, (event: KeyboardEvent) => void>) => {
    capturedShortcuts = shortcuts;
  },
}));

vi.mock('../../../../src/app/utils/activeLeafGuard', () => ({
  isActiveAtlasLeaf: () => true,
}));

vi.mock('../../../../src/app/packages/components/primitives/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LabelTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../src/app/packages/components/primitives/ToolButton', () => ({
  ToolButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('../../../../src/app/packages/components/primitives/DropdownMenu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../src/app/packages/components/primitives/DropdownMenuItem', () => ({
  DropdownMenuItem: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('../../../../src/app/packages/components/primitives/DropdownToggleRow', () => ({
  DropdownToggleRow: () => null,
}));

vi.mock('../../../../src/app/packages/components/primitives/DropdownSliderRow', () => ({
  DropdownSliderRow: () => null,
}));

vi.mock('../../../../src/app/packages/components/primitives/DropdownModeSelector', () => ({
  DropdownModeSelector: () => null,
}));

vi.mock('../../../../src/app/packages/components/primitives/Toggle', () => ({
  Toggle: () => null,
}));

vi.mock('../../../../src/app/react/components/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('../../../../src/app/packages/components/asset-manager/AssetManager', () => ({
  default: () => null,
}));

vi.mock('../../../../src/app/react/components/dice/DiceDropdownMenu', () => ({
  DiceDropdownMenu: (props: Record<string, unknown>) => { trayProps.current = props; return null; },
}));

import { MainToolbar } from '../../../../src/app/packages/components/MainToolbar';

describe('the online scene dice tray in the toolbar', () => {
  // The online scene is a player view, so Atlas's dice toasts (`DiceRollDisplay`) are not mounted there.
  it('sends the picks and the modifier as a dice-roll, within the GM limit', () => {
    render(<MainToolbar viewId="view-1" />);
    const { onRoll, maxDice } = trayProps.current as { onRoll(pool: Record<number, number>, modifier: number): boolean; maxDice: number };
    expect(maxDice).toBe(20);
    expect(onRoll({ 6: 2, 20: 0 }, 0)).toBe(true);
    expect(rollDice).toHaveBeenCalledWith({ d6: 2 }, 0);
    expect(onRoll({ 6: 1 }, 3)).toBe(true);
    expect(rollDice).toHaveBeenLastCalledWith({ d6: 1 }, 3);
    rollDice.mockClear();
    expect(onRoll({ 6: 21 }, 0)).toBe(false);
    expect(rollDice).not.toHaveBeenCalled();
    rollDice.mockReturnValueOnce(false);
    expect(onRoll({ 6: 1 }, 0)).toBe(false);
  });
});
