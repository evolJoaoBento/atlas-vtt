import { Notice, type App } from 'obsidian';
import { AtlasView } from '../atlas-view';
import { playerWindowStore } from '../stores/playerWindowStore';
import { presentTabInPlayerWindow } from './PlayerWindowPresenter';
import { presentedScene, whenMapLoaded, type PresentedView } from './PresentedScene';
import { activePresentationTarget } from './presentationTargets';
import { t } from '../i18n';

/**
 * Present the scene `view` shows to players. An open player window follows it
 * (`PlayerWindowPresenter`); without one, the player window is opened.
 */
export async function presentViewToPlayers(view: unknown): Promise<void> {
  // A remote view shows a scene fed from outside, never one of this vault's maps.
  const tabId = view instanceof AtlasView && !view.isRemote ? view.tabMetaStore.getState().activeTabId : null;
  if (!(view instanceof AtlasView) || view.isRemote || !tabId) {
    new Notice(t('present.openSceneFirst'));
    return;
  }
  await whenMapLoaded(view.atlasStore);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  // Nothing shows a presented scene unless the player window is open or a target is active: open the window, as presenting from it does.
  if (!playerWindowStore.getState().isOpen && !activePresentationTarget()) {
    await presentTabInPlayerWindow(view.app, view, tabId);
    return;
  }
  presentedScene.present(view, tabId);
  const name = view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId)?.displayName;
  const label = name ?? t('present.thisScene');
  // A held scene (its map did not load) is not on screen yet: players still have the previous frame.
  new Notice(t(presentedScene.isHeld() ? 'present.playersSeeOnceLoaded' : 'present.playersSee', { name: label }));
}

export function presentActiveTabToPlayers(app: App): Promise<void> {
  return presentViewToPlayers(app.workspace.getActiveViewOfType(AtlasView));
}

/**
 * Switch `view` to the scene tab `tabId`, then present it to players without
 * opening the player window.
 */
export async function presentTabToPlayers(view: PresentedView & { switchToTab(tabId: string): Promise<void> }, tabId: string): Promise<void> {
  await view.switchToTab(tabId);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  await presentViewToPlayers(view);
}

export { stopPresenting } from './stopPresenting';
