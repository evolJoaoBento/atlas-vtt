/**
 * The tags that mark parts of a note, written as Obsidian comments so they never show and never leave:
 * `%%[!private]%%`, `%%[!only|Ana, Ben]%%` and `%%[!except|Cara]%%`, each closed by `%%[!end]%%`, which
 * closes the innermost open part. Keywords are case-insensitive and whitespace inside the comment is fine.
 *
 * Tags are found first, as whole tokens (`%% [!…] %%` on one line), and comments are paired only in the
 * gaps between them: a `%%` that Obsidian shows as code (`` `%%` ``) cannot shift which `%%` pairs with
 * which and so turn a part's tags into text. A comment not closed within its gap hides the rest of the note.
 * A token whose text is not a tag (an unknown keyword, no names, `end|x`) is malformed: it opens a part
 * hidden from everyone and never closes one, so a mistyped tag can only hide more.
 */
import { scanComments, type CommentSpan } from './commentFilter';

export type PartRule = { kind: 'private' } | { kind: 'only' | 'except'; names: string[] };

/** A tag in a text, `[start, end)` covering the whole token. */
export type PartTag =
  | { kind: 'open'; rule: PartRule; start: number; end: number }
  | { kind: 'malformed'; text: string; start: number; end: number }
  | { kind: 'end'; start: number; end: number };

/** A part opener (a tag or a malformed one) with the end that closes it, null when nothing does. */
export interface OpenPart {
  tag: Exclude<PartTag, { kind: 'end' }>;
  close: Extract<PartTag, { kind: 'end' }> | null;
}

/** A note's tags and its comments outside them. */
export interface NoteMarkup {
  tags: PartTag[];
  comments: CommentSpan[];
}

export const END_TAG = '%%[!end]%%';
const TOKEN = /%%[ \t]*(\[[ \t]*![^\]\n]*\])[ \t]*%%/g;
const TAG = /^\[!\s*(private|only|except|end)\s*(?:\|([^\]]*))?\]$/i;
/** Text that reads as an attempt at a tag: it starts like one, or names a keyword after `[!`. */
const TAG_START = /^\[\s*!/;
export const TAG_MENTION = /\[\s*!\s*(?:private|only|except|public|end)/i;

/** The tag text for a rule, names as given. */
export function openTag(rule: PartRule): string {
  return rule.kind === 'private' ? '%%[!private]%%' : `%%[!${rule.kind}|${rule.names.join(', ')}]%%`;
}

/** Whether text looks like a tag, or like an attempt at one. */
export function looksLikeTag(text: string): boolean {
  return TAG_START.test(text.trim()) || TAG_MENTION.test(text);
}

function tagOf(content: string, start: number, end: number): PartTag {
  const malformed: PartTag = { kind: 'malformed', text: content.slice(0, 40), start, end };
  const match = TAG.exec(content.trim());
  if (!match) return malformed;
  const kind = (match[1] ?? '').toLowerCase();
  const names = match[2];
  if (kind === 'end') return names === undefined ? { kind: 'end', start, end } : malformed;
  if (kind === 'private') return names === undefined ? { kind: 'open', rule: { kind: 'private' }, start, end } : malformed;
  const list = (names ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  if (list.length === 0) return malformed;
  return { kind: 'open', rule: { kind: kind === 'only' ? 'only' : 'except', names: list }, start, end };
}

/** The tags of `text` as whole tokens, then the comments in the gaps between them. */
export function scanMarkup(text: string): NoteMarkup {
  const tags = [...text.matchAll(TOKEN)].map((match) => tagOf(match[1] ?? '', match.index ?? 0, (match.index ?? 0) + match[0].length));
  const comments: CommentSpan[] = [];
  let gapStart = 0;
  for (const gapEnd of [...tags.map((tag) => tag.start), text.length]) {
    const found = scanComments(text, gapStart, gapEnd);
    comments.push(...found);
    if (found.some((comment) => !comment.closed)) break;
    gapStart = tags.find((tag) => tag.start === gapEnd)?.end ?? gapEnd;
  }
  return { tags, comments };
}

/** Every tag in `text`, in order. */
export function scanTags(text: string): PartTag[] {
  return scanMarkup(text).tags;
}

/** Pairs each opener with the end that closes it; ends with nothing open are `stray`. */
export function pairTags(tags: readonly PartTag[]): { parts: OpenPart[]; stray: Array<Extract<PartTag, { kind: 'end' }>> } {
  const parts: OpenPart[] = [];
  const open: OpenPart[] = [];
  const stray: Array<Extract<PartTag, { kind: 'end' }>> = [];
  for (const tag of tags) {
    if (tag.kind !== 'end') {
      const part: OpenPart = { tag, close: null };
      parts.push(part);
      open.push(part);
    } else {
      const part = open.pop();
      if (part) part.close = tag;
      else stray.push(tag);
    }
  }
  return { parts, stray };
}

/** Whether `after` (a merge) still holds the parts of `before` whole: as many closed parts, no more stray or unclosed tags. */
export function partsSurvive(before: string, after: string): boolean {
  const shape = (text: string): { closed: number; broken: number } => {
    const { parts, stray } = pairTags(scanTags(text));
    return { closed: parts.filter((part) => part.close !== null).length, broken: stray.length + parts.filter((part) => part.close === null).length };
  };
  const was = shape(before);
  const now = shape(after);
  return now.closed >= was.closed && now.broken <= was.broken;
}
