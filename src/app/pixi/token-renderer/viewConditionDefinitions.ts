import type { AssetService } from '../../services/AssetService';
import type { ViewAtlasState } from '../../storeFactory';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

/**
 * The condition definitions a view's badges read: a map's collection's, or the remote view's,
 * which its owner feeds (`RemoteView.setPlayer`) and never a collection's.
 */
export function viewConditionDefinitions(
  state: Pick<ViewAtlasState, 'mapPath' | 'remoteView'>,
  collections: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
): ConditionDefinition[] {
  if (state.remoteView) return [...state.remoteView.conditions];
  const collectionId = state.mapPath ? collections.getCollectionForMap(state.mapPath) : null;
  return collectionId ? collections.getCollectionSettings(collectionId).conditions : [];
}
