import type { AssetService } from '../../services/AssetService';
import type { ViewAtlasState } from '../../storeFactory';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

/**
 * The condition definitions a view's badges read: a map's collection's, or the online scene's
 * neutral ones (players never receive the GM's definitions).
 */
export function viewConditionDefinitions(
  state: Pick<ViewAtlasState, 'mapPath' | 'remoteScene'>,
  collections: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
): ConditionDefinition[] {
  if (state.remoteScene) return [...state.remoteScene.conditions];
  const collectionId = state.mapPath ? collections.getCollectionForMap(state.mapPath) : null;
  return collectionId ? collections.getCollectionSettings(collectionId).conditions : [];
}
