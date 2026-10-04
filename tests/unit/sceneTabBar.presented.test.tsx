import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { presentedScene, type PresentedView } from '../../src/app/services/PresentedScene';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { addPresentationTarget } from '../../src/app/services/presentationTargets';

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  presentedScene.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  presentedScene.clear();
});

it('marks the tab presented to players, whether or not the player window is open', () => {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().addTab('Caves.atlasmap', 'Caves');
  tabMetaStore.getState().setActiveTab(tavern);
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  const { container } = render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  const pressed = (): number => container.querySelectorAll('[aria-pressed="true"]').length;
  expect(pressed()).toBe(0);

  const view = { tabMetaStore, atlasStore: createStore(() => ({ isMapLoading: false })), register: () => {} } as unknown as PresentedView;
  act(() => { presentedScene.present(view, tavern); });
  expect(pressed()).toBe(1);

  const elsewhere = createTabMetaStore();
  const otherTab = elsewhere.getState().addTab('Other.atlasmap', 'Other');
  act(() => { presentedScene.present({ ...view, tabMetaStore: elsewhere } as PresentedView, otherTab); });
  expect(pressed()).toBe(0);

  act(() => { presentedScene.present(view, tavern); });
  act(() => { presentedScene.clear(); });
  expect(pressed()).toBe(0);
});

it("turns the presented tab's eye into a hide button that stops presenting while a target is active", () => {
  const stop = addPresentationTarget({ id: 't', label: 'online players', isActive: () => true });
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().setActiveTab(tavern);
  const onPresentTab = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  const { getByRole } = render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={onPresentTab} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  const view = { tabMetaStore, atlasStore: createStore(() => ({ isMapLoading: false })), register: () => {} } as unknown as PresentedView;
  act(() => { presentedScene.present(view, tavern); });

  act(() => { getByRole('button', { name: 'Stop presenting Tavern' }).click(); });
  expect(onPresentTab).not.toHaveBeenCalled();
  expect(presentedScene.current()).toBeNull();
  stop();
});

it('keeps the plain eye on the presented tab without a target', () => {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().setActiveTab(tavern);
  const onPresentTab = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  const { getByRole, queryByRole } = render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={onPresentTab} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  const view = { tabMetaStore, atlasStore: createStore(() => ({ isMapLoading: false })), register: () => {} } as unknown as PresentedView;
  act(() => { presentedScene.present(view, tavern); });

  expect(queryByRole('button', { name: 'Stop presenting Tavern' })).toBeNull();
  act(() => { getByRole('button', { name: 'Tavern is shown to players' }).click(); });
  expect(onPresentTab).toHaveBeenCalledWith(tavern);
  expect(presentedScene.current()).not.toBeNull();
});
