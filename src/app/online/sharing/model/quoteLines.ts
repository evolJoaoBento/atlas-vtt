/**
 * How note lines are read for callouts and comments. Two readings, on purpose:
 * - `lenientQuote` finds where a callout header may sit: it strips any run of spaces or tabs,
 *   list markers (`-`, `*`, `+`, `N.`, `N)`) and further `>`, so a header nested in a list or
 *   behind a tab is still found. Depth is the count of `>`.
 * - `strictQuote` is for what may END a callout (a heading or a fence): only quote markers with
 *   at most three spaces of indentation. A line that is merely indented, listed or tab-led stays
 *   inside the callout, so reading more strictly can only hide more.
 */
export interface QuoteLine {
  depth: number;
  content: string;
}

const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/;

export function lenientQuote(line: string): QuoteLine {
  let depth = 0;
  let rest = line;
  for (;;) {
    rest = rest.replace(/^[ \t]+/, '');
    if (rest.startsWith('>')) {
      depth++;
      rest = rest.slice(1);
      continue;
    }
    const marker = LIST_MARKER.exec(rest);
    if (!marker) return { depth, content: rest };
    rest = rest.slice(marker[0].length);
  }
}

export function strictQuote(line: string): QuoteLine {
  let depth = 0;
  let rest = line;
  for (let marker = /^ {0,3}>/.exec(rest); marker; marker = /^ {0,3}>/.exec(rest)) {
    depth++;
    rest = rest.slice(marker[0].length);
    if (rest.startsWith(' ')) rest = rest.slice(1);
  }
  return { depth, content: rest };
}

const FENCE_OPEN = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const ONLY_QUOTES = /^(?:[ \t]*>)*[ \t]*$/;

/** The fence a line opens (its marker run), or null. */
export function fenceOpened(content: string): string | null {
  const match = FENCE_OPEN.exec(content);
  return match ? match[1] ?? match[2] ?? null : null;
}

/** Nothing but whitespace and quote markers: a bare list marker is not blank. Depth is its `>` count. */
export function blankQuoteDepth(line: string): number | null {
  return ONLY_QUOTES.test(line) ? (line.match(/>/g) ?? []).length : null;
}

/** A heading or a fence in plain quote position, which ends the callouts deeper than it. */
export function interruptDepth(line: string): number | null {
  const blank = blankQuoteDepth(line);
  if (blank !== null) return blank;
  const { depth, content } = strictQuote(line);
  return HEADING.test(content) || fenceOpened(content) !== null ? depth : null;
}
