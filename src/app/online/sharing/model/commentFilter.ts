/**
 * Comments, which are never shared: `%% … %%` and HTML `<!-- … -->`, inline or across lines.
 * Code fences are not tracked on purpose: every comment is removed everywhere, inside code too,
 * and an unclosed one hides the rest of the note. Following fences through quotes and lists
 * kept finding new ways to keep a comment that Obsidian hides, so this fails closed instead.
 * The same scan finds the private part tags (`privateTags.ts`), so both always agree on what a comment is.
 */
import { lenientQuote } from './quoteLines';

export type CommentOpener = '%%' | '<!--';

/** A comment in a text: `[start, end)` covers its markers; an unclosed one runs to the end of the text. */
export interface CommentSpan {
  start: number;
  end: number;
  opener: CommentOpener;
  /** The text between its markers. */
  content: string;
  closed: boolean;
}

/** A range of a text, `[start, end)`; with `text`, the range is replaced by it instead of removed. */
export interface TextRange {
  start: number;
  end: number;
  text?: string;
}

const OPENERS: readonly CommentOpener[] = ['%%', '<!--'];
const CLOSERS: Record<CommentOpener, string> = { '%%': '%%', '<!--': '-->' };

/** Every comment in `text`, in order. */
export function scanComments(text: string): CommentSpan[] {
  const spans: CommentSpan[] = [];
  let at = 0;
  for (;;) {
    const found = OPENERS.map((opener) => ({ opener, index: text.indexOf(opener, at) }))
      .filter((hit) => hit.index >= 0).sort((a, b) => a.index - b.index)[0];
    if (!found) return spans;
    const from = found.index + found.opener.length;
    const close = text.indexOf(CLOSERS[found.opener], from);
    if (close < 0) {
      spans.push({ start: found.index, end: text.length, opener: found.opener, content: text.slice(from), closed: false });
      return spans;
    }
    const end = close + CLOSERS[found.opener].length;
    spans.push({ start: found.index, end, opener: found.opener, content: text.slice(from, close), closed: true });
    at = end;
  }
}

/**
 * Sorted ranges; plain ones that touch are merged. A replacement that overlaps a plain range is dropped,
 * so a replacement can never uncover what a plain range hides.
 */
function merged(ranges: readonly TextRange[]): TextRange[] {
  const plain = ranges.filter((range) => range.text === undefined);
  const overlaps = (range: TextRange): boolean => plain.some((other) => range.start < other.end && other.start < range.end);
  const sorted = ranges.filter((range) => range.end > range.start && (range.text === undefined || !overlaps(range)))
    .sort((a, b) => a.start - b.start);
  const out: TextRange[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && last.text === undefined && range.text === undefined && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
}

/**
 * The lines of `text` without the `hidden` ranges, one entry per line of `text`. A line no range
 * touches stays as it is; a touched line keeps what is left of it, or is null (dropped) when only
 * quote and list markers are left, so no blank line appears where there was none. A replacement's
 * text goes on the line where it starts.
 */
export function keptLines(text: string, hidden: readonly TextRange[]): Array<string | null> {
  const ranges = merged(hidden);
  const out: Array<string | null> = [];
  let lineStart = 0;
  let next = 0;
  for (const line of text.split('\n')) {
    const lineEnd = lineStart + line.length;
    while (next < ranges.length && (ranges[next]?.end ?? 0) <= lineStart) next++;
    let kept = '';
    let at = lineStart;
    let touched = false;
    for (let index = next; index < ranges.length && (ranges[index]?.start ?? Infinity) <= lineEnd; index++) {
      const range = ranges[index];
      if (!range) break;
      touched = true;
      const start = Math.max(range.start, lineStart);
      if (start > at) kept += text.slice(at, start);
      if (range.text !== undefined && range.start >= lineStart) kept += range.text;
      at = Math.max(at, Math.min(range.end, lineEnd));
    }
    if (at < lineEnd) kept += text.slice(at, lineEnd);
    if (!touched) out.push(line);
    else out.push(lenientQuote(kept).content.trim() !== '' ? kept.trimEnd() : null);
    lineStart = lineEnd + 1;
  }
  return out;
}

/** `lines` without their comments, and whether a comment was still open at the end (everything after it was hidden). */
export function stripCommentsChecked(lines: readonly string[]): { lines: string[]; open: boolean } {
  const text = lines.join('\n');
  const comments = scanComments(text);
  const kept = keptLines(text, comments).filter((line): line is string => line !== null);
  return { lines: kept, open: comments[comments.length - 1]?.closed === false };
}
