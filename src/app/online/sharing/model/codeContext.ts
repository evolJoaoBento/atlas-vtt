/**
 * Whether a place in a note is possibly inside code, math or a link, where Obsidian shows a tag as plain text:
 * - a code fence (``` or ~~~, behind any quote, list or indent prefix, unclosed to the end);
 * - indented code: a line 4 or more columns (a tab is 4) beyond the content indent of the list or quote it
 *   sits in, after a blank line or a block start (`indentedCode`);
 * - a code span (backtick runs from the start of the paragraph, or an odd number of backticks on its line);
 * - a `<pre>` or `<code>` HTML block not closed yet, `$$` math (odd count before it), `$` math (odd count in
 *   its paragraph), an autolink `<…>` open on its line, a reference definition line (`[r]: <u>`, `[r]: u`);
 * - a link label or wiki link (bracket depth in its paragraph above 0), or a link destination (a `](` on its
 *   line not closed by `)`).
 * Detection is deliberately loose: a false "maybe" only hides more (the filter's backstop), while a tag
 * counted where Obsidian shows text could pair with a real one and share a part. Container indents are only
 * ever underestimated, which can only find more code.
 */
import type { TextRange } from './commentFilter';
import { lenientQuote } from './quoteLines';

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const LIST_ITEM = /^([-*+]|\d{1,9}[.)])( +|\t|$)/;
const ORDERED = /^\d/;
const REFERENCE_DEFINITION = /^\[[^\]]*\]:/;

interface Line {
  start: number;
  end: number;
  blank: boolean;
  /** A fence line, a line inside an open fence, or possibly indented code. */
  code: boolean;
}

/** Columns of leading whitespace (tabs to the next multiple of 4), and the rest. */
function indentOf(text: string): { columns: number; rest: string } {
  let columns = 0;
  let index = 0;
  for (; index < text.length && (text[index] === ' ' || text[index] === '\t'); index++) columns = text[index] === '\t' ? columns + 4 - (columns % 4) : columns + 1;
  return { columns, rest: text.slice(index) };
}

/** The line without its quote markers (each `>` and one optional space). */
const withoutQuotes = (raw: string): string => raw.replace(/^(?:[ ]{0,3}>[ ]?)+/, '');

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let fence: { char: string; length: number } | null = null;
  let listContent = 0;
  let previous: { blank: boolean; code: boolean; paragraph: boolean; listItem: boolean } = { blank: true, code: false, paragraph: false, listItem: false };
  let start = 0;
  for (const raw of text.split('\n')) {
    // A line holding only quote markers is blank inside its quote.
    const blank = withoutQuotes(raw).trim() === '';
    const { columns, rest } = indentOf(withoutQuotes(raw));
    const opener = FENCE.exec(lenientQuote(raw).content);
    let code = fence !== null;
    let paragraph = false;
    let listItem = false;
    if (fence) {
      if (opener && opener[1]?.[0] === fence.char && (opener[1]?.length ?? 0) >= fence.length && (opener[2] ?? '').trim() === '') fence = null;
    } else if (opener && !(opener[1]?.[0] === '`' && (opener[2] ?? '').includes('`'))) {
      fence = { char: opener[1]?.[0] ?? '`', length: opener[1]?.length ?? 3 };
      code = true;
    } else if (!blank) {
      const marker = LIST_ITEM.exec(rest);
      // An ordered item cannot interrupt a paragraph: only trust it after a blank line or another item.
      listItem = marker !== null && (!ORDERED.test(rest) || previous.blank || previous.listItem);
      const startsBlock = previous.blank || previous.code || !previous.paragraph;
      if (!listItem && previous.blank && columns < listContent) listContent = 0;
      if (columns >= listContent + 4 && (startsBlock || previous.code)) code = true;
      else if (listItem && marker) listContent = columns + (marker[1]?.length ?? 1) + Math.min(Math.max((marker[2] ?? ' ').length, 1), 4);
      paragraph = !code && !/^#{1,6}(\s|$)/.test(rest);
    }
    lines.push({ start, end: start + raw.length, blank, code });
    previous = { blank, code: code && !blank, paragraph, listItem };
    start += raw.length + 1;
  }
  return lines;
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

/** Whether `open` is left open at the end of `text`: depth counting, a closer at depth 0 changes nothing. */
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

/** Code, math or HTML before `at` that may still be open there. */
function codeOpen(before: string, paragraph: string, onLine: string): boolean {
  if (codeSpanOpen(paragraph) || count(onLine, /`/g) % 2 === 1) return true;
  if (count(before, /<(?:pre|code)\b/gi) > count(before, /<\/(?:pre|code)\s*>/gi)) return true;
  if (count(before, /\$\$/g) % 2 === 1 || count(paragraph.replace(/\$\$/g, ''), /\$/g) % 2 === 1) return true;
  return depthOpen(onLine, (index) => onLine[index] === '<' && /\S/.test(onLine[index + 1] ?? ' '), '>');
}

/** A test for "possibly inside code, math or a link" at the start of each of `ranges` (the tag tokens of `text`). */
export function codeOrLinkTest(text: string, ranges: readonly TextRange[]): (range: TextRange) => boolean {
  // Other tokens' own brackets and backticks must not count: mask them with a plain letter (not spaces, which would read as indent).
  let masked = text;
  for (const range of ranges) masked = masked.slice(0, range.start) + 'x'.repeat(range.end - range.start) + masked.slice(range.end);
  const lines = linesOf(masked);
  return (range) => {
    const index = lines.findIndex((line) => range.start >= line.start && range.start <= line.end);
    const line = lines[index];
    if (!line || line.code) return true;
    let first = index;
    while (first > 0 && !lines[first - 1]?.blank && !lines[first - 1]?.code) first--;
    const paragraph = masked.slice(lines[first]?.start ?? line.start, range.start);
    const onLine = masked.slice(line.start, range.start);
    if (codeOpen(masked.slice(0, range.start), paragraph, onLine)) return true;
    if (REFERENCE_DEFINITION.test(lenientQuote(masked.slice(line.start, line.end)).content)) return true;
    return depthOpen(paragraph, (at) => paragraph[at] === '[', ']') || linkDestinationOpen(onLine);
  };
}
