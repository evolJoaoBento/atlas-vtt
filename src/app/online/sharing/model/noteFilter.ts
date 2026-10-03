/**
 * What of a note one recipient gets, decided on the sender's machine before anything is hashed or sent.
 * The part tags are read first, then comments go (everywhere, code included; the tags are comments too):
 * `%%[!private]%%` parts never, `%%[!only|names]%%` only to those people, `%%[!except|names]%%` to everyone
 * but them, each up to its `%%[!end]%%` (`privateParts.ts`). Old `> [!private]`-style callouts are kept back
 * whole (`oldCallouts.ts`). Restricted parts the recipient gets arrive still tagged, for the people they may
 * pass them on to (`forwardedParts.ts`). Then only shareable properties stay and links to notes the
 * recipient does not get become text.
 */
import { partAllows, type NameResolver, type Recipient } from './audience';
import { keepProperties, splitFrontmatter } from './frontmatterFilter';
import { rewriteLinks, type LinkResolver } from './noteLinks';
import { bodyLinesFor, partNamesIn, partProblemsIn, type PartMarks, type PartProblems } from './privateParts';
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

/** Malformed, stray and unclosed tags, and old callouts, for the sender's warnings. */
export function partProblemsInNote(source: string): PartProblems {
  return partProblemsIn(splitFrontmatter(lf(source)).body);
}
