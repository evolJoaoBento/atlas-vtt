/**
 * What of a note one recipient gets, decided on the sender's machine before anything is
 * hashed or sent. Comments (`%% … %%` and HTML comments, everywhere, code included) go first, then callouts:
 * `[!private]` never, `[!only|names]` only those people, `[!except|names]` everyone but them,
 * and a section nested in another must pass every rule. A callout ends only at a blank line, a
 * heading or a fence at a lower quote depth: Obsidian continues a callout's paragraph onto the
 * following lines lazily, so anything else stays inside it (fail-closed). Headers are found
 * through list markers, tabs and further quotes (`quoteLines.ts`). Text that mentions
 * `[!private`, `[!only` or `[!except` but is not a readable header hides the section it starts.
 * Then only shareable properties stay and links to notes the recipient does not get become text.
 */
import { calloutAllows, type NameResolver, type Recipient } from './audience';
import { stripComments } from './commentFilter';
import { keepProperties, splitFrontmatter } from './frontmatterFilter';
import { rewriteLinks, type LinkResolver } from './noteLinks';
import { interruptDepth, lenientQuote } from './quoteLines';
import { parseShareRule, SHARE_PROPERTY, unknownRuleNames } from './shareRule';

export type CalloutRule = { kind: 'private' } | { kind: 'only' | 'except'; names: string[] };

export interface NoteFilterContext {
  recipient: Recipient;
  people: NameResolver;
  /** Properties that may be shared (`online.shareableProperties`). */
  shareable: readonly string[];
  links: LinkResolver;
}

const CALLOUT_HEADER = /^\[!\s*(private|only|except)\s*(?:\|([^\]]*))?\]/i;
/** Any mention of a private callout type, readable or not. */
const MARKER = /\[!\s*(?:private|only|except)/i;

export function calloutRuleOf(content: string): CalloutRule | null {
  const match = CALLOUT_HEADER.exec(content.trimStart());
  if (!match) return null;
  const kind = (match[1] ?? '').toLowerCase();
  if (kind === 'private') return { kind: 'private' };
  const names = (match[2] ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  return { kind: kind === 'only' ? 'only' : 'except', names };
}

interface Section {
  depth: number;
  allowed: boolean;
}

/**
 * Walks the lines and reports, for each, whether it is kept. `onHeader` is asked about each
 * readable header; text that names a private type without being one is a hidden section of its own.
 */
function walkCallouts(lines: readonly string[], allows: (rule: CalloutRule) => boolean, onUnreadable?: (text: string) => void): string[] {
  let open: Section[] = [];
  const out: string[] = [];
  for (const line of lines) {
    const { depth, content } = lenientQuote(line);
    // Only an interrupting line ends callouts, and only those deeper than it; anything else continues them lazily.
    const interrupt = interruptDepth(line);
    if (interrupt !== null) open = open.filter((section) => section.depth <= interrupt);
    const rule = depth > 0 ? calloutRuleOf(content) : null;
    if (rule) {
      // A header inside an open callout at the same or a lower depth is text of it: it nests, never replaces.
      open.push({ depth, allowed: allows(rule) });
    } else {
      const marker = MARKER.exec(line);
      if (marker) {
        onUnreadable?.(line.slice(marker.index, marker.index + 30));
        open.push({ depth: Math.max(depth, 1), allowed: false });
      }
    }
    if (open.every((section) => section.allowed)) out.push(line);
  }
  return out;
}

export function filterNoteFor(source: string, context: NoteFilterContext): string {
  const { frontmatter, body } = splitFrontmatter(source.replace(/\r\n?/g, '\n'));
  const properties = frontmatter ? keepProperties(frontmatter, context.shareable) : [];
  const lines = walkCallouts(stripComments(body.split('\n')), (rule) => calloutAllows(rule, context.recipient, context.people));
  const head = properties.length > 0 ? `---\n${properties.join('\n')}\n---\n` : '';
  return rewriteLinks(head + lines.join('\n'), context.links);
}

function bodyLines(source: string): string[] {
  return stripComments(splitFrontmatter(source.replace(/\r\n?/g, '\n')).body.split('\n'));
}

/** Names in the note's callouts and `atlas-share` that are not in the people list: the sender's warning. */
export function unknownNamesIn(source: string, people: NameResolver): string[] {
  const text = source.replace(/\r\n?/g, '\n');
  const { frontmatter } = splitFrontmatter(text);
  const names = new Set<string>();
  for (const line of bodyLines(source)) {
    const { depth, content } = lenientQuote(line);
    const rule = depth > 0 ? calloutRuleOf(content) : null;
    if (rule && rule.kind !== 'private') rule.names.filter((name) => !people.byName(name)).forEach((name) => names.add(name));
  }
  const property = frontmatter?.find((line) => line.startsWith(`${SHARE_PROPERTY}:`));
  if (property) {
    const value = property.slice(SHARE_PROPERTY.length + 1).trim().replace(/^\[|\]$/g, '');
    unknownRuleNames(parseShareRule(value), people).forEach((name) => names.add(name));
  }
  return [...names].sort();
}

/** The starts of text that names a private type but is not a readable header; the filter hides what follows each. */
export function unreadablePrivateTextIn(source: string): string[] {
  const found: string[] = [];
  walkCallouts(bodyLines(source), () => true, (text) => found.push(text));
  return found;
}
