import { describe, expect, it } from 'vitest';
import type { Asset, SceneAsset } from '../../src/app/services/AssetService';
import { withoutJsonSharing, withoutSceneSharing } from '../../src/app/services/collectionBundle/bundleSharing';
import { mayRewrite, refersToFiles, rewriteContent, rewriteText, toBuffer } from '../../src/app/services/collectionBundle/bundleContent';
import { withoutShareProperty } from '../../src/app/online/sharing/model/frontmatterFilter';
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

describe("a note's atlas-share property never travels in a bundle", () => {
  const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);
  const pack = (file: BundleFile, text: string, rewrites = new Map<string, string>()): string => decode(rewriteContent(file, toBuffer(text), rewrites));

  it('drops the property with its continuation lines and keeps every other byte', () => {
    const note = [
      '---', 'tags: [a, b]', 'atlas-share:', '  - public', '  - except Cara', 'aliases:', '  - Old', "'Atlas-Share': Ana", '"atlas-share": [x,', '  y]', 'status: open', '---', 'The body says atlas-share: public.', '',
    ].join('\n');
    expect(withoutShareProperty(note)).toBe(['---', 'tags: [a, b]', 'aliases:', '  - Old', 'status: open', '---', 'The body says atlas-share: public.', ''].join('\n'));
  });

  it('keeps a byte order mark and Windows line endings, and a key that only starts like it', () => {
    const note = '\uFEFF---\r\natlas-share: public\r\natlas-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n';
    expect(withoutShareProperty(note)).toBe('\uFEFF---\r\natlas-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n');
  });

  it('returns the very same text when there is no such property, no frontmatter or an unclosed one', () => {
    for (const note of ['---\ntitle: x\n---\nBody', 'atlas-share: public\nBody', '---\natlas-share: public\nBody']) expect(withoutShareProperty(note)).toBe(note);
  });

  it('is applied to every note role and path, with or without moved paths, and never to other files', () => {
    const note = '---\natlas-share: [Ana]\ntitle: T\n---\nText';
    for (const role of ['linked-note', 'statblock-note', 'loot-item'] as const) {
      const file = { vaultPath: `Notes/${role}.md`, role } as BundleFile;
      expect(mayRewrite(file, new Map())).toBe(true);
      expect(pack(file, note)).toBe('---\ntitle: T\n---\nText');
    }
    const png = { vaultPath: 'Notes/a.png', role: 'note-attachment' } as BundleFile;
    const bytes = toBuffer(note);
    expect(rewriteContent(png, bytes, new Map())).toBe(bytes);
    const unshared = toBuffer('---\ntitle: T\n---\n');
    expect(rewriteContent({ vaultPath: 'a.md', role: 'linked-note' }, unshared, new Map())).toBe(unshared);
  });

  it("still relinks a statblock note's artwork, from the text without the property", () => {
    const file = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } } as BundleFile;
    expect(pack(file, '---\natlas-share: public\nimage: B/g.png\n---\n', new Map([['B/g.png', 'C/g.png']]))).toBe('---\nimage: "C/g.png"\n---\n');
  });

  it("is not applied when a scene moves to another collection: the user's own notes keep their property", () => {
    // `assetTransfer` rewrites through `rewriteText` and `refersToFiles`, which leave the property alone
    const file = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } } as BundleFile;
    const note = '---\natlas-share: public\nimage: B/g.png\n---\n';
    expect(rewriteText(file, note, new Map([['B/g.png', 'C/g.png']]))).toBe('---\natlas-share: public\nimage: "C/g.png"\n---\n');
    expect(refersToFiles({ vaultPath: 'Notes/a.md', role: 'linked-note' } as BundleFile)).toBe(false);
    expect(rewriteText({ vaultPath: 'Notes/a.md', role: 'linked-note' } as BundleFile, note, new Map([['x', 'y']]))).toBe(note);
  });
});
