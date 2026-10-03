/**
 * Comments, which are never shared: `%% … %%` and HTML `<!-- … -->`, inline or across lines.
 * Code fences are not tracked on purpose: every comment is removed everywhere, inside code too,
 * and an unclosed one hides the rest of the note. Following fences through quotes and lists
 * kept finding new ways to keep a comment that Obsidian hides, so this fails closed instead.
 */
import { lenientQuote } from './quoteLines';

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
 * blank line appears where there was none.
 */
export function stripComments(lines: readonly string[]): string[] {
  return stripCommentsChecked(lines).lines;
}

/** Like `stripComments`, and says whether a comment was still open at the end (everything after it was hidden). */
export function stripCommentsChecked(lines: readonly string[]): { lines: string[]; open: boolean } {
  const out: string[] = [];
  let open: string | null = null;
  for (const line of lines) {
    const result = withoutComments(line, open);
    open = result.open;
    if (!result.touched) out.push(line);
    else if (lenientQuote(result.kept).content.trim() !== '') out.push(result.kept.trimEnd());
  }
  return { lines: out, open: open !== null };
}
