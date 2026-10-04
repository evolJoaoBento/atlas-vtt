import type { ViewContext } from '../../api/types/ui';

/** What every slot callback is told about a map view; a new object each call, frozen. */
export function viewContextOf(view: { viewId: string }, store: { getState(): { isPlayerView?: boolean } }): ViewContext {
  return Object.freeze({ viewId: view.viewId, kind: 'map', isPlayerView: store.getState().isPlayerView === true });
}
