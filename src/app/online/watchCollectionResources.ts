import type { App } from 'obsidian';
import { AssetService } from '../services/AssetService';

/**
 * Calls `listener` whenever the resources a map reads from its collection may have changed: the
 * collection's settings were saved, or the asset index, which says which collection a map is in,
 * has loaded (as `useCollectionRulesRevision` does for the views). Returns the stop.
 */
export function watchCollectionResources(app: App, listener: () => void): () => void {
  let live = true;
  const changed = (): void => { if (live) listener(); };
  const ref = app.workspace.on('atlas-vtt:collection-settings-changed', changed);
  AssetService.getInstance(app).initialize().then(changed, () => undefined);
  return () => {
    live = false;
    app.workspace.offref(ref);
  };
}
