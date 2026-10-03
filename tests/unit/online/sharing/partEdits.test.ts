import { describe, expect, it } from 'vitest';
import { filterNoteFor } from '../../../../src/app/online/sharing/model/noteFilter';
import { shareWithEveryone, wrapSelection, type PartEdit } from '../../../../src/app/online/sharing/parts/partEdits';
import { TABLE_ID, testPeople, testPerson } from './sharingFixtures';

/** The text after the edit, and the text the selection covers then. */
function applied(text: string, edit: PartEdit | null): { text: string; selected: string } {
  if (!edit) return { text, selected: '' };
  const { change, selection } = edit;
  const next = text.slice(0, change.from) + change.text + text.slice(change.to);
  return { text: next, selected: next.slice(selection.from, selection.to) };
}

/** `[` and `]` in `marked` are the selection. */
function select(marked: string): { text: string; from: number; to: number } {
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), from, to };
}

const wrap = (marked: string, rule: Parameters<typeof wrapSelection>[3] = { kind: 'private' }) => {
  const { text, from, to } = select(marked);
  return applied(text, wrapSelection(text, from, to, rule));
};
const unwrap = (text: string, selectedText: string, occurrence = 0) => {
  let from = -1;
  for (let index = 0; index <= occurrence; index++) from = text.indexOf(selectedText, from + 1);
  return applied(text, shareWithEveryone(text, from, from + selectedText.length));
};

const people = testPeople([testPerson('ana', 'Ana'), testPerson('ben', 'Ben')]);
const forBen = (text: string): string => filterNoteFor(text, { recipient: { tableId: TABLE_ID, personId: 'ben' }, people, shareable: [], links: () => null, marks: null });

describe('wrapping a selection', () => {
  it('within one line: inline tags, the selection stays on the text', () => {
    expect(wrap('The door [is trapped] here.')).toEqual({ text: 'The door %%[!private]%%is trapped%%[!end]%% here.', selected: 'is trapped' });
  });

  it('whole lines: tags on their own lines, with the quote markers of the lines', () => {
    expect(wrap('a\n[b\nc]\nd')).toEqual({ text: 'a\n%%[!private]%%\nb\nc\n%%[!end]%%\nd', selected: 'b\nc' });
    expect(wrap('a\n[b\n]d')).toEqual({ text: 'a\n%%[!private]%%\nb\n%%[!end]%%\nd', selected: 'b' });
    expect(wrap('> a\n[> b]\n> c')).toEqual({ text: '> a\n> %%[!private]%%\n> b\n> %%[!end]%%\n> c', selected: '> b' });
  });

  it('cutting lines: inline tags at the ends', () => {
    expect(wrap('one t[wo\nthr]ee')).toEqual({ text: 'one t%%[!private]%%wo\nthr%%[!end]%%ee', selected: 'wo\nthr' });
  });

  it('only and except write the names as given', () => {
    expect(wrap('x [y] z', { kind: 'only', names: ['Ana', 'Ben'] }).text).toBe('x %%[!only|Ana, Ben]%%y%%[!end]%% z');
    expect(wrap('x [y] z', { kind: 'except', names: ['Cara'] }).text).toBe('x %%[!except|Cara]%%y%%[!end]%% z');
  });

  it('what it wraps is kept back', () => {
    expect(forBen(wrap('a [secret] b', { kind: 'only', names: ['Ana'] }).text)).toBe('a  b');
    expect(forBen(wrap('a\n[secret\n]b').text)).toBe('a\nb');
  });
});

describe('sharing a selection with everyone', () => {
  it('selecting exactly the wrapped text removes its tags', () => {
    expect(unwrap('a %%[!private]%%secret%%[!end]%% b', 'secret')).toEqual({ text: 'a secret b', selected: 'secret' });
    expect(unwrap('a\n%%[!private]%%\nb\nc\n%%[!end]%%\nd', 'b\nc')).toEqual({ text: 'a\nb\nc\nd', selected: 'b\nc' });
    expect(unwrap('> a\n> %%[!private]%%\n> b\n> %%[!end]%%\n> c', '> b')).toEqual({ text: '> a\n> b\n> c', selected: '> b' });
  });

  it('a selection inside a larger part frees only itself', () => {
    const text = 'x %%[!private]%%one two three%%[!end]%% y';
    const done = unwrap(text, 'two');
    expect(done.text).toBe('x %%[!private]%%one %%[!end]%%two%%[!private]%% three%%[!end]%% y');
    expect(done.selected).toBe('two');
    expect(forBen(done.text)).toBe('x two y');
  });

  it('whole lines inside a larger block part: the closing and opening tags go on lines of their own', () => {
    const text = '%%[!private]%%\none\ntwo\nthree\n%%[!end]%%';
    const done = unwrap(text, 'two\n');
    expect(done.text).toBe('%%[!private]%%\none\n%%[!end]%%\ntwo\n%%[!private]%%\nthree\n%%[!end]%%');
    expect(forBen(done.text)).toBe('two');
  });

  it('a part that begins inside the selection and ends after it stays closed after it', () => {
    const done = unwrap('a b %%[!private]%%c d%%[!end]%% e', 'b %%[!private]%%c');
    expect(done.text).toBe('a b c%%[!private]%% d%%[!end]%% e');
    expect(forBen(done.text)).toBe('a b c e');
  });

  it('nested parts are closed and opened again in order', () => {
    const text = '%%[!only|Ana]%%a %%[!private]%%b c%%[!end]%%%%[!end]%%';
    const done = unwrap(text, 'b');
    // The private tag right before the selection is taken in, so only the outer part closes before it.
    expect(done.text).toBe('%%[!only|Ana]%%a %%[!end]%%b%%[!only|Ana]%%%%[!private]%% c%%[!end]%%%%[!end]%%');
    expect(forBen(done.text)).toBe('b');
  });

  it('a malformed or unclosed part stays closed after the selection', () => {
    expect(forBen(unwrap('a %%[!secret]%%b c', 'b').text)).toBe('a b');
    expect(forBen(unwrap('a %%[!private]%%b c', 'b').text)).toBe('a b');
  });

  it('nothing to change: null', () => {
    expect(shareWithEveryone('plain text', 0, 5)).toBeNull();
  });
});
