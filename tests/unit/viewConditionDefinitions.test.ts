import { describe, expect, it, vi } from 'vitest';
import { viewConditionDefinitions } from '../../src/app/pixi/token-renderer/viewConditionDefinitions';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';

const prone = { id: 'prone', name: 'Prone', color: '#ff0000' };
const collections = {
  getCollectionForMap: vi.fn((path: string) => (path.startsWith('atlas-vtt/collections/c/') ? 'c' : null)),
  getCollectionSettings: vi.fn(() => ({ conditions: [prone] })),
};

describe('viewConditionDefinitions', () => {
  it("reads a map's conditions from its collection, as before", () => {
    expect(viewConditionDefinitions({ mapPath: 'atlas-vtt/collections/c/scenes/a.atlasmap', remoteView: null }, collections as never)).toEqual([prone]);
    expect(viewConditionDefinitions({ mapPath: 'elsewhere.atlasmap', remoteView: null }, collections as never)).toEqual([]);
    expect(viewConditionDefinitions({ mapPath: null, remoteView: null }, collections as never)).toEqual([]);
  });

  it("shows the remote view's badges and never reads a collection for it", () => {
    collections.getCollectionForMap.mockClear();
    const neutral = { id: 'x', name: 'Condition', color: '#5b5f6a' };
    const remoteView = { ...initialRemoteViewState(), conditions: [neutral] };
    expect(viewConditionDefinitions({ mapPath: null, remoteView }, collections as never)).toEqual([neutral]);
    expect(collections.getCollectionForMap).not.toHaveBeenCalled();
  });
});
