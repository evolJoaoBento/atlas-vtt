import { describe, expect, it } from 'vitest';
import { withoutFrontmatterKeys } from '../../src/app/services/collectionBundle/frontmatterKeys';

const SHARE = new Set(['atlas-share']);

describe('withoutFrontmatterKeys', () => {
  it('removes registered note keys, keeps the rest and the byte order mark', () => {
    const text = '﻿---\natlas-share: everyone\ntags: [a]\n---\nBody\n';
    expect(withoutFrontmatterKeys(text, SHARE)).toBe('﻿---\ntags: [a]\n---\nBody\n');
  });

  it('drops the property with its continuation lines and keeps every other byte', () => {
    const note = [
      '---', 'tags: [a, b]', 'atlas-share:', '  - public', '  - except Cara', 'aliases:', '  - Old', "'Atlas-Share': Ana", '"atlas-share": [x,', '  y]', 'status: open', '---', 'The body says atlas-share: public.', '',
    ].join('\n');
    expect(withoutFrontmatterKeys(note, SHARE)).toBe(['---', 'tags: [a, b]', 'aliases:', '  - Old', 'status: open', '---', 'The body says atlas-share: public.', ''].join('\n'));
  });

  it('removes a list value', () => {
    expect(withoutFrontmatterKeys('---\natlas-share:\n- Ana\n- Cara\ntitle: T\n---\n', SHARE)).toBe('---\ntitle: T\n---\n');
  });

  it('removes a property that is the only one', () => {
    expect(withoutFrontmatterKeys('---\natlas-share: public\n---\nBody', SHARE)).toBe('---\n---\nBody');
  });

  it('keeps Windows line endings, and a key that only starts like the removed one', () => {
    const note = '﻿---\r\natlas-share: public\r\natlas-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n';
    expect(withoutFrontmatterKeys(note, SHARE)).toBe('﻿---\r\natlas-share-extra: 1\r\ntitle: x\r\n---\r\nBody\r\n');
  });

  it('returns the very same text with no such property, no frontmatter or an unclosed one', () => {
    for (const note of ['---\ntitle: x\n---\nBody', 'atlas-share: public\nBody', '---\natlas-share: public\nBody', '']) {
      expect(withoutFrontmatterKeys(note, SHARE)).toBe(note);
    }
  });

  it('matches keys without case and removes several at once', () => {
    expect(withoutFrontmatterKeys('---\nAtlas-Share: a\nsecret: b\nkeep: c\n---\n', new Set(['ATLAS-SHARE', 'secret']))).toBe('---\nkeep: c\n---\n');
  });

  it('does nothing without keys', () => {
    const note = '---\natlas-share: a\n---\n';
    expect(withoutFrontmatterKeys(note, new Set())).toBe(note);
  });
});
