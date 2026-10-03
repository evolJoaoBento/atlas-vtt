/**
 * Share tags in reading view (and anything Obsidian renders with section info). Obsidian drops `%%` comments
 * before rendering, so the tags are read from the section's source (`getSectionInfo`) and applied to what was
 * rendered of it:
 * - a section a part covers whole gets the part's highlight on the block;
 * - a part covering only some of a section highlights that text, found by its plain characters
 *   (`renderedText.ts`); when it cannot be found the whole block is highlighted (logged at debug level),
 *   never some other text;
 * - the label goes before the first text the part covers, in whichever section that text is.
 */
import type { BlockContext } from '../model/codeContext';
import { scanMarkup } from '../model/privateTags';
import { occurrencesOf, plainOf, wrapPlain } from './renderedText';
import { tagDisplayOf, type TagDisplay, type TagHighlight, type TagLabel } from './tagDisplay';
import { BLOCK_CLASS, highlightClass, TAG_CLASS, tagLabelElement } from './tagElements';

/** What `MarkdownPostProcessorContext.getSectionInfo` gives: the note's whole source and the section's lines. */
export interface SectionSource {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface NoteModel {
  key: string;
  text: string;
  display: TagDisplay;
  /** Tags and comments: never rendered. */
  removed: Array<{ start: number; end: number }>;
  lineStarts: number[];
}

let cached: NoteModel | null = null;

function modelOf(text: string, blocks: BlockContext): NoteModel {
  const key = `${JSON.stringify(blocks)}\n${text}`;
  if (cached?.key === key) return cached;
  const { tags, comments } = scanMarkup(text, blocks);
  const lineStarts = [0];
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) lineStarts.push(at + 1);
  cached = { key, text, display: tagDisplayOf(text, blocks), removed: [...tags, ...comments].sort((a, b) => a.start - b.start), lineStarts };
  return cached;
}

/** `[from, to)` of the source without tags and comments. */
function shownSource(model: NoteModel, from: number, to: number): string {
  let out = '';
  let at = from;
  for (const range of model.removed) {
    if (range.end <= at || range.start >= to) continue;
    out += model.text.slice(at, Math.max(at, range.start));
    at = Math.max(at, range.end);
  }
  return out + model.text.slice(at, Math.max(at, to));
}

/** The first and last offsets in `[from, to)` that render as something (not whitespace, a tag or a comment). */
function shownBounds(model: NoteModel, from: number, to: number): { first: number; last: number } | null {
  const isShown = (offset: number): boolean => /\S/.test(model.text[offset] ?? '') && !model.removed.some((range) => offset >= range.start && offset < range.end);
  let first = from;
  while (first < to && !isShown(first)) first++;
  if (first >= to) return null;
  let last = to - 1;
  while (last > first && !isShown(last)) last--;
  return { first, last };
}

function highlightBlock(el: HTMLElement, highlight: TagHighlight): void {
  [...el.classList].filter((name) => name.startsWith(`${BLOCK_CLASS}--`)).forEach((name) => el.classList.remove(name));
  el.classList.add(BLOCK_CLASS, `${BLOCK_CLASS}--${highlight.tone}`, ...(highlight.depth > 0 ? [`${BLOCK_CLASS}--nested`] : []));
}

const firstTextElement = (el: HTMLElement): HTMLElement =>
  el.querySelector<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li, td, th') ?? el;

const PROCESSED = 'atlasShareTags';

/** Applies the share tags of `source` to `el`, the rendered section. `blocks` is the note's block context. */
export function decorateSection(el: HTMLElement, source: SectionSource, blocks: BlockContext): void {
  if (el.dataset[PROCESSED]) return;
  el.dataset[PROCESSED] = 'true';
  const model = modelOf(source.text, blocks);
  if (model.display.labels.length === 0) return;
  const sStart = model.lineStarts[source.lineStart] ?? model.text.length;
  const sEnd = (model.lineStarts[source.lineEnd + 1] ?? model.text.length + 1) - 1;
  const section = shownBounds(model, sStart, sEnd);
  if (!section) return;
  const pairs = model.display.labels
    .map((label) => ({ label, highlight: model.display.highlights.find((range) => range.from === label.to) }))
    .filter((pair): pair is { label: TagLabel; highlight: TagHighlight } => pair.highlight !== undefined);
  for (const { label, highlight } of pairs) {
    const part = shownBounds(model, highlight.from, highlight.to);
    const inSection = part ? shownBounds(model, Math.max(highlight.from, sStart), Math.min(highlight.to, sEnd)) : null;
    if (!part || !inSection) continue;
    const ownsLabel = part.first >= sStart && part.first < sEnd;
    const labelEl = (): HTMLElement => tagLabelElement(label.text, label.tone);
    if (highlight.from <= section.first && highlight.to > section.last) {
      highlightBlock(el, highlight);
      if (ownsLabel) firstTextElement(el).prepend(labelEl());
      continue;
    }
    const plain = plainOf(shownSource(model, inSection.first, inSection.last + 1));
    const occurrence = occurrencesOf(plainOf(shownSource(model, sStart, inSection.first)), plain);
    const wrapped = wrapPlain(el, plain, occurrence, TAG_CLASS, () => {
      return createSpan({ cls: highlightClass(highlight.tone, highlight.depth).split(' ') });
    });
    if (wrapped) {
      if (ownsLabel) wrapped[0]?.before(labelEl());
      continue;
    }
    console.debug('Atlas: could not find the text of a share tag in reading view; highlighting its block.', label.text);
    highlightBlock(el, highlight);
    if (ownsLabel) firstTextElement(el).prepend(labelEl());
  }
}
