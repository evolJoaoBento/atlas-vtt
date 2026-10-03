import { describe, expect, it, vi } from 'vitest';
import { decorateSection } from '../../../../../src/app/online/sharing/display/readingView';

/** A rendered section as Obsidian hands it to a post-processor: a div holding the block's HTML. */
function rendered(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const NOTE = [
  'Intro paragraph.', //            0
  '', //                            1
  '%%[!only|Ana]%%', //             2
  'Secret para one.', //            3
  '', //                            4
  'Secret para two.', //            5
  '%%[!end]%%', //                  6
  '', //                            7
  'Mixed %%[!private]%%hidden **bold** bit%%[!end]%% text.', // 8
].join('\n');

const section = (lineStart: number, lineEnd: number): { text: string; lineStart: number; lineEnd: number } => ({ text: NOTE, lineStart, lineEnd });

describe('reading view: share tags applied to the rendered sections', () => {
  it('a section a part covers whole is highlighted as a block, the label before its text', () => {
    const el = rendered('<p>Secret para one.</p>');
    decorateSection(el, section(2, 3), 'inline-only');
    expect(el.classList).toContain('atlas-share-tag-block--only');
    const label = el.querySelector('p > .atlas-share-tag');
    expect(label?.textContent).toBe('Only Ana');
    expect(label?.className).toBe('atlas-share-tag atlas-share-tag--only');
  });

  it('a later section of the same part is highlighted without a second label', () => {
    const el = rendered('<p>Secret para two.</p>');
    decorateSection(el, section(5, 6), 'inline-only');
    expect(el.classList).toContain('atlas-share-tag-block--only');
    expect(el.querySelector('.atlas-share-tag')).toBeNull();
  });

  it('a section outside every part is left alone', () => {
    const el = rendered('<p>Intro paragraph.</p>');
    decorateSection(el, section(0, 0), 'inline-only');
    expect(el.outerHTML).toBe('<div data-atlas-share-tags="true"><p>Intro paragraph.</p></div>');
  });

  it('an inline part highlights exactly its text, across formatting, with the label before it', () => {
    const el = rendered('<p>Mixed hidden <strong>bold</strong> bit text.</p>');
    decorateSection(el, section(8, 8), 'inline-only');
    const spans = [...el.querySelectorAll('.atlas-share-tag-hl--private')];
    expect(spans.map((span) => span.textContent).join('|')).toBe('hidden |bold| bit');
    expect(el.classList).not.toContain('atlas-share-tag-block--private');
    expect(el.querySelector('p')?.firstChild?.textContent).toBe('Mixed ');
    expect(spans[0]?.previousElementSibling?.textContent).toBe('Private');
    expect(el.textContent).toBe('Mixed Privatehidden bold bit text.');
  });

  it('when the text cannot be found, the whole block is highlighted (never other text), logged at debug level', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const el = rendered('<p>Rendered differently.</p>');
    decorateSection(el, section(8, 8), 'inline-only');
    expect(el.classList).toContain('atlas-share-tag-block--private');
    expect(el.querySelector('.atlas-share-tag-hl')).toBeNull();
    expect(el.querySelector('.atlas-share-tag')?.textContent).toBe('Private');
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });

  it('a tag alone in its own section puts its label in the first section it covers', () => {
    const text = '%%[!private]%%\n\nPara\n\n%%[!end]%%\n\nAfter';
    const tagOnly = rendered('');
    decorateSection(tagOnly, { text, lineStart: 0, lineEnd: 0 }, 'inline-only');
    expect(tagOnly.innerHTML).toBe('');
    const para = rendered('<p>Para</p>');
    decorateSection(para, { text, lineStart: 2, lineEnd: 2 }, 'inline-only');
    expect(para.classList).toContain('atlas-share-tag-block--private');
    expect(para.querySelector('.atlas-share-tag')?.textContent).toBe('Private');
    const after = rendered('<p>After</p>');
    decorateSection(after, { text, lineStart: 6, lineEnd: 6 }, 'inline-only');
    expect(after.className).toBe('');
  });

  it('nested parts: the inner part is drawn inside the outer one', () => {
    const text = 'A %%[!only|Ana]%%one %%[!except|Ben]%%two%%[!end]%% three%%[!end]%% B';
    const el = rendered('<p>A one two three B</p>');
    decorateSection(el, { text, lineStart: 0, lineEnd: 0 }, 'inline-only');
    const inner = el.querySelector('.atlas-share-tag-hl--except');
    expect(inner?.textContent).toBe('two');
    expect(inner?.className).toContain('atlas-share-tag-hl--nested');
    expect(inner?.parentElement?.classList).toContain('atlas-share-tag-hl--only');
    expect([...el.querySelectorAll('.atlas-share-tag')].map((label) => label.textContent)).toEqual(['Only Ana', 'Except Ben']);
  });

  it('a repeated phrase: the occurrence the part covers is the one highlighted', () => {
    const text = 'same and %%[!private]%%same%%[!end]%%';
    const el = rendered('<p>same and same</p>');
    decorateSection(el, { text, lineStart: 0, lineEnd: 0 }, 'inline-only');
    expect(el.querySelector('p')?.innerHTML).toBe('same and <span class="atlas-share-tag atlas-share-tag--private">Private</span><span class="atlas-share-tag-hl atlas-share-tag-hl--private">same</span>');
  });

  it('runs once per rendered element', () => {
    const el = rendered('<p>Secret para one.</p>');
    decorateSection(el, section(2, 3), 'inline-only');
    decorateSection(el, section(2, 3), 'inline-only');
    expect(el.querySelectorAll('.atlas-share-tag')).toHaveLength(1);
  });
});
