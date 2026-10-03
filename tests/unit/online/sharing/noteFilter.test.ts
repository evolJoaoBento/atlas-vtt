import { describe, expect, it } from 'vitest';
import { filterNoteFor, partProblemsInNote, strayEndLineIn, unknownNamesIn } from '../../../../src/app/online/sharing/model/noteFilter';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const person = (personId: string, name: string, formerNames: string[] = []): Person => ({ tableId: T, personId, name, formerNames, devices: [], aliases: [], lastSeen: 0 });
const list = [person('ana', 'Ana'), person('ben', 'Ben', ['Benny']), person('cara', 'Cara')];
const matches = (p: Person, name: string): boolean => [p.name, ...p.formerNames].some((n) => n.toLowerCase() === name.toLowerCase());
const people = {
  byName: (name: string): Person | null => list.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? list.find((p) => matches(p, name)) ?? null,
  allByName: (name: string): Person[] => list.filter((p) => matches(p, name)),
};
const forPerson = (personId: string, source: string, shareable: string[] = ['tags']): string =>
  filterNoteFor(source, { recipient: { tableId: T, personId }, people, shareable, links: () => null, marks: null });
const everyone = ['ana', 'ben', 'cara'];

/** Every probe of the callout era (Task 3 and its fix rounds): its secret never reaches anyone now. */
const OLD_PROBES: Array<[string, string[]]> = [
  ['Open.\n\n> [!private]\n> Secret.\n> More secret.\n\nAfter.', ['Secret']],
  ['> [!ONLY|ana, Ben]\n> For two.\n\n> [!except|Cara]\n> Not Cara.\n\nAll.', ['For two', 'Not Cara']],
  ['> [!only|Ana, Ben]\n> Both.\n> > [!except|Ben]\n> > Ana only.\n>\n> Both again.', ['Both', 'Ana only']],
  ['> [!private]\n> Secret.\nStill secret, rendered inside.\n\nPublic.', ['ecret']],
  ['> > [!private]\n> > Secret.\n> lazy secret\n> [!only|Ana]\n>\n> shown', ['ecret', 'shown']],
  ['> [!only|Zed]\n> Z.\n\n> [!except|Yan]\n> Y.\n\nRest.', ['Z.', 'Y.']],
  ['Intro\n- > [!private]\n  > Secret.\n  > More.\n\nAfter', ['Secret', 'More']],
  ['Intro\n- > [!private]\nLazy secret.\n\nAfter', ['secret']],
  ['* > [!private]\n  > Secret.\n+ > [!private]\n  > Secret.\n\nAfter', ['Secret']],
  ['1. item\n   > [!private]\n   > Secret.\n\nAfter', ['Secret']],
  ['1) item\n   > [!private]\n   > Secret.\n\nAfter', ['Secret']],
  ['- a\n\t- b\n\t\t> [!only|Ana]\n\t\t> For Ana.\n\nEnd', ['For Ana']],
  ['> - > [!private]\n>   x\n\nEnd', ['x']],
  ['> [!private]\n> s\n-\nmore\n\nend', ['s\n', 'more']],
  ['> [!private]\n> s\n1.\nmore\n\nend', ['more']],
  ['> [!private]\n> s\n    # x\nmore', ['more', '# x']],
  ['> [!private]\n> s\n\t# x\nmore', ['more']],
  ['> [!private]\n> s\n    ```\nmore', ['more']],
  ['Open.\n[!private-x] secret\nstill secret\n\nAfter', ['secret']],
  ['> [!only|Ana\n> text\n\nAfter', ['text']],
  ['mid [!except Cara] line\nnext\n\nz', ['line', 'next']],
  ['[!private]\nbare at depth zero\n\nz', ['bare']],
  ['> text [!PRIVATE] later\n> more\n\nz', ['later', 'more']],
  ['> [!private-notes]\n> s\n> t\n\nz', ['> s', '> t']],
  ['>[!PRIVATE]\n>s\n\nz', ['>s']],
  ['> [! private ]\n> s\n\nz', ['> s']],
  ['> [!private]- Folded title\n> s\n\nz', ['Folded', '> s']],
  ['A %%hidden%% B\n%%\nhidden\n%%\nC', ['hidden']],
  ['x %% open to the end\nstill hidden', ['open', 'hidden']],
  ['C\n```\n%% in code %%\n```', ['in code']],
  ['x\n    ```\n%% secret %%\ny', ['secret']],
  ['- a\nlazy\n  ```\n  code\n%% S %%', ['S %%']],
  ['> a\nlazy\n> ```\n> code\n%% S %%', ['S %%']],
  ['- a\n\n x\n  ```\n  code\n %% in %%\n  ```\n  %% S %%', ['S %%', 'in %%']],
  [' ```\ncode\n ```\n %% S %%', ['S %%']],
  ['> ```\n> code\n\n%% S %%\nafter', ['S %%']],
  ['- item\n  ```\n  code\nPara %% S %%', ['S %%']],
  ['```\ncode\n\n%% S %%\nstill code', ['S %%']],
  ['a <!-- gm note --> b\n<!--\nmore\n-->\nc', ['gm note', 'more']],
  ['a <!-- never closed\nsecret', ['secret', 'never']],
  ['```\n<!-- in code -->\n```', ['in code']],
  ['<!-- %% -->\nx %% gone %%', ['gone']],
];

describe('the old callouts are kept back now (fail closed)', () => {
  it('no probe from the callout era reaches anyone, with restricted parts marked or not', () => {
    const marked = (personId: string, source: string): string => filterNoteFor(source, {
      recipient: { tableId: T, personId }, people, shareable: ['tags'], links: () => null, marks: { openTag: () => '%%[!only|@x]%%' },
    });
    for (const [source, secrets] of OLD_PROBES) {
      for (const personId of everyone) {
        for (const got of [forPerson(personId, source), marked(personId, source)]) {
          for (const secret of secrets) expect(got, `${personId}: ${source}`).not.toContain(secret);
          expect(got, source).not.toMatch(/\[!\s*(?:private|only|except)/i);
        }
      }
    }
  });

  it('tag probes: what a part hides from someone never reaches them, marked or not', () => {
    const probes: Array<[string, Record<string, boolean>]> = [
      ['a %%[!private]%%SECRET%%[!end]%% b', { ana: false, ben: false, cara: false }],
      ['%%[!only|Ana]%%\nSECRET\n%%[!end]%%', { ana: true, ben: false, cara: false }],
      ['%%[!except|Cara]%%SECRET%%[!end]%%', { ana: true, ben: true, cara: false }],
      ['%%[!only|Ana, Ben]%%%%[!except|Ben]%%SECRET%%[!end]%%%%[!end]%%', { ana: true, ben: false, cara: false }],
      ['%%[!only|Ana]%%SECRET', { ana: false, ben: false, cara: false }],
      ['%%[!only|Ana]%%%%[!end|x]%%SECRET%%[!end]%%', { ana: false, ben: false, cara: false }],
      ['> [!private] x %%[!only|Ana]%%\nSECRET\n\n%%[!end]%%', { ana: false, ben: false, cara: false }],
    ];
    const marked = (personId: string, source: string): string => filterNoteFor(source, {
      recipient: { tableId: T, personId }, people, shareable: [], links: () => null, marks: { openTag: () => '%%[!only|@x]%%' },
    });
    for (const [source, reaches] of probes) {
      for (const personId of everyone) {
        expect(forPerson(personId, source).includes('SECRET'), `${personId}: ${source}`).toBe(reaches[personId]);
        expect(marked(personId, source).includes('SECRET'), `${personId} marked: ${source}`).toBe(reaches[personId]);
      }
    }
  });

  it('an old callout, or any tag text outside a tag, hides everything from it to the end of the note (T-C1 backstop)', () => {
    expect(forPerson('ana', 'Open.\n\n> [!private]\n> Secret.\n> More secret.\n\nAfter.')).toBe('Open.\n');
    expect(forPerson('ana', '> [!only|Ana]\n> For Ana.\n\nAll.')).toBe('');
    expect(forPerson('ana', 'Before.\n> [!private]\n> Secret.\n# Heading\nPublic.')).toBe('Before.');
    expect(forPerson('ben', '- a\n\t- b\n\t\t> [!only|Ana]\n\t\t> For Ana.\n\nEnd')).toBe('- a\n\t- b');
    expect(forPerson('ana', 'a [!public] b\nc')).toBe('a');
    expect(forPerson('ana', 'a [!end] b')).toBe('a');
  });

  it('a tag around only a callout header cannot uncover the callout body', () => {
    const source = '> %%[!only|Ana]%%[!private]%%[!end]%%\n> old secret\n\nAfter';
    for (const personId of everyone) expect(forPerson(personId, source)).toBe('');
  });

  it('a malformed tag around an old callout header cannot uncover its body (M1)', () => {
    const source = 'Top\n%%[!secret]%%\n> [!private]\n%%[!end]%%\n> SECRET6 body\n\nAfter';
    for (const personId of everyone) expect(forPerson(personId, source)).toBe('Top');
  });

  it('tells the sender about old callouts and other tag text, and leaves a note without them quiet', () => {
    expect(partProblemsInNote('Open.\n> [!private]\n> s').strayText).toEqual({ text: '[!private]\n> s', oldCallout: true });
    expect(partProblemsInNote('mid [!except Cara] end').strayText).toEqual({ text: '[!except Cara] end', oldCallout: false });
    expect(partProblemsInNote('%%[!private]%%s%%[!end]%%\n%% a comment %%').strayText).toBeNull();
  });
});

describe('a %% in code cannot shift which tags pair (T-C1)', () => {
  const marked = (personId: string, source: string): string => filterNoteFor(source, {
    recipient: { tableId: T, personId }, people, shareable: [], links: () => null, marks: { openTag: () => '%%[!only|@x]%%' },
  });
  const probes: Array<[string, string, string[]]> = [
    ['inline code before the part and inside it',
      'Use `%%` for comments.\n\n%%[!private]%%\n\nThe prior line uses `%%` too.\n\nThe traitor is SECRET1.\n\n%%[!end]%%', everyone],
    ['inline code inside the part only',
      'Open.\n%%[!private]%%\nA `%%` here.\nSECRET2\n%%[!end]%%\nAfter.', everyone],
    ['inline code before the part only',
      'Write `%%` to comment.\n%%[!private]%%\nSECRET3\n%%[!end]%%\nAfter.', everyone],
    ['fences before and inside an only|Cara part',
      '```\nx %% y\n```\n%%[!only|Cara]%%\nFor Cara: SECRET4\n```\n%%\n```\n%%[!end]%%\nAfter.', ['ana', 'ben']],
    ['an escaped %%',
      'Escaped \\%% here.\n%%[!private]%%\nSECRET5\n%%[!end]%%\n\\%% again.\nAfter.', everyone],
    ['a %% between two parts',
      '%%[!only|Ana]%%A1%%[!end]%% `%%` %%[!private]%%SECRET7%%[!end]%% tail', everyone],
  ];

  it('every probe from the review is kept back from everyone it is not for, marked or not', () => {
    for (const [label, source, kept] of probes) {
      const secret = /SECRET\d/.exec(source)![0];
      for (const personId of kept) {
        expect(forPerson(personId, source), `${label} (${personId})`).not.toContain(secret);
        expect(marked(personId, source), `${label} (${personId}, marked)`).not.toContain(secret);
      }
    }
  });

  it('tags are found whatever the comments around them; a comment unclosed before the next tag hides the rest', () => {
    expect(forPerson('ana', 'a `%%` b\n%%[!only|Ana]%%x%%[!end]%%\nc')).toBe('a `');
    expect(forPerson('cara', 'pub\n%%[!only|Cara]%%\nC `%%` C\n%%[!end]%%\nend')).toBe('pub\nC `');
    expect(partProblemsInNote('a `%%` b\n%%[!private]%%x%%[!end]%%').unclosedComment).toBe(true);
  });
});

describe('a tag written inside code or a link is never a tag (T-R2)', () => {
  const marked = (personId: string, source: string): string => filterNoteFor(source, {
    recipient: { tableId: T, personId }, people, shareable: [], links: () => null, marks: { openTag: () => '%%[!only|@x]%%' },
  });
  const leaks: Array<[string, string]> = [
    ['inline code', '%%[!private]%%\nClose with `%%[!end]%%` LEAK then reopen `%%[!private]%%`.\n%%[!end]%%\nAfter'],
    ['double backticks', '%%[!private]%%\nClose with ``x %%[!end]%% y`` LEAK then ``%%[!private]%%``.\n%%[!end]%%'],
    ['a fence', '%%[!private]%%\n```\n%%[!end]%%\n```\nLEAK\n```\n%%[!private]%%\n```\n%%[!end]%%'],
    ['a ~~~ fence', '%%[!private]%%\n~~~md\n%%[!end]%%\n~~~\nLEAK\n~~~\n%%[!private]%%\n~~~\n%%[!end]%%'],
    ['an unclosed fence', '%%[!private]%%\nx\n```\n%%[!end]%% LEAK %%[!private]%%\n%%[!end]%%'],
    ['a fence in a quote', '%%[!private]%%\n> ```\n> %%[!end]%%\n> ```\n> LEAK\n> ```\n> %%[!private]%%\n> ```\n%%[!end]%%'],
    ['a fence in a list', '%%[!private]%%\n- item\n  ```\n  %%[!end]%%\n  ```\n  LEAK\n  ```\n  %%[!private]%%\n  ```\n%%[!end]%%'],
    ['a link label', '%%[!private]%%\n[x %%[!end]%%](u) LEAK [y %%[!private]%%](v)\n%%[!end]%%'],
    ['a wiki alias', '%%[!private]%%\n[[Note|a %%[!end]%%]] LEAK [[Other|b %%[!private]%%]]\n%%[!end]%%'],
    ['a link destination', '%%[!private]%%\n[x](u %%[!end]%%) LEAK [y](v %%[!private]%%)\n%%[!end]%%'],
    ['a code span across lines', '%%[!private]%%\nsee `the\n%%[!end]%% tag` LEAK `and\n%%[!private]%% too`\n%%[!end]%%'],
  ];

  it('the reviewer’s examples and variants leak nothing, marked or not, and warn', () => {
    for (const [label, source] of leaks) {
      for (const personId of everyone) {
        expect(forPerson(personId, source), label).not.toContain('LEAK');
        expect(marked(personId, source), `${label}, marked`).not.toContain('LEAK');
      }
      expect(partProblemsInNote(source).tagInCodeOrLink, label).toBe(true);
    }
  });

  it('a tag in code hides the rest of the note from where it stands', () => {
    expect(forPerson('ana', 'Top\nWrite `%%[!private]%%` to hide.\nMore')).toBe('Top\nWrite `');
  });

  it('real tags next to code on the same line, outside the backticks, still work', () => {
    const source = 'Run `npm test` %%[!only|Ana]%%secret `x`%%[!end]%% done `y`';
    expect(forPerson('ana', source)).toBe('Run `npm test` secret `x` done `y`');
    expect(forPerson('ben', source)).toBe('Run `npm test`  done `y`');
    expect(partProblemsInNote(source).tagInCodeOrLink).toBe(false);
    expect(forPerson('ben', '```\ncode\n```\n%%[!private]%%s%%[!end]%% [a](b) after')).toBe('```\ncode\n```\n a after');
    expect(forPerson('ben', 'See [x](https://e.org/a_(b)) %%[!private]%%s%%[!end]%% after')).toBe('See [x](https://e.org/a_(b))  after');
  });
});

describe('indented code, brackets, HTML, math, autolinks and reference definitions (T-R3)', () => {
  const P = '%%[!private]%%';
  const E = '%%[!end]%%';
  const marked = (personId: string, source: string): string => filterNoteFor(source, {
    recipient: { tableId: T, personId }, people, shareable: [], links: () => null, marks: { openTag: () => '%%[!only|@x]%%' },
  });
  const leaks: Array<[string, string]> = [
    ['indented code (spaces)', `${P}\nsecret\n\n    ${E}\n\nLEAK\n\n    ${P}\n\n${E}`],
    ['indented code (tab)', `${P}\nsecret\n\n\t${E}\n\nLEAK\n\n\t${P}\n\n${E}`],
    ['indented code in a list', `- item\n\n  ${P}\n  s\n\n        ${E}\n\n  LEAK\n\n        ${P}\n\n  ${E}`],
    ['indented code in a quote', `${P}\n> a\n>\n>     ${E}\n\nLEAK\n\n>     ${P}\n\n${E}`],
    ['a stray ] before a link label', `${P}\na ] [x ${E}](u) LEAK [y ${P}](v)\n${E}`],
    ['a pre block', `${P}\n<pre>\n${E}\n</pre>\nLEAK\n<pre>\n${P}\n</pre>\n${E}`],
    ['inline code HTML', `${P}\n<code>${E}</code> LEAK <code>${P}</code>\n${E}`],
    ['$$ math', `${P}\n$$\n${E}\n$$\nLEAK\n$$\n${P}\n$$\n${E}`],
    ['$ math', `${P}\n$${E}$ LEAK $${P}$\n${E}`],
    ['autolinks', `${P}\n<https://a.b/${E}> LEAK <https://c.d/${P}>\n${E}`],
    ['reference definition with <>', `${P}\n[r]: <u ${E}>\nLEAK\n[s]: <v ${P}>\n${E}`],
    ['reference definition', `${P}\n[r]: u ${E}\nLEAK\n[s]: v ${P}\n${E}`],
  ];

  it('each repro leaks nothing, marked or not, and warns', () => {
    for (const [label, source] of leaks) {
      for (const personId of everyone) {
        expect(forPerson(personId, source), label).not.toContain('LEAK');
        expect(marked(personId, source), `${label}, marked`).not.toContain('LEAK');
      }
      expect(partProblemsInNote(source).tagInCodeOrLink, label).toBe(true);
    }
  });

  it('real block tags in lists, at the list content column, still work', () => {
    expect(forPerson('ben', `- item\n  ${P}\n  secret\n  ${E}\n- next`)).toBe('- item\n- next');
    expect(forPerson('ben', `- a\n  - b\n    ${P}\n    secret\n    ${E}\n- c`)).toBe('- a\n  - b\n- c');
    expect(forPerson('ben', `- a\n  - b\n\n    ${P}\n    secret\n    ${E}\n\n- c`)).toBe('- a\n  - b\n\n\n- c');
    expect(forPerson('ben', `1. one\n2. two\n   ${P}\n   secret\n   ${E}`)).toBe('1. one\n2. two');
  });

  it('a common session note keeps its real tags working', () => {
    const note = [
      '# Session 12', '', 'The party reached [[Thornwick]] at dusk. See the [map](https://example.org/map) and `/roll d20`.', '',
      '## Scenes', '- Arrival at the inn', `  %%[!only|Ana]%%`, '  Ana recognises the innkeeper.', `  ${E}`, '- The bargain',
      `  - Price: 50 gp ${P}(real: 30)${E}`, '', '> [!note] Weather', '> Rain all night.', '', '```dice', '1d20 + 3', '```', '',
      `${P}`, 'The innkeeper is the cult leader.', '', 'Clues: the ring, the ledger.', E, '', 'Next time: the crypt.',
    ].join('\n');
    expect(partProblemsInNote(note).tagInCodeOrLink).toBe(false);
    const forBen = forPerson('ben', note);
    for (const secret of ['recognises', 'real: 30', 'cult leader', 'ledger']) expect(forBen).not.toContain(secret);
    expect(forBen).toContain('Next time: the crypt.');
    expect(forPerson('ana', note)).toContain('Ana recognises the innkeeper.');
  });
});

describe('private part tags', () => {
  it('inline: a private part never goes, the rest of the line stays', () => {
    expect(forPerson('ana', 'The door %%[!private]%%is trapped %%[!end]%%opens.')).toBe('The door opens.');
  });

  it('block: tags on their own lines, a blank line inside included', () => {
    const source = 'Open.\n%%[!private]%%\nSecret one.\n\nSecret two.\n%%[!end]%%\nAfter.';
    expect(forPerson('ana', source)).toBe('Open.\nAfter.');
  });

  it('only and except reach the right people, case-insensitively, and drop their tags', () => {
    const source = '%%[!ONLY|ana, Ben]%%\nFor two.\n%%[!End]%%\n%%[!except|Cara]%%Not Cara.%%[!end]%%\nAll.';
    expect(forPerson('ana', source)).toBe('For two.\nNot Cara.\nAll.');
    expect(forPerson('ben', source)).toBe('For two.\nNot Cara.\nAll.');
    expect(forPerson('cara', source)).toBe('All.');
  });

  it('whitespace inside the comment is fine', () => {
    expect(forPerson('ben', 'a %% [!only | Ana ] %%x%%  [!end]  %% b')).toBe('a  b');
    expect(forPerson('ana', 'a %% [!only | Ana ] %%x%%  [!end]  %% b')).toBe('a x b');
    expect(forPerson('ana', 'a %%[! private ]%%x%%[!END]%% b')).toBe('a  b');
  });

  it('nested parts must pass every rule; an end closes the innermost part', () => {
    const source = '%%[!only|Ana, Ben]%%Both. %%[!except|Ben]%%Ana only. %%[!end]%%Both again.%%[!end]%% All.';
    expect(forPerson('ana', source)).toBe('Both. Ana only. Both again. All.');
    expect(forPerson('ben', source)).toBe('Both. Both again. All.');
    expect(forPerson('cara', source)).toBe(' All.');
  });

  it('an unclosed tag hides everything after it from everyone, its own people included', () => {
    expect(forPerson('ana', 'Open. %%[!only|Ana]%% for Ana\nand more\n\nstill')).toBe('Open.');
    expect(forPerson('ana', 'Open.\n%%[!private]%%\nrest')).toBe('Open.');
    expect(partProblemsInNote('a %%[!only|Ana]%% b').unclosed).toBe(1);
  });

  it('a stray end is removed from the text, and its line is reported (the note is then not shared: T-stray)', () => {
    expect(forPerson('ana', 'a %%[!end]%% b\n%%[!private]%%s%%[!end]%%')).toBe('a  b');
    expect(partProblemsInNote('a %%[!end]%% b').strayEndLines).toEqual([1]);
    expect(strayEndLineIn('---\ntags: [a]\n---\nOne\n%%[!private]%%x%%[!end]%%\nTwo %%[!end]%%')).toBe(6);
    expect(strayEndLineIn('%%[!private]%%x%%[!end]%%')).toBeNull();
  });

  it('a malformed tag hides up to its matching end; a tag-like comment hides the rest of the note', () => {
    const cases: Array<[string, string]> = [
      ['a %%[!only]%%s%%[!end]%% b', 'a  b'],
      ['a %%[!except|]%%s%%[!end]%% b', 'a  b'],
      ['a %%[!secret]%%s%%[!end]%% b', 'a  b'],
      ['a %%[!private|Ana]%%s%%[!end]%% b', 'a  b'],
      ['a %%[!private-x]%%s%%[!end]%% b', 'a  b'],
      ['a %% GM: [!private] %%s%%[!end]%% b', 'a'],
      ['a %%[ !private]%%s%%[!end]%% b', 'a  b'],
      ['a <!--[!private]-->s%%[!end]%% b', 'a'],
      ['a %%[!secret]%% s\nmore', 'a'],
    ];
    for (const [source, expected] of cases) {
      for (const personId of everyone) expect(forPerson(personId, source), source).toBe(expected);
    }
    expect(partProblemsInNote('a %%[!secret]%% b %%[!only]%%').malformed).toEqual(['[!secret]', '[!only]']);
  });

  it('a malformed end never closes a part', () => {
    expect(forPerson('ana', 'a %%[!private]%%s %%[!end|x]%% t %%[!end]%% u %%[!end]%% v')).toBe('a  v');
    expect(forPerson('ana', 'a %%[!private]%%s %%[!end]x%% t')).toBe('a');
  });

  it('a commented-out mention of a tag hides what follows (fail closed)', () => {
    expect(forPerson('ana', 'a %% [!private-x] in a comment %% b')).toBe('a');
  });

  it('works inside lists and quotes; in a code fence a tag is text and keeps the rest back (T-R2)', () => {
    expect(forPerson('ana', '- one\n- two %%[!private]%%secret%%[!end]%%\n- three')).toBe('- one\n- two\n- three');
    expect(forPerson('ana', '> quote\n> %%[!private]%%\n> secret\n> %%[!end]%%\n> after')).toBe('> quote\n> after');
    expect(forPerson('ana', '```\ncode\n%%[!private]%%\nsecret()\n%%[!end]%%\nmore()\n```')).toBe('```\ncode');
    expect(forPerson('ben', '- item\n  %%[!only|Ana]%%\n  for Ana\n  %%[!end]%%\n- next')).toBe('- item\n- next');
  });

  it('unknown names: only reaches nobody, except hides from everyone, and the sender is told', () => {
    const source = '%%[!only|Zed]%%Z.%%[!end]%%\n%%[!except|Yan]%%Y.%%[!end]%%\nRest.';
    for (const personId of everyone) expect(forPerson(personId, source)).toBe('Rest.');
    expect(unknownNamesIn(source, people)).toEqual(['Yan', 'Zed']);
    expect(unknownNamesIn('---\natlas-share: [Ana, except Quin]\n---\nx', people)).toEqual(['Quin']);
  });

  it('names resolve through former names too', () => {
    expect(forPerson('ben', '%%[!only|Benny]%%for Ben%%[!end]%%')).toBe('for Ben');
    expect(forPerson('ben', 'a %%[!except|Benny]%%not Ben%%[!end]%%')).toBe('a');
    expect(forPerson('ana', 'a %%[!except|Benny]%%not Ben%%[!end]%%')).toBe('a not Ben');
    expect(unknownNamesIn('%%[!only|Benny]%%x%%[!end]%%', people)).toEqual([]);
  });

  it('a name holding a character a tag cannot carry fails closed', () => {
    // `,` splits, `|` and `%` stay in the name or break the comment, `]` ends the tag early.
    expect(forPerson('ana', 'a %%[!only|An,a]%%s%%[!end]%% b')).toBe('a  b');
    expect(forPerson('ana', 'a %%[!only|An|a]%%s%%[!end]%% b')).toBe('a  b');
    expect(forPerson('ana', 'a %%[!only|An]a]%%s%%[!end]%% b')).toBe('a');
    expect(forPerson('ana', 'a %%[!only|An%%a]%%s%%[!end]%% b')).not.toContain('s');
  });

  it('tags are never sent, and a comment between tags goes too', () => {
    const got = forPerson('ana', '%%[!only|Ana]%%x %%gm%% y%%[!end]%%');
    expect(got).toBe('x  y');
  });
});

describe('properties', () => {
  it('keeps only shareable properties and never atlas-share', () => {
    const source = '---\natlas-share: [Ana]\ntags:\n  - npc\nsecret: gold\naliases: [Bob]\n# comment\n---\nBody';
    expect(forPerson('ana', source, ['tags', 'atlas-share'])).toBe('---\ntags:\n  - npc\n---\nBody');
    expect(forPerson('ana', source, [])).toBe('Body');
    expect(forPerson('ana', '---\nunclosed\nBody')).toBe('---\nunclosed\nBody');
  });

  it('tag text in a kept property hides that property (tags are not read there)', () => {
    expect(forPerson('ana', '---\ntags: [a] %%[!private]%%\nmood: x\n---\nBody', ['tags', 'mood'])).toBe('---\nmood: x\n---\nBody');
    expect(forPerson('ana', '---\ntags:\n  - "%%[!end]%%"\n---\nBody')).toBe('Body');
    expect(forPerson('ana', '---\ntags: "[!only|Ana]"\n---\nBody')).toBe('Body');
  });

  it('removes comments from a kept property, and drops one whose comment never closes', () => {
    expect(forPerson('ana', '---\ntags: [a] %% secret %%\n---\nBody')).toBe('---\ntags: [a]\n---\nBody');
    expect(forPerson('ana', '---\ntags:\n  - a\n  - "%% secret %%"\n  - <!-- gm --> b\n---\nBody')).toBe('---\ntags:\n  - a\n  - ""\n  -  b\n---\nBody');
    expect(forPerson('ana', '---\ntags: [a] %% secret\nsecret: x\n---\nBody')).toBe('Body');
    expect(forPerson('ana', '---\ntags:\n  - a\n  - <!-- open\n---\nBody')).toBe('Body');
  });

  it('reads frontmatter after a BOM, and ends it only at ---', () => {
    expect(forPerson('ana', '﻿---\natlas-share: [Ana]\nsecret: x\ntags: [a]\n---\nBody')).toBe('---\ntags: [a]\n---\nBody');
    expect(forPerson('ana', '---\ntags: [a]\n...\nsecret: x\n---\nBody')).toBe('---\ntags: [a]\n---\nBody');
  });
});
