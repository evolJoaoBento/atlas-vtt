/**
 * What of a note one recipient gets, decided on the sender's machine before anything is hashed or sent.
 * The part tags are read first, as whole tokens, then comments go (everywhere, code included):
 * `%%[!private]%%` parts never, `%%[!only|names]%%` only to those people, `%%[!except|names]%%` to everyone
 * but them, each up to its `%%[!end]%%` (`privateParts.ts`). Tag text outside a tag (an old `> [!private]`
 * callout among others) hides the rest of the note. Restricted parts the recipient gets arrive still
 * tagged, for the people they may pass them on to (`forwardedParts.ts`). Then only shareable properties stay and links to notes the
 * recipient does not get become text.
 */
import { partAllows, type NameResolver, type Recipient } from './audience';
import { keepProperties, splitFrontmatter } from './frontmatterFilter';
import { rewriteLinks, type LinkResolver } from './noteLinks';
import { bodyLinesFor, partNamesIn, partProblemsIn, type PartMarks, type PartProblems } from './privateParts';
import { END_TAG } from './privateTags';
import { parseShareRule, SHARE_PROPERTY, unknownRuleNames } from './shareRule';

export interface NoteFilterContext {
  recipient: Recipient;
  people: NameResolver;
  /** Properties that may be shared (`online.shareableProperties`). */
  shareable: readonly string[];
  links: LinkResolver;
  /**
   * How a restricted part the recipient gets keeps its protection (`forwardedParts.ts`): its open tag as sent.
   * Null sends such parts untagged, as plain text (only for what never leaves this Atlas).
   */
  marks: PartMarks | null;
}

const lf = (source: string): string => source.replace(/\r\n?/g, '\n');

export function filterNoteFor(source: string, context: NoteFilterContext): string {
  const { frontmatter, body } = splitFrontmatter(lf(source));
  const properties = frontmatter ? keepProperties(frontmatter, context.shareable) : [];
  const lines = bodyLinesFor(body, (rule) => partAllows(rule, context.recipient, context.people), context.marks ?? undefined);
  const head = properties.length > 0 ? `---\n${properties.join('\n')}\n---\n` : '';
  return rewriteLinks(head + lines.join('\n'), context.links);
}

/** Names in the note's tags and `atlas-share` that are not in the people list: the sender's warning. */
export function unknownNamesIn(source: string, people: NameResolver): string[] {
  const { frontmatter, body } = splitFrontmatter(lf(source));
  const names = new Set(partNamesIn(body).filter((name) => !people.byName(name)));
  const property = frontmatter?.find((line) => line.startsWith(`${SHARE_PROPERTY}:`));
  if (property) {
    const value = property.slice(SHARE_PROPERTY.length + 1).trim().replace(/^\[|\]$/g, '');
    unknownRuleNames(parseShareRule(value), people).forEach((name) => names.add(name));
  }
  return [...names].sort();
}

/** Malformed, stray and unclosed tags, and tag text outside tags, for the sender's warnings; lines count from the note's first line. */
export function partProblemsInNote(source: string): PartProblems {
  const normal = lf(source);
  const text = normal.charCodeAt(0) === 0xfeff ? normal.slice(1) : normal;
  const { body } = splitFrontmatter(text);
  const before = text.length - body.length > 0 ? text.slice(0, text.length - body.length).split('\n').length - 1 : 0;
  const problems = partProblemsIn(body);
  return { ...problems, strayEndLines: problems.strayEndLines.map((line) => line + before) };
}

/**
 * The line of the first `%%[!end]%%` that closes nothing, or null. Such a note is not shared at all until it
 * is fixed: its start tag was probably deleted, so the text before it may have been meant for fewer people.
 */
export function strayEndLineIn(source: string): number | null {
  return partProblemsInNote(source).strayEndLines[0] ?? null;
}

export const strayEndProblem = (line: number): string =>
  `This note is not shared: the ${END_TAG} on line ${line} closes no part, so its start tag may have been deleted. Fix or remove it to share the note again.`;
