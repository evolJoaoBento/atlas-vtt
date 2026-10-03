/**
 * The callouts notes used before the part tags: `> [!private]`, `> [!only|…]`, `> [!except|…]`. They are no
 * longer a sharing syntax, so an older note must not start sharing what they hid: any text that mentions
 * `[!private`, `[!only` or `[!except` hides the paragraph or quote block it starts. Such a block ends only at
 * a blank line, a heading or a fence at a lower quote depth: Obsidian continues a callout's paragraph onto
 * the following lines lazily, so anything else stays inside it. Headers are found through list markers,
 * tabs and further quotes (`quoteLines.ts`).
 */
import { interruptDepth, lenientQuote } from './quoteLines';

const MARKER = /\[!\s*(?:private|only|except)/i;

/**
 * For each line, whether it stays; null lines (already dropped) are skipped and stay true.
 * `onFound` hears the start of each mention.
 */
export function oldCalloutMask(lines: ReadonlyArray<string | null>, onFound?: (text: string) => void): boolean[] {
  let open: number[] = [];
  return lines.map((line) => {
    if (line === null) return true;
    const interrupt = interruptDepth(line);
    if (interrupt !== null) open = open.filter((depth) => depth <= interrupt);
    const marker = MARKER.exec(line);
    if (marker) {
      onFound?.(line.slice(marker.index, marker.index + 30));
      open.push(Math.max(lenientQuote(line).depth, 1));
    }
    return open.length === 0;
  });
}
