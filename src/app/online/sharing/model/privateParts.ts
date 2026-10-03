/**
 * The body of a note as one reader gets it: comments go (tags are comments too), and so does every part
 * whose tag does not let the reader in; a part nested in another must pass every rule. A part that is never
 * closed hides everything after its tag from everyone, and a malformed tag hides up to its end (or the end
 * of the note). Then the old callouts are kept back (`oldCallouts.ts`), judged on the author's view of the
 * note so a tag around only a callout's header cannot uncover its body, and once more on the reader's text.
 * Restricted parts the reader gets can keep their tags, rewritten (`forwardedParts.ts`).
 */
import { keptLines, scanComments, type TextRange } from './commentFilter';
import { oldCalloutMask } from './oldCallouts';
import { END_TAG, pairTags, scanTags, type OpenPart, type PartRule, type PartTag } from './privateTags';

/** What the sender should hear about a note's tags. */
export interface PartProblems {
  /** Starts of malformed tags. */
  malformed: string[];
  /** `%%[!end]%%` tags with nothing open; they are ignored. */
  strayEnds: number;
  /** Tags never closed: what follows them is hidden from everyone. */
  unclosed: number;
  /** Starts of old callout text, which hides its block. */
  oldSyntax: string[];
}

/** Rewrites the open tag of a restricted part the reader may see; its end goes as `%%[!end]%%`. */
export interface PartMarks {
  openTag(rule: PartRule): string;
}

/** The range a part covers, from its tag to its end (or the end of the body). */
const coverOf = (part: OpenPart, body: string): TextRange => ({ start: part.tag.start, end: part.close?.end ?? body.length });

/** Only a closed, well-formed part whose rule lets the reader in is shown. */
const shown = (part: OpenPart, allows: (rule: PartRule) => boolean): boolean =>
  part.tag.kind === 'open' && part.close !== null && allows(part.tag.rule);

/** The author's view: every part shown, comments and tags gone. Malformed and unclosed parts stay hidden. */
function authorLines(body: string, comments: readonly TextRange[], parts: readonly OpenPart[]): Array<string | null> {
  return keptLines(body, [...comments, ...parts.filter((part) => !shown(part, () => true)).map((part) => coverOf(part, body))]);
}

function lineIndexer(body: string): (offset: number) => number {
  const starts = [0];
  for (let at = body.indexOf('\n'); at >= 0; at = body.indexOf('\n', at + 1)) starts.push(at + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };
}

/** Whether `text` holds exactly `count` well-formed parts, each closed, and no other tag. */
function holdsMarkedParts(text: string, count: number): boolean {
  const tags = scanTags(text);
  const { parts, stray } = pairTags(tags);
  return stray.length === 0 && parts.length === count && parts.every((part) => part.tag.kind === 'open' && part.close !== null);
}

/**
 * The body lines a reader gets. With `marks`, every restricted part they get keeps its tags (rewritten by
 * `marks`); a part whose tag line the old-callout guard removes is hidden instead, so a tag never goes
 * without its end. Without `marks`, tags go like any comment.
 */
export function bodyLinesFor(body: string, allows: (rule: PartRule) => boolean, marks?: PartMarks): string[] {
  const comments: TextRange[] = scanComments(body);
  const parts = pairTags(scanTags(body)).parts;
  const author = oldCalloutMask(authorLines(body, comments, parts));
  const lineOf = lineIndexer(body);
  const hidden = new Set(parts.filter((part) => !shown(part, allows)));
  for (;;) {
    const covers = [...hidden].map((part) => coverOf(part, body));
    const bare = keptLines(body, [...comments, ...covers]).map((line, index) => (author[index] ? line : null));
    const again = oldCalloutMask(bare);
    const keep = (index: number): boolean => author[index] !== false && again[index] !== false;
    const inHidden = (part: OpenPart): boolean => covers.some((cover) => cover.start <= part.tag.start && (part.close?.end ?? 0) <= cover.end);
    const marked = marks ? parts.filter((part) => !hidden.has(part) && part.tag.kind === 'open' && part.tag.rule.kind !== 'private' && !inHidden(part)) : [];
    const broken = marked.filter((part) => !keep(lineOf(part.tag.start)) || !keep(lineOf(part.close?.start ?? 0)));
    if (broken.length > 0) {
      broken.forEach((part) => hidden.add(part));
      continue;
    }
    const tagStarts = new Set(marked.flatMap((part) => [part.tag.start, part.close?.start]));
    const replacements: TextRange[] = marked.flatMap((part) => (part.tag.kind === 'open' && part.close
      ? [{ ...coverOfTag(part.tag), text: marks?.openTag(part.tag.rule) ?? '' }, { ...coverOfTag(part.close), text: END_TAG }]
      : []));
    const lines = keptLines(body, [...comments.filter((comment) => !tagStarts.has(comment.start)), ...covers, ...replacements])
      .filter((line, index): line is string => line !== null && keep(index));
    // A rewritten tag that did not come through whole (or text that reads as one more) hides every marked part.
    if (marked.length === 0 || holdsMarkedParts(lines.join('\n'), marked.length)) return lines;
    marked.forEach((part) => hidden.add(part));
  }
}

const coverOfTag = (tag: PartTag): TextRange => ({ start: tag.start, end: tag.end });

export function partProblemsIn(body: string): PartProblems {
  const tags = scanTags(body);
  const { parts, stray } = pairTags(tags);
  const oldSyntax: string[] = [];
  oldCalloutMask(authorLines(body, scanComments(body), parts), (text) => oldSyntax.push(text));
  return {
    malformed: tags.flatMap((tag) => (tag.kind === 'malformed' ? [tag.text] : [])),
    strayEnds: stray.length,
    unclosed: parts.filter((part) => part.close === null).length,
    oldSyntax,
  };
}

/** The names `only` and `except` tags use, in order of appearance. */
export function partNamesIn(body: string): string[] {
  return scanTags(body).flatMap((tag) => (tag.kind === 'open' && tag.rule.kind !== 'private' ? tag.rule.names : []));
}
