/**
 * Whether a place in a note is possibly inside code or a link, where Obsidian shows a tag as plain text:
 * inside a code fence (``` or ~~~, behind any quote, list or indent prefix, unclosed to the end), inside a
 * code span (backtick runs from the start of the paragraph, or an odd number of backticks before it on its
 * line), or inside a link label or wiki link (`[` not yet closed in its paragraph: `[x …](u)`, `[[a|…]]`).
 * Detection is deliberately loose: a false "maybe" only hides more (the filter's backstop), while a tag
 * counted where Obsidian shows text could pair with a real one and share a part.
 */
import type { TextRange } from './commentFilter';
import { lenientQuote } from './quoteLines';

const FENCE = /^(`{3,}|~{3,})(.*)$/;

interface Line {
  start: number;
  end: number;
  blank: boolean;
  /** The line is a fence line or inside an open fence. */
  fenced: boolean;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let open: { char: string; length: number } | null = null;
  let start = 0;
  for (const raw of text.split('\n')) {
    const content = lenientQuote(raw).content;
    const fence = FENCE.exec(content);
    let fenced = open !== null;
    if (open) {
      if (fence && fence[1]?.[0] === open.char && (fence[1]?.length ?? 0) >= open.length && (fence[2] ?? '').trim() === '') open = null;
    } else if (fence && !(fence[1]?.[0] === '`' && (fence[2] ?? '').includes('`'))) {
      open = { char: fence[1]?.[0] ?? '`', length: fence[1]?.length ?? 3 };
      fenced = true;
    }
    lines.push({ start, end: start + raw.length, blank: raw.trim() === '', fenced });
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

/** A test for "possibly inside code or a link" at the start of each of `ranges` (the tag tokens of `text`). */
export function codeOrLinkTest(text: string, ranges: readonly TextRange[]): (range: TextRange) => boolean {
  // Other tokens' own brackets and backticks must not count: blank them out.
  let masked = text;
  for (const range of ranges) masked = masked.slice(0, range.start) + ' '.repeat(range.end - range.start) + masked.slice(range.end);
  const lines = linesOf(masked);
  return (range) => {
    const index = lines.findIndex((line) => range.start >= line.start && range.start <= line.end);
    const line = lines[index];
    if (!line) return true;
    if (line.fenced) return true;
    let first = index;
    while (first > 0 && !lines[first - 1]?.blank && !lines[first - 1]?.fenced) first--;
    const paragraph = masked.slice(lines[first]?.start ?? line.start, range.start);
    const onLine = masked.slice(line.start, range.start);
    if (codeSpanOpen(paragraph) || (onLine.match(/`/g) ?? []).length % 2 === 1) return true;
    return (paragraph.match(/\[/g) ?? []).length > (paragraph.match(/\]/g) ?? []).length;
  };
}
