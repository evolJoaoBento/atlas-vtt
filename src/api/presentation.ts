import { presentedScene, type PresentedSceneInfo as InternalScene } from '../app/services/PresentedScene';
import { presentTabToPlayers, stopPresenting } from '../app/services/presentToPlayers';
import { addPresentationTarget } from '../app/services/presentationTargets';
import type { DisposerSet } from './disposers';
import type { ViewTracker } from './viewTracker';
import type { Disposer, ViewId } from './types/common';
import type { PresentationApi, PresentationListener, PresentationTarget, PresentedSceneInfo } from './types/presentation';

function info(scene: InternalScene, held: boolean): PresentedSceneInfo {
  const tab = scene.view.tabMetaStore.getState().tabs.find((entry) => entry.id === scene.tabId);
  return Object.freeze({ viewId: scene.view.viewId, tabId: scene.tabId, mapPath: tab?.filePath ?? '', held });
}

export function presentationApi(tracker: ViewTracker, disposers: DisposerSet): PresentationApi {
  return Object.freeze({
    current: (): PresentedSceneInfo | null => {
      const scene = presentedScene.current();
      return scene ? info(scene, presentedScene.isHeld()) : null;
    },
    present: async (viewId: ViewId, tabId?: string): Promise<boolean> => {
      const view = tracker.view(viewId);
      const target = tabId ?? view?.tabMetaStore.getState().activeTabId ?? null;
      if (!view || !target) return false;
      await presentTabToPlayers(view, target);
      const scene = presentedScene.current();
      // A held scene is not on screen: its map did not load, or the GM moved on meanwhile.
      return Boolean(scene && scene.view === view && scene.tabId === target && !presentedScene.isHeld());
    },
    stop: (): void => stopPresenting(),
    // The presented scene's own listeners run guarded (`PresentedScene.emit`).
    subscribe: (listener: PresentationListener): Disposer => disposers.add(presentedScene.subscribe({
      presented: (scene, resumed) => listener.presented?.(info(scene, false), resumed),
      held: (scene) => listener.held?.(info(scene, true)),
      cleared: (previous) => listener.cleared?.(info(previous, false)),
    })),
    addTarget: (target: PresentationTarget): Disposer => disposers.add(addPresentationTarget(target)),
  });
}
