import { mapResources, type CollectionLookup } from '../../resources/collectionResources';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { ViewAtlasState } from '../../storeFactory';

/**
 * The resource definitions a view's tokens read: a map's collection's, or in the remote view the
 * definitions its owner feeds for each token (`RemoteView.setPlayer`), none for a token without any.
 */
export function viewResourceDefinitions(
  state: Pick<ViewAtlasState, 'mapPath' | 'remoteView'>,
  collections: CollectionLookup,
  tokenId?: string,
): readonly ResourceDefinition[] {
  if (!state.remoteView) return mapResources(collections, state.mapPath);
  const { resources } = state.remoteView;
  return tokenId !== undefined && Object.hasOwn(resources, tokenId) ? resources[tokenId] ?? [] : [];
}
