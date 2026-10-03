import { render } from '@testing-library/react';
import { ChevronDown, Circle, Dices, Ellipsis, Flashlight, Hand, Ruler, Triangle, X } from 'lucide-react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { dieIconUrl, TOOL_ICON_MARKUP, toolIconUrl, type ToolIconName } from '../../../src/app/online/page/toolIcons';

type Shape = [tag: string, attributes: Record<string, string>, text: string];

function shapesOf(svg: Element | null): Shape[] {
  return [...(svg?.children ?? [])].map((child) => [
    child.tagName.toLowerCase(),
    Object.fromEntries([...child.attributes].map((attribute) => [attribute.name, attribute.value])),
    child.textContent ?? '',
  ]);
}
const rendered = (element: React.ReactElement): Shape[] => shapesOf(render(element).container.querySelector('svg'));
function parsed(markup: string): Shape[] {
  const host = document.createElement('div');
  host.innerHTML = `<svg>${markup}</svg>`;
  return shapesOf(host.querySelector('svg'));
}

describe('the join page icons', () => {
  it("are the Lucide icons of Atlas's toolbar", () => {
    const icons: Record<ToolIconName, React.ComponentType> = {
      hand: Hand, ruler: Ruler, circle: Circle, triangle: Triangle, flashlight: Flashlight, dices: Dices, ellipsis: Ellipsis,
      'chevron-down': ChevronDown, x: X,
    };
    for (const [name, Icon] of Object.entries(icons)) {
      expect(parsed(TOOL_ICON_MARKUP[name as ToolIconName]), name).toEqual(rendered(<Icon />));
    }
  });

  it('become CSS mask images of a 24 px glyph', () => {
    expect(toolIconUrl('hand')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(decodeURIComponent(toolIconUrl('hand'))).toContain('stroke-linecap="round"');
    expect(decodeURIComponent(dieIconUrl('d20'))).toContain('viewBox="0 0 24 24"');
  });
});
