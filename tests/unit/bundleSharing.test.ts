import { describe, expect, it } from 'vitest';
import type { Asset, SceneAsset } from '../../src/app/services/AssetService';
import { withoutJsonSharing, withoutSceneSharing } from '../../src/app/services/collectionBundle/bundleSharing';
import { rewriteContent, toBuffer } from '../../src/app/services/collectionBundle/bundleContent';
import type { BundleFile } from '../../src/app/services/collectionBundle/bundleFormat';
import { assetFingerprint } from '../../src/app/services/collectionBundle/fingerprints';
import { installedAsset, type ImportTargets } from '../../src/app/services/collectionBundle/importInputs';

const share = { item: 'i'.repeat(22), everyone: true, people: [`${'T'.repeat(43)}/ana`], except: [], mode: 'full', notes: ['Notes/Secret.md'] } as const;
const scene = (data: SceneAsset['data']): SceneAsset => ({ id: 's1', type: 'scene', name: 'Inn', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, data });

describe('a map share never travels in a bundle', () => {
  it('is dropped from scene records and left alone on other assets', () => {
    expect((withoutSceneSharing(scene({ mapPath: 'm.atlasmap', sharing: share })) as SceneAsset).data).toEqual({ mapPath: 'm.atlasmap' });
    const unshared = scene({ mapPath: 'm.atlasmap' });
    expect(withoutSceneSharing(unshared)).toBe(unshared);
    const token = { id: 't', type: 'token', name: 'x', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1 } as unknown as Asset;
    expect(withoutSceneSharing(token)).toBe(token);
  });

  it('is dropped when a bundle is installed', () => {
    const targets = { collectionId: 'target', assetIds: new Map<string, string>(), rewrites: new Map<string, string>() } as unknown as ImportTargets;
    expect((installedAsset(scene({ mapPath: 'm.atlasmap', sharing: share }), targets) as SceneAsset).data).toEqual({ mapPath: 'm.atlasmap' });
  });

  it('is dropped from a scene record file in the bundle, with or without moved paths', () => {
    const file = { vaultPath: 'atlas-vtt/collections/c/scenes/s1.json', role: 'asset-file', sha256: 'x' } as unknown as BundleFile;
    const text = JSON.stringify({ name: 'Inn', mapPath: 'm.atlasmap', sharing: share }, null, 2);
    const unchanged = new Map<string, string>();
    const out = JSON.parse(new TextDecoder().decode(rewriteContent(file, toBuffer(text), unchanged))) as Record<string, unknown>;
    expect(out).toEqual({ name: 'Inn', mapPath: 'm.atlasmap' });
    const moved = JSON.parse(new TextDecoder().decode(rewriteContent(file, toBuffer(text), new Map([['m.atlasmap', 'n.atlasmap']])))) as Record<string, unknown>;
    expect(moved).toEqual({ name: 'Inn', mapPath: 'n.atlasmap' });
    expect(withoutJsonSharing({ type: 'scene', data: { mapPath: 'm', sharing: share } })).toEqual({ type: 'scene', data: { mapPath: 'm' } });
    expect(withoutJsonSharing({ mapPath: 'm' })).toEqual({ mapPath: 'm' });
  });

  it('does not make a shared scene look edited', async () => {
    expect(await assetFingerprint(scene({ mapPath: 'm.atlasmap', sharing: share }))).toBe(await assetFingerprint(scene({ mapPath: 'm.atlasmap' })));
  });
});
