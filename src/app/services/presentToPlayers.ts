import { Notice, type App } from 'obsidian';
import { AtlasView } from '../atlas-view';
import { presentedScene, whenMapLoaded } from './PresentedScene';
import { t } from '../i18n';

/**
 * Present the scene `view` shows to online players, without opening the local
 * player window. An open player window follows it (`PlayerWindowPresenter`).
 */
export async function presentViewToPlayers(view: unknown): Promise<void> {
  const tabId = view instanceof AtlasView ? view.tabMetaStore.getState().activeTabId : null;
  if (!(view instanceof AtlasView) || !tabId) {
    new Notice(t('online.present.openScene'));
    return;
  }
  await whenMapLoaded(view.atlasStore);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  presentedScene.present(view, tabId);
  const name = view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId)?.displayName;
  new Notice(name !== undefined ? t('online.present.playersSee', { name }) : t('online.present.playersSeeThisScene'));
}

export function presentActiveTabToPlayers(app: App): Promise<void> {
  return presentViewToPlayers(app.workspace.getActiveViewOfType(AtlasView));
}

/**
 * Switch `view` to the scene tab `tabId`, then present it to online players without
 * opening the local player window: the scene tab's eye while a session runs.
 */
export async function presentTabToPlayers(view: AtlasView, tabId: string): Promise<void> {
  await view.switchToTab(tabId);
  if (view.isClosed || view.tabMetaStore.getState().activeTabId !== tabId) return;
  await presentViewToPlayers(view);
}

/** Players keep the last scene they saw in the local window; online players see none. */
export function stopPresenting(): void {
  if (!presentedScene.current()) return;
  presentedScene.clear();
  new Notice(t('online.present.stopped'));
}
