import { showsTab, whenMapLoaded } from '../app/services/PresentedScene';
import { viewCamera, watchViewCamera } from '../app/services/presentedCamera';
import type { DisposerSet } from './disposers';
import { acceptsListener } from './listenerCheck';
import { isRemoteView, sceneSnapshot, snapshotSlice, viewInfo } from './viewInfo';
import type { TrackedMapView, ViewTracker } from './viewTracker';
import type { SceneSnapshot, ViewCamera, ViewInfo, ViewsApi } from './types/views';
import type { Disposer, ViewId } from './types/common';

function sameSlice(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** An extension's callback must never throw into Atlas's store or frame loop. */
function callGuarded<T>(listener: (value: T) => void, value: T): void {
  try {
    listener(value);
  } catch (error) {
    console.error('[Atlas API] A view listener failed:', error);
  }
}

/** Registers `start`'s teardown with the extension and ends it when `view` closes, so a closed view is never retained. */
function ownedByView(tracker: ViewTracker, disposers: DisposerSet, view: TrackedMapView, start: () => () => void): Disposer {
  let cancelClose: () => void = () => undefined;
  const stop = start();
  const dispose = disposers.add(() => { cancelClose(); stop(); });
  cancelClose = tracker.onClose(view.viewId, dispose);
  return dispose;
}

/** Each view's `showTab` requests, shared by every extension: a later one overtakes an earlier one. */
const showRequests = new WeakMap<TrackedMapView, number>();

/** `views.showTab`: switches to `tabId` without presenting it; true only when this request's tab is the one loaded. */
async function showTab(tracker: ViewTracker, viewId: ViewId, tabId: string): Promise<boolean> {
  const view = tracker.view(viewId);
  if (!view || isRemoteView(view) || typeof tabId !== 'string') return false;
  if (!view.tabMetaStore.getState().tabs.some((tab) => tab.id === tabId)) return false;
  const request = (showRequests.get(view) ?? 0) + 1;
  showRequests.set(view, request);
  try {
    await view.switchToTab(tabId);
    await whenMapLoaded(view.atlasStore);
  } catch (error) {
    console.error('[Atlas API] views.showTab: switching tabs failed:', error);
    return false;
  }
  return showRequests.get(view) === request && !view.isClosed && showsTab(view, tabId);
}

/** `withTabs`: the `scene-tabs` members are attached (`showTab`). */
export function viewsApi(tracker: ViewTracker, disposers: DisposerSet, withTabs = false): ViewsApi {
  return Object.freeze({
    list: (): ViewInfo[] => tracker.views().map(viewInfo),
    active: (): ViewInfo | null => {
      const active = tracker.activeView();
      return active ? viewInfo(active) : null;
    },
    snapshot: (viewId: ViewId): SceneSnapshot | null => {
      const view = tracker.view(viewId);
      return view ? sceneSnapshot(view) : null;
    },
    subscribe: (viewId: ViewId, listener: (snapshot: SceneSnapshot) => void): Disposer => {
      if (!acceptsListener('views.subscribe', listener)) return () => undefined;
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      let slice = snapshotSlice(view);
      const changed = (): void => {
        if (view.isClosed) return;
        const next = snapshotSlice(view);
        if (sameSlice(slice, next)) return;
        slice = next;
        callGuarded(listener, sceneSnapshot(view));
      };
      // The tab meta store too: `tabId` changes when the active tab does, before the scene store hears of it.
      return ownedByView(tracker, disposers, view, () => {
        const stopScene = view.atlasStore.subscribe(changed);
        const stopTabs = view.tabMetaStore.subscribe(changed);
        return (): void => { stopScene(); stopTabs(); };
      });
    },
    camera: (viewId: ViewId): ViewCamera | null => {
      const view = tracker.view(viewId);
      const camera = view ? viewCamera(view) : null;
      return camera ? Object.freeze(camera) : null;
    },
    watchCamera: (viewId: ViewId, listener: (camera: ViewCamera) => void): Disposer => {
      if (!acceptsListener('views.watchCamera', listener)) return () => undefined;
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      return ownedByView(tracker, disposers, view, () => watchViewCamera(view, () => {
        if (view.isClosed) return;
        const camera = viewCamera(view);
        if (camera) callGuarded(listener, Object.freeze(camera));
      }));
    },
    ...(withTabs ? { showTab: (viewId: ViewId, tabId: string): Promise<boolean> => showTab(tracker, viewId, tabId) } : {}),
  });
}
