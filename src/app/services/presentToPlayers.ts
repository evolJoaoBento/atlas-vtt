import { Notice, type App } from 'obsidian';
import { AtlasView } from '../atlas-view';
import { presentedScene, whenMapLoaded } from './PresentedScene';

/**
 * Present the scene `view` shows to players, without opening the player window.
 * An open player window follows it (`PlayerWindowPresenter`).
 */
export async function presentViewToPlayers(view: unknown): Promise<void> {
  const tabId = view instanceof AtlasView ? view.tabMetaStore.getState().activeTabId : null;
  if (!(view instanceof AtlasView) || !tabId) {
    new Notice('Open a scene to present it to players');
    return;
  }
  await whenMapLoaded(view.atlasStore);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  presentedScene.present(view, tabId);
  const name = view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId)?.displayName;
  new Notice(`Players see ${name ?? 'this scene'}`);
}

export function presentActiveTabToPlayers(app: App): Promise<void> {
  return presentViewToPlayers(app.workspace.getActiveViewOfType(AtlasView));
}

/**
 * Switch `view` to the scene tab `tabId`, then present it to players without
 * opening the player window.
 */
export async function presentTabToPlayers(view: AtlasView, tabId: string): Promise<void> {
  await view.switchToTab(tabId);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  await presentViewToPlayers(view);
}

/** Stop presenting: an open player window keeps the last scene it showed. */
export function stopPresenting(): void {
  if (!presentedScene.current()) return;
  presentedScene.clear();
  new Notice('Players no longer see a scene');
}
