/**
 * What a scene tab's eye button does. While a presentation target is active (an audience
 * besides the player window) it presents the tab to that audience only, and its context
 * menu opens the player window; without one it opens the player window.
 */
import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { presentTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { activePresentationTarget } from '../services/presentationTargets';
import { presentTabToPlayers } from '../services/presentToPlayers';
import { openContextMenuGlobal, type ContextMenuEntry } from './root/ContextMenuContext';

const OPEN_PLAYER_WINDOW_LABEL = 'Open player window';

const anyTargetActive = (): boolean => activePresentationTarget() !== null;

export function presentTab(app: App, view: AtlasView, tabId: string): void {
  if (anyTargetActive()) void presentTabToPlayers(view, tabId);
  else void presentTabInPlayerWindow(app, view, tabId);
}

/** Opens the eye's context menu while a target is active and returns true; otherwise it does nothing and returns false. */
export function openPresentMenu(app: App, view: AtlasView, tabId: string, position: { x: number; y: number }): boolean {
  if (!anyTargetActive()) return false;
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: OPEN_PLAYER_WINDOW_LABEL, icon: 'monitor-up', onClick: () => { void presentTabInPlayerWindow(app, view, tabId).catch((error: unknown) => console.error('[Atlas] Opening the player window failed:', error)); } },
  ];
  openContextMenuGlobal(entries, position);
  return true;
}
