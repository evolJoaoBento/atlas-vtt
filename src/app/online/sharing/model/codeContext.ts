/**
 * Whether a tag token may be shown by Obsidian as text rather than read as a comment, so it must not count
 * as a tag. Block context comes from Obsidian's sections (`noteSections.ts`): outside a text block it is text.
 * Inside one:
 * - a list, quote or callout (sections are top-level only, so code nested in them is not a section of its
 *   own): a fence-looking or HTML-looking line earlier in the block, or 4 or more columns of whitespace in the
 *   token line's prefix (indentation, or after a quote or list marker: possibly indented code);
 * - inline, from the start of the token's paragraph (the block, cut at its last blank line): an open code span,
 *   an odd number of backticks on its line, unclosed inline `<code>`/`<pre>`, `$$` or `$` math, an autolink
 *   `<…>` open on its line, a reference definition line, an open link label or wiki link (bracket depth), or a
 *   link destination (`](` not closed by `)`).
 * Backslash escapes are honoured: an escaped character never counts. Detection is deliberately loose: a false
 * "maybe" only hides more (the filter's backstop), while a tag counted where Obsidian shows text could pair
 * with a real one and share a part.
 */
import type { TextRange } from './commentFilter';
import type { TextBlock } from './noteSections';
import { lenientQuote } from './quoteLines';

/** Block context for a scan: Obsidian's text blocks, null when unknown (every token is then text), or `inline-only`. */
export type BlockContext = readonly TextBlock[] | null | 'inline-only';

const REFERENCE_DEFINITION = /^\[[^\]]*\]:/;
const FENCE_OR_HTML = /^(?:`{3,}|~{3,}|<[A-Za-z!?/])/;

/** `text` with every backslash escape (`\` before ASCII punctuation) masked, so the escaped character never counts. */
function withoutEscapes(text: string): string {
  return text.replace(/\\[!-/:-@[-`{-~]/g, 'xx');
}

const MARKER = /^(?:>|[-*+](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$))/;
const columnsOf = (space: string): number => [...space].reduce((columns, char) => (char === '\t' ? columns + 4 - (columns % 4) : columns + 1), 0);

/** Whether the line's prefix of quote and list markers holds a whitespace run of 4 or more columns (a tab is 4). */
function deepPrefix(line: string): boolean {
  let rest = line;
  for (;;) {
    const space = /^[ \t]*/.exec(rest)?.[0] ?? '';
    if (columnsOf(space) >= 4) return true;
    rest = rest.slice(space.length);
    const marker = MARKER.exec(rest);
    if (!marker) return false;
    rest = rest.slice(marker[0].length);
  }
}

/** Whether the backtick runs of `text` leave a code span open at its end. */
function codeSpanOpen(text: string): boolean {
  let open = 0;
  for (const run of text.match(/`+/g) ?? []) {
    if (open === 0) open = run.length;
    else if (run.length === open) open = 0;
  }
  return open !== 0;
}

/** Whether something `opens` marks is left open at the end of `text`: depth counting, a closer at depth 0 changes nothing. */
function depthOpen(text: string, opens: (index: number) => boolean, closer: string): boolean {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (opens(index)) depth++;
    else if (text[index] === closer && depth > 0) depth--;
  }
  return depth > 0;
}

/** Whether a `](` on the line is still open (no `)` closing it yet): the place is inside a link destination. */
function linkDestinationOpen(onLine: string): boolean {
  let depth = 0;
  for (let index = 0; index < onLine.length; index++) {
    if (depth === 0 && onLine[index] === ']' && onLine[index + 1] === '(') {
      depth = 1;
      index++;
    } else if (depth > 0 && onLine[index] === '(') depth++;
    else if (depth > 0 && onLine[index] === ')') depth--;
  }
  return depth > 0;
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

/** Inline code, math, links or HTML before the token, in its paragraph or on its line, that may be open there. */
function inlineOpen(paragraph: string, onLine: string, line: string): boolean {
  if (codeSpanOpen(paragraph) || count(onLine, /`/g) % 2 === 1) return true;
  if (count(paragraph, /<(?:pre|code)\b/gi) > count(paragraph, /<\/(?:pre|code)\s*>/gi)) return true;
  if (count(paragraph, /\$\$/g) % 2 === 1 || count(paragraph.replace(/\$\$/g, ''), /\$/g) % 2 === 1) return true;
  if (depthOpen(onLine, (index) => onLine[index] === '<' && /\S/.test(onLine[index + 1] ?? ' '), '>')) return true;
  if (REFERENCE_DEFINITION.test(lenientQuote(line).content)) return true;
  return depthOpen(paragraph, (index) => paragraph[index] === '[', ']') || linkDestinationOpen(onLine);
}

/** A test for "possibly shown as text" at the start of each of `ranges` (the tag tokens of `text`). */
export function codeOrLinkTest(text: string, ranges: readonly TextRange[], blocks: BlockContext): (range: TextRange) => boolean {
  // Other tokens' own brackets and backticks must not count: mask them with a plain letter.
  let masked = text;
  for (const range of ranges) masked = masked.slice(0, range.start) + 'x'.repeat(range.end - range.start) + masked.slice(range.end);
  masked = withoutEscapes(masked);
  const lines = masked.split('\n');
  const starts: number[] = [];
  lines.reduce((at, line) => { starts.push(at); return at + line.length + 1; }, 0);
  return (range) => {
    let index = starts.findIndex((start, at) => range.start >= start && range.start <= start + (lines[at]?.length ?? 0));
    if (index < 0) index = lines.length - 1;
    let first = 0;
    if (blocks !== 'inline-only') {
      const block = blocks?.find((candidate) => index >= candidate.startLine && index <= candidate.endLine);
      if (!block) return true;
      if (block.container) {
        if (deepPrefix(lines[index] ?? '')) return true;
        for (let at = block.startLine; at <= index; at++) if (FENCE_OR_HTML.test(lenientQuote(lines[at] ?? '').content)) return true;
      }
      first = block.startLine;
    }
    for (let at = index - 1; at >= first; at--) if ((lines[at] ?? '').replace(/^(?:[ \t]*>)*/, '').trim() === '') { first = at + 1; break; }
    const paragraph = masked.slice(starts[first] ?? 0, range.start);
    const onLine = masked.slice(starts[index] ?? 0, range.start);
    return inlineOpen(paragraph, onLine, lines[index] ?? '');
  };
}
