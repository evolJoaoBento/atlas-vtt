import { describe, expect, it } from 'vitest';
import { rewriteLinks } from '../../../../src/app/online/sharing/model/noteLinks';

const shared = (path: string): string | null => (path === 'Cave' || path === 'Places/Cave.md' ? 'Cave' : null);

describe('links in shared notes', () => {
  it('keeps links to notes the receiver gets, by their shared title', () => {
    expect(rewriteLinks('See [[Cave]], [[Cave#Entrance|the entrance]] and ![[Cave]].', shared))
      .toBe('See [[Cave]], [[Cave#Entrance|the entrance]] and ![[Cave]].');
    expect(rewriteLinks('[into](Places/Cave.md)', shared)).toBe('[[Cave|into]]');
  });

  it('turns other links into their text', () => {
    expect(rewriteLinks('[[Secret lair]] and [[Folder/Secret lair|the lair]] and [[#Heading]]', shared))
      .toBe('Secret lair and the lair and Heading');
    expect(rewriteLinks('![[map.png]] [x](Notes/Hidden%20one.md)', shared)).toBe('map.png x');
    expect(rewriteLinks('![[map.png|100]] ![[map.png|a map]]', shared)).toBe('map.png a map');
    expect(rewriteLinks('[a [b]](Notes/Secret.md)', shared)).toBe('a [b]');
  });

  it('leaves web links alone', () => {
    expect(rewriteLinks('[site](https://example.org) ![](https://example.org/a.png)', shared))
      .toBe('[site](https://example.org) ![](https://example.org/a.png)');
  });

  it('resolves reference-style links like inline ones and drops their definitions (F5)', () => {
    const text = 'See [the lair][lair] and [Cave][] and [web][w] and [Short].\n\n'
      + '[lair]: Notes/Secret%20lair.md "Title"\n[CAVE]: Places/Cave.md\n[w]: https://example.org\n[short]: <Notes/Short one.md>\n[unused]: Hidden/Unused.md';
    expect(rewriteLinks(text, shared)).toBe('See the lair and [[Cave|Cave]] and [web][w] and Short.\n\n[w]: https://example.org');
    expect(rewriteLinks('a\n> [x]: Notes/Hidden.md\n- [y]: Notes/Hidden.md\nb', shared)).toBe('a\nb');
    expect(rewriteLinks('![alt][img]\n\n[img]: art/secret.png', shared)).toBe('alt\n');
  });

  it('leaves footnotes and unrelated brackets alone', () => {
    expect(rewriteLinks('Text[^1] and [not a link]\n\n[^1]: Footnote', shared)).toBe('Text[^1] and [not a link]\n\n[^1]: Footnote');
  });

  it('strips local href and src from HTML, and keeps web ones (F5)', () => {
    expect(rewriteLinks('<a href="Notes/Secret.md">x</a> <img src=\'art/s.png\' alt="a"> <a href=https://example.org/x>w</a> <IMG SRC=Notes/p.png>', shared))
      .toBe('<a>x</a> <img alt="a"> <a href=https://example.org/x>w</a> <IMG>');
    expect(rewriteLinks('<img srcset="a.png 1x, https://example.org/b.png 2x" src="https://example.org/b.png"> <a href="#top">t</a>', shared))
      .toBe('<img src="https://example.org/b.png"> <a href="#top">t</a>');
  });
});
