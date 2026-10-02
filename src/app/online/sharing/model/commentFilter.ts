/** `%% … %%` comments, which are never shared: inline or across lines, but not inside code fences. */
import { closesFence, fenceOpened, lenientQuote, strictQuote } from './quoteLines';

/**
 * Removes the comments; a line left with nothing (or only quote and list markers) goes, so no
 * blank line appears where there was none. An unclosed comment runs to the end of the note.
 * A fence counts only in plain position (at most three spaces), so a look-alike never keeps a
 * comment that is meant to stay private.
 */
export function stripComments(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inComment = false;
  let fence: string | null = null;
  for (const line of lines) {
    if (!inComment) {
      const content = strictQuote(line).content;
      if (fence !== null) {
        if (closesFence(content, fence)) fence = null;
        out.push(line);
        continue;
      }
      const opened = fenceOpened(content);
      if (opened) {
        fence = opened;
        out.push(line);
        continue;
      }
    }
    let kept = '';
    let rest = line;
    let touched = inComment;
    for (let at = rest.indexOf('%%'); ; at = rest.indexOf('%%')) {
      if (at < 0) {
        if (!inComment) kept += rest;
        break;
      }
      touched = true;
      if (!inComment) kept += rest.slice(0, at);
      inComment = !inComment;
      rest = rest.slice(at + 2);
    }
    if (!touched) out.push(line);
    else if (lenientQuote(kept).content.trim() !== '') out.push(kept.trimEnd());
  }
  return out;
}
