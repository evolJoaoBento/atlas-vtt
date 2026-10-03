import { mapResources, type CollectionLookup } from '../../resources/collectionResources';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { ViewAtlasState } from '../../storeFactory';

/**
 * The resource definitions a view's tokens read: a map's collection's, or in the online scene the
 * stand-ins of each token (players never receive the GM's definitions), none for a token without any.
 */
export function viewResourceDefinitions(
  state: Pick<ViewAtlasState, 'mapPath' | 'remoteScene'>,
  collections: CollectionLookup,
  tokenId?: string,
): readonly ResourceDefinition[] {
  if (!state.remoteScene) return mapResources(collections, state.mapPath);
  const { resources } = state.remoteScene;
  return tokenId !== undefined && Object.hasOwn(resources, tokenId) ? resources[tokenId] ?? [] : [];
}
