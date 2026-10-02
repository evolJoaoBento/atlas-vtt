import { describe, expect, it } from 'vitest';
import { filterNoteFor, unknownNamesIn, unreadablePrivateTextIn } from '../../../../src/app/online/sharing/model/noteFilter';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const person = (personId: string, name: string): Person => ({ tableId: T, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0 });
const list = [person('ana', 'Ana'), person('ben', 'Ben'), person('cara', 'Cara')];
const people = { byName: (name: string): Person | null => list.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null };
const forPerson = (personId: string, source: string, shareable: string[] = ['tags']): string =>
  filterNoteFor(source, { recipient: { tableId: T, personId }, people, shareable, links: () => null });

describe('filtering a note for one person', () => {
  it('never sends private callouts', () => {
    const source = 'Open.\n\n> [!private]\n> Secret.\n> More secret.\n\nAfter.';
    expect(forPerson('ana', source)).toBe('Open.\n\n\nAfter.');
  });

  it('sends only and except sections to the right people, case-insensitively', () => {
    const source = '> [!ONLY|ana, Ben]\n> For two.\n\n> [!except|Cara]\n> Not Cara.\n\nAll.';
    expect(forPerson('ana', source)).toBe(source);
    expect(forPerson('cara', source)).toBe('\n\nAll.');
    expect(forPerson('ben', source)).toContain('For two.');
  });

  it('nested sections must pass every rule', () => {
    const source = '> [!only|Ana, Ben]\n> Both.\n> > [!except|Ben]\n> > Ana only.\n>\n> Both again.';
    expect(forPerson('ana', source)).toBe(source);
    expect(forPerson('ben', source)).toBe('> [!only|Ana, Ben]\n> Both.\n>\n> Both again.');
    expect(forPerson('cara', source)).toBe('');
  });

  it('lazy continuation stays private: only a blank line, a heading or a fence ends a callout', () => {
    expect(forPerson('ana', '> [!private]\n> Secret.\nStill secret, rendered inside.\n\nPublic.')).toBe('\nPublic.');
    expect(forPerson('ana', '> [!private]\n> Secret.\n# Heading\nPublic.')).toBe('# Heading\nPublic.');
    expect(forPerson('ana', '> [!private]\n> Secret.\n```\ncode\n```')).toBe('```\ncode\n```');
    // A deeper callout continues lazily onto a shallower quote line, and a callout header inside one is text of it.
    expect(forPerson('ana', '> > [!private]\n> > Secret.\n> lazy secret\n> [!only|Ana]\n>\n> shown')).toBe('>\n> shown');
  });

  it('removes comments inline and across lines, but not inside code fences', () => {
    const source = 'A %%hidden%% B\n%%\nhidden\n%%\nC\n```\n%% kept in code %%\n```';
    expect(forPerson('ana', source)).toBe('A  B\nC\n```\n%% kept in code %%\n```');
    expect(forPerson('ana', 'x %% open to the end\nstill hidden')).toBe('x');
  });

  it('a look-alike fence never keeps a comment, and a closing fence has no info string', () => {
    expect(forPerson('ana', 'x\n    ```\n%% secret %%\ny')).toBe('x\n    ```\ny');
    expect(forPerson('ana', '```\n```js\n%% in code %%\n```\n%% gone %%\nz')).toBe('```\n```js\n%% in code %%\n```\nz');
    expect(forPerson('ana', 'a `` ``` `` b\n%% gone %%\nc')).toBe('a `` ``` `` b\nc');
  });

  it('unknown names: only reaches nobody, except hides from everyone, and the sender is told', () => {
    const source = '> [!only|Zed]\n> Z.\n\n> [!except|Yan]\n> Y.\n\nRest.';
    expect(forPerson('ana', source)).toBe('\n\nRest.');
    expect(unknownNamesIn(source, people)).toEqual(['Yan', 'Zed']);
    expect(unknownNamesIn('---\natlas-share: [Ana, except Quin]\n---\nx', people)).toEqual(['Quin']);
  });

  it('keeps only shareable properties and never atlas-share', () => {
    const source = '---\natlas-share: [Ana]\ntags:\n  - npc\nsecret: gold\naliases: [Bob]\n# comment\n---\nBody';
    expect(forPerson('ana', source, ['tags', 'atlas-share'])).toBe('---\ntags:\n  - npc\n---\nBody');
    expect(forPerson('ana', source, [])).toBe('Body');
    expect(forPerson('ana', '---\nunclosed\nBody')).toBe('---\nunclosed\nBody');
  });
});

describe('callouts nested in lists and indentation (B1)', () => {
  it('a callout in a list item, with its body on the following lines', () => {
    expect(forPerson('ana', 'Intro\n- > [!private]\n  > Secret.\n  > More.\n\nAfter')).toBe('Intro\n\nAfter');
    expect(forPerson('ana', 'Intro\n- > [!private]\nLazy secret.\n\nAfter')).toBe('Intro\n\nAfter');
    expect(forPerson('ana', '* > [!private]\n  > Secret.\n+ > [!private]\n  > Secret.\n\nAfter')).toBe('\nAfter');
  });

  it('an indented callout under a numbered item', () => {
    expect(forPerson('ana', '1. item\n   > [!private]\n   > Secret.\n\nAfter')).toBe('1. item\n\nAfter');
    expect(forPerson('ana', '1) item\n   > [!private]\n   > Secret.\n\nAfter')).toBe('1) item\n\nAfter');
  });

  it('a tab-nested only callout under a nested list item', () => {
    const source = '- a\n\t- b\n\t\t> [!only|Ana]\n\t\t> For Ana.\n\nEnd';
    expect(forPerson('ana', source)).toBe(source);
    expect(forPerson('ben', source)).toBe('- a\n\t- b\n\nEnd');
    expect(forPerson('ben', '> - > [!private]\n>   x\n\nEnd')).toBe('\nEnd');
  });

  it('a bare list marker, or an indented heading or fence, does not end a callout', () => {
    expect(forPerson('ana', '> [!private]\n> s\n-\nmore\n\nend')).toBe('\nend');
    expect(forPerson('ana', '> [!private]\n> s\n1.\nmore\n\nend')).toBe('\nend');
    expect(forPerson('ana', '> [!private]\n> s\n    # x\nmore')).toBe('');
    expect(forPerson('ana', '> [!private]\n> s\n\t# x\nmore')).toBe('');
    expect(forPerson('ana', '> [!private]\n> s\n    ```\nmore')).toBe('');
    expect(forPerson('ana', '> [!private]\n> s\n   # x\nmore')).toBe('   # x\nmore');
  });
});

describe('private text that cannot be read fails closed', () => {
  it('hides the section an unreadable header starts, up to a blank line', () => {
    expect(forPerson('ana', 'Open.\n[!private-x] secret\nstill secret\n\nAfter')).toBe('Open.\n\nAfter');
    expect(forPerson('ana', '> [!only|Ana\n> text\n\nAfter')).toBe('\nAfter');
    expect(forPerson('ana', 'mid [!except Cara] line\nnext\n\nz')).toBe('\nz');
    expect(forPerson('ana', '[!private]\nbare at depth zero\n\nz')).toBe('\nz');
    expect(forPerson('ana', '> text [!PRIVATE] later\n> more\n\nz')).toBe('\nz');
    expect(forPerson('ana', '> [!private-notes]\n> s\n> t\n\nz')).toBe('\nz');
  });

  it('reads headers with spaces and other cases as headers', () => {
    expect(forPerson('ana', '>[!PRIVATE]\n>s\n\nz')).toBe('\nz');
    expect(forPerson('ana', '> [! private ]\n> s\n\nz')).toBe('\nz');
    expect(forPerson('ana', '> [!private]- Folded title\n> s\n\nz')).toBe('\nz');
  });

  it('tells the sender where, and leaves a note without such text quiet', () => {
    expect(unreadablePrivateTextIn('Open.\n[!private-x] secret\n> [!only|Ana]\n> fine\nmid [!except Cara] end')).toEqual(['[!private-x] secret', '[!except Cara] end']);
    expect(unreadablePrivateTextIn('> [!only|Ana]\n> fine\n\n> [!private]\n> s')).toEqual([]);
    expect(unreadablePrivateTextIn('%% [!private-x] in a comment %%')).toEqual([]);
  });

  it('finds the names in list-nested callouts too', () => {
    expect(unknownNamesIn('- > [!only|Zed]\n  > x\n\t> [!except|Yan]', people)).toEqual(['Yan', 'Zed']);
  });
});

describe('HTML comments and a byte order mark', () => {
  it('drops HTML comments, one line or several, but not in code fences', () => {
    expect(forPerson('ana', 'a <!-- gm note --> b\n<!--\nmore\n-->\nc')).toBe('a  b\nc');
    expect(forPerson('ana', 'a <!-- never closed\nsecret')).toBe('a');
    expect(forPerson('ana', '```\n<!-- in code -->\n```')).toBe('```\n<!-- in code -->\n```');
    expect(forPerson('ana', '<!-- %% -->\nx %% gone %%')).toBe('x');
  });

  it('reads frontmatter after a BOM, and ends it only at ---', () => {
    expect(forPerson('ana', '﻿---\natlas-share: [Ana]\nsecret: x\ntags: [a]\n---\nBody')).toBe('---\ntags: [a]\n---\nBody');
    expect(forPerson('ana', '---\ntags: [a]\n...\nsecret: x\n---\nBody')).toBe('---\ntags: [a]\n---\nBody');
  });
});

describe('a code fence ends with its container (I1)', () => {
  it('a fence in a quote ends when the quote does', () => {
    expect(forPerson('ana', '> ```\n> code\n\n%% gm secret %%\nafter')).toBe('> ```\n> code\n\nafter');
    expect(forPerson('ana', '> ```\n> code\nlazy\n%% gm secret %%\nafter')).not.toContain('gm secret');
    expect(forPerson('ana', '> > ~~~\n> > code\n> %% gm secret %%\nafter')).not.toContain('gm secret');
  });

  it('a fence in a list item ends when the item does', () => {
    expect(forPerson('ana', '- item\n  ```\n  code\nPara %% gm secret %%')).toBe('- item\n  ```\n  code\nPara');
    expect(forPerson('ana', '1. item\n   ```\n   code\n\n%% gm secret %%\nafter')).not.toContain('gm secret');
  });

  it('still keeps comments inside a fence that is still open', () => {
    expect(forPerson('ana', '> ```\n> %% in code %%\n> ```\nafter')).toBe('> ```\n> %% in code %%\n> ```\nafter');
    expect(forPerson('ana', '- item\n  ```\n  %% in code %%\n  ```')).toBe('- item\n  ```\n  %% in code %%\n  ```');
    expect(forPerson('ana', '```\ncode\n\n%% in code %%\nstill code')).toContain('%% in code %%');
  });
});
