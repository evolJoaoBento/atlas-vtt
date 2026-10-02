/**
 * Comments, which are never shared: `%% … %%` and HTML `<!-- … -->`, inline or across lines,
 * but not inside code fences.
 */
import { closesFence, fenceOpened, lenientQuote, strictQuote } from './quoteLines';

interface OpenFence {
  marker: string;
  /** Quote depth of the line that opened it. */
  depth: number;
  /** Indentation of that line after its quote markers: a list item's fence ends at less. */
  indent: number;
}

const indentOf = (content: string): number => content.length - content.trimStart().length;

/**
 * A fence ends with its container: a quoted fence when a line has fewer quote markers (a blank
 * line included), an indented one when a text line is indented less than it. When unsure the
 * fence counts as ended, which only removes more comments.
 */
function endedByContainer(fence: OpenFence, line: string): boolean {
  const { depth, content } = strictQuote(line);
  if (depth < fence.depth) return true;
  return content.trim() !== '' && indentOf(content) < fence.indent;
}

const OPENERS = ['%%', '<!--'] as const;
const CLOSERS: Record<string, string> = { '%%': '%%', '<!--': '-->' };

/** The text of `line` outside comments, and the closer of the comment still open at its end (null when none). */
function withoutComments(line: string, open: string | null): { kept: string; open: string | null; touched: boolean } {
  let kept = '';
  let rest = line;
  let touched = open !== null;
  let closer = open;
  for (;;) {
    if (closer !== null) {
      const at = rest.indexOf(closer);
      if (at < 0) return { kept, open: closer, touched };
      rest = rest.slice(at + closer.length);
      closer = null;
      continue;
    }
    const found = OPENERS.map((opener) => ({ opener, at: rest.indexOf(opener) })).filter((hit) => hit.at >= 0).sort((a, b) => a.at - b.at)[0];
    if (!found) return { kept: kept + rest, open: null, touched };
    touched = true;
    kept += rest.slice(0, found.at);
    rest = rest.slice(found.at + found.opener.length);
    closer = CLOSERS[found.opener] ?? null;
  }
}

/**
 * Removes the comments; a line left with nothing (or only quote and list markers) goes, so no
 * blank line appears where there was none. An unclosed comment runs to the end of the note.
 * A fence counts only in plain position (at most three spaces), so a look-alike never keeps a
 * comment that is meant to stay private.
 */
export function stripComments(lines: readonly string[]): string[] {
  const out: string[] = [];
  let open: string | null = null;
  let fence: OpenFence | null = null;
  for (const line of lines) {
    if (open === null) {
      if (fence !== null && endedByContainer(fence, line)) fence = null;
      const { depth, content } = strictQuote(line);
      if (fence !== null) {
        if (closesFence(content, fence.marker)) fence = null;
        out.push(line);
        continue;
      }
      const marker = fenceOpened(content);
      if (marker) {
        fence = { marker, depth, indent: indentOf(content) };
        out.push(line);
        continue;
      }
    }
    const result = withoutComments(line, open);
    open = result.open;
    if (!result.touched) out.push(line);
    else if (lenientQuote(result.kept).content.trim() !== '') out.push(result.kept.trimEnd());
  }
  return out;
}
