import { viewCamera, watchViewCamera } from '../app/services/presentedCamera';
import type { DisposerSet } from './disposers';
import { sceneSnapshot, snapshotSlice, viewInfo } from './viewInfo';
import type { ViewTracker } from './viewTracker';
import type { SceneSnapshot, ViewCamera, ViewInfo, ViewsApi } from './types/views';
import type { Disposer, ViewId } from './types/common';

function sameSlice(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
      return disposers.add(view.atlasStore.subscribe((state) => {
        const next = snapshotSlice(state);
        if (sameSlice(slice, next)) return;
        slice = next;
        listener(sceneSnapshot(view));
      }));
    },
    camera: (viewId: ViewId): ViewCamera | null => {
      const view = tracker.view(viewId);
      return view ? viewCamera(view) : null;
    },
    watchCamera: (viewId: ViewId, listener: (camera: ViewCamera) => void): Disposer => {
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      return disposers.add(watchViewCamera(view, () => {
        const camera = viewCamera(view);
        if (camera) listener(camera);
      }));
    },
  });
}
