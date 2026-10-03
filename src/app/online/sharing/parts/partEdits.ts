/**
 * The text edits behind Share part on a selection, worked out on the note's text by offset so they can be
 * tested without an editor. Wrapping puts tags inline when the selection lies within one line or cuts lines,
 * and on their own lines (with the first line's quote markers) when it covers whole lines. Sharing with
 * everyone frees exactly the selection: tags inside it go, and every part still open at its edges is closed
 * before it and opened again after it, so nothing outside the selection is shared by accident.
 */
import { END_TAG, openTag, pairTags, scanTags, type OpenPart, type PartRule, type PartTag } from '../model/privateTags';

export interface TextEdit {
  from: number;
  to: number;
  text: string;
}

/** One change of the note, and the selection afterwards, both by offset (the selection in the new text). */
export interface PartEdit {
  change: TextEdit;
  selection: { from: number; to: number };
}

const lineStartOf = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;
const lineEndOf = (text: string, at: number): number => {
  const end = text.indexOf('\n', at);
  return end < 0 ? text.length : end;
};
const quotePrefix = (text: string, at: number): string => /^(?:[ \t]*>)*[ \t]*/.exec(text.slice(lineStartOf(text, at)))?.[0] ?? '';

/** Whether `[from, to)` covers whole lines; `last` is the end of its last line. */
function wholeLines(text: string, from: number, to: number): { last: number } | null {
  if (from >= to || from !== lineStartOf(text, from)) return null;
  if (to === lineEndOf(text, to)) return { last: to };
  return to === lineStartOf(text, to) ? { last: to - 1 } : null;
}

/** Applies sorted, non-overlapping edits as one change spanning them, and maps the selection's ends. */
function asOneChange(text: string, edits: readonly TextEdit[], from: number, to: number): PartEdit {
  const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  const first = sorted[0]?.from ?? from;
  const last = Math.max(...sorted.map((edit) => edit.to), first);
  let replaced = '';
  let at = first;
  for (const edit of sorted) {
    replaced += text.slice(at, edit.from) + edit.text;
    at = edit.to;
  }
  replaced += text.slice(at, last);
  // An end at an insertion point stays outside it: the start after, the end before what was inserted there.
  const map = (offset: number, after: boolean): number => {
    let shift = 0;
    for (const edit of sorted) {
      if (edit.to < offset || (edit.to === offset && (edit.from < offset || after))) shift += edit.text.length - (edit.to - edit.from);
      else if (edit.from < offset) return edit.from + shift + (after ? edit.text.length : 0);
    }
    return offset + shift;
  };
  return { change: { from: first, to: last, text: replaced }, selection: { from: map(from, true), to: map(to, false) } };
}

/** Wraps `[from, to)` in a part with `rule`. */
export function wrapSelection(text: string, from: number, to: number, rule: PartRule): PartEdit {
  const open = openTag(rule);
  const lines = wholeLines(text, from, to);
  if (!lines) return asOneChange(text, [{ from, to: from, text: open }, { from: to, to, text: END_TAG }], from, to);
  const edits = [
    { from, to: from, text: `${quotePrefix(text, from)}${open}\n` },
    { from: lines.last, to: lines.last, text: `\n${quotePrefix(text, lines.last)}${END_TAG}` },
  ];
  return asOneChange(text, edits, from, lines.last);
}

const isOpener = (tag: PartTag): boolean => tag.kind !== 'end';
const blankGap = (gap: string): boolean => /^[\s>]*$/.test(gap);

/** Widens the selection over the tags right at its edges: openers before it, ends after it. */
function absorbEdges(text: string, tags: readonly PartTag[], from: number, to: number): { start: number; end: number } {
  let start = from;
  let end = to;
  for (let index = tags.length - 1; index >= 0; index--) {
    const tag = tags[index];
    if (!tag || tag.end > start) continue;
    if (!isOpener(tag) || !blankGap(text.slice(tag.end, start))) break;
    start = tag.start;
  }
  for (const tag of tags) {
    if (tag.start < end) continue;
    if (isOpener(tag) || !blankGap(text.slice(end, tag.start))) break;
    end = tag.end;
  }
  return { start, end };
}

interface Removal extends TextEdit {
  /** It takes the tag's whole line, so tags put in its place go on lines of their own. */
  line: boolean;
}

/** The removal of tags: their whole line when nothing but quote markers is left on it. */
function removals(text: string, tags: readonly PartTag[]): Removal[] {
  const byLine = new Map<number, PartTag[]>();
  for (const tag of tags) byLine.set(lineStartOf(text, tag.start), [...(byLine.get(lineStartOf(text, tag.start)) ?? []), tag]);
  return [...byLine.entries()].flatMap(([start, onLine]): Removal[] => {
    const end = lineEndOf(text, start);
    let rest = text.slice(start, end);
    for (const tag of [...onLine].reverse()) rest = rest.slice(0, tag.start - start) + rest.slice(tag.end - start);
    if (!blankGap(rest) || onLine.some((tag) => tag.end > end)) return onLine.map((tag) => ({ from: tag.start, to: tag.end, text: '', line: false }));
    if (end < text.length) return [{ from: start, to: end + 1, text: '', line: true }];
    return [{ from: Math.max(start - 1, 0), to: end, text: '', line: true }];
  });
}

/** The parts open at `at`: begun before it and not yet ended. */
const openAt = (parts: readonly OpenPart[], at: number): OpenPart[] =>
  parts.filter((part) => part.tag.end <= at && (part.close === null || part.close.start >= at));

/** Shares `[from, to)` with everyone the note is shared with (see the module comment); null when nothing changes. */
export function shareWithEveryone(text: string, from: number, to: number): PartEdit | null {
  const tags = scanTags(text);
  const { parts } = pairTags(tags);
  const { start, end } = absorbEdges(text, tags, from, to);
  const inside = tags.filter((tag) => tag.start >= start && tag.end <= end);
  const closing = openAt(parts, start).map(() => END_TAG);
  const reopening = openAt(parts, end).map((part) => text.slice(part.tag.start, part.tag.end));
  if (inside.length === 0 && closing.length === 0 && reopening.length === 0) return null;
  const edits = removals(text, inside);
  const block = wholeLines(text, from, to) !== null;
  const asLines = (at: number, added: readonly string[]): string => added.map((tag) => `${quotePrefix(text, at)}${tag}`).join('\n');
  const insert = (at: number, added: readonly string[], atStart: boolean): void => {
    if (added.length === 0) return;
    // In place of a removed tag line: on lines of their own there.
    const removal = edits.find((edit) => edit.line && edit.from <= at && at <= edit.to && (atStart ? at < edit.to : at > edit.from));
    if (removal) {
      const atLineStart = removal.to < text.length || removal.from === 0;
      removal.text += atLineStart ? `${asLines(removal.from, added)}\n` : `\n${asLines(removal.to, added)}`;
      return;
    }
    let inserted = added.join('');
    if (block && at === lineStartOf(text, at)) inserted = `${asLines(at, added)}\n`;
    else if (block && at === lineEndOf(text, at)) inserted = `\n${asLines(at, added)}`;
    edits.push({ from: at, to: at, text: inserted, line: false });
  };
  insert(start, closing, true);
  insert(end, reopening, false);
  return asOneChange(text, edits, from, to);
}
