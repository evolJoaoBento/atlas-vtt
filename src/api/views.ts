import { viewCamera, watchViewCamera } from '../app/services/presentedCamera';
import type { DisposerSet } from './disposers';
import { sceneSnapshot, snapshotSlice, viewInfo } from './viewInfo';
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

export function viewsApi(tracker: ViewTracker, disposers: DisposerSet): ViewsApi {
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
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      let slice = snapshotSlice(view.atlasStore.getState());
      return ownedByView(tracker, disposers, view, () => view.atlasStore.subscribe((state) => {
        if (view.isClosed) return;
        const next = snapshotSlice(state);
        if (sameSlice(slice, next)) return;
        slice = next;
        callGuarded(listener, sceneSnapshot(view));
      }));
    },
    camera: (viewId: ViewId): ViewCamera | null => {
      const view = tracker.view(viewId);
      return view ? viewCamera(view) : null;
    },
    watchCamera: (viewId: ViewId, listener: (camera: ViewCamera) => void): Disposer => {
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      return ownedByView(tracker, disposers, view, () => watchViewCamera(view, () => {
        if (view.isClosed) return;
        const camera = viewCamera(view);
        if (camera) callGuarded(listener, camera);
      }));
    },
  });
}
