/**
 * The tags that mark parts of a note, written as Obsidian comments so they never show and never leave:
 * `%%[!private]%%`, `%%[!only|Ana, Ben]%%` and `%%[!except|Cara]%%`, each closed by `%%[!end]%%`, which
 * closes the innermost open part. Keywords are case-insensitive and whitespace inside the comment is fine.
 * A tag is a whole, closed `%% … %%` comment whose text is exactly a tag. A comment that looks like one
 * but is not (an unknown keyword, no names, an HTML comment) is malformed: it opens a part hidden from
 * everyone, never closes one, so a mistyped tag can only hide more.
 */
import { scanComments, type CommentSpan } from './commentFilter';

export type PartRule = { kind: 'private' } | { kind: 'only' | 'except'; names: string[] };

/** A tag in a text, `[start, end)` covering the whole comment. */
export type PartTag =
  | { kind: 'open'; rule: PartRule; start: number; end: number }
  | { kind: 'malformed'; text: string; start: number; end: number }
  | { kind: 'end'; start: number; end: number };

/** A part opener (a tag or a malformed one) with the end that closes it, null when nothing does. */
export interface OpenPart {
  tag: Exclude<PartTag, { kind: 'end' }>;
  close: Extract<PartTag, { kind: 'end' }> | null;
}

export const END_TAG = '%%[!end]%%';
const TAG = /^\[!\s*(private|only|except|end)\s*(?:\|([^\]]*))?\]$/i;
/** Text that reads as an attempt at a tag: it starts like one, or names a keyword after `[!`. */
const TAG_START = /^\[\s*!/;
const TAG_MENTION = /\[\s*!\s*(?:private|only|except|end)/i;

/** The tag text for a rule, names as given. */
export function openTag(rule: PartRule): string {
  return rule.kind === 'private' ? '%%[!private]%%' : `%%[!${rule.kind}|${rule.names.join(', ')}]%%`;
}

/** Whether text inside a comment, or anywhere else, looks like a tag. */
export function looksLikeTag(text: string): boolean {
  return TAG_START.test(text.trim()) || TAG_MENTION.test(text);
}

function tagOf(span: CommentSpan): PartTag | null {
  const content = span.content.trim();
  if (!looksLikeTag(content)) return null;
  const { start, end } = span;
  const malformed: PartTag = { kind: 'malformed', text: content.slice(0, 40), start, end };
  const match = span.opener === '%%' && span.closed ? TAG.exec(content) : null;
  if (!match) return malformed;
  const kind = (match[1] ?? '').toLowerCase();
  const names = match[2];
  if (kind === 'end') return names === undefined ? { kind: 'end', start, end } : malformed;
  if (kind === 'private') return names === undefined ? { kind: 'open', rule: { kind: 'private' }, start, end } : malformed;
  const list = (names ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  if (list.length === 0) return malformed;
  return { kind: 'open', rule: { kind: kind === 'only' ? 'only' : 'except', names: list }, start, end };
}

/** Every tag in `text`, in order, found by the same scan that removes comments. */
export function scanTags(text: string): PartTag[] {
  return scanComments(text).map(tagOf).filter((tag): tag is PartTag => tag !== null);
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
