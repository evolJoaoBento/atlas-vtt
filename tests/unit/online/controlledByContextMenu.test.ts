import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenControl } from '../../../src/app/online/control/TokenControl';
import { onlineSessionStore, resetOnlineSessionStore } from '../../../src/app/online/onlineSessionStore';
import { CONTROLLED_BY_LABEL } from '../../../src/app/online/ui/controlledByMenu';
import { InteractionController } from '../../../src/app/pixi/token-renderer/InteractionController';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
  closeContextMenuGlobal: vi.fn(),
}));

/** Right-clicks `tokenId` and returns the labels of the entries the menu opened with. */
function rightClickLabels(tokenId: string, isPlayerView = false): string[] {
  const store = {
    getState: () => ({
      activeTool: 'select',
      selectedIds: [],
      initiative: { entries: [] },
      objects: {
        tokens: {
          hero: { id: 'hero', kind: 'character', x: 0, y: 0, imagePath: 'art/hero.png', name: 'Hero' },
          wolf: { id: 'wolf', kind: 'monster', x: 0, y: 0, imagePath: 'art/wolf.png' },
        },
      },
    }),
  } as never;
  const controller = new InteractionController({} as never, store, {} as never, new EventEmitter(), {} as never, isPlayerView);
  controller.handleViewportTokenPointerDown(tokenId, { button: 2, stopPropagation: vi.fn(), clientX: 0, clientY: 0 } as never);
  const calls = vi.mocked(openContextMenuGlobal).mock.calls;
  const entries: ContextMenuEntry[] = calls.at(-1)?.[0] ?? [];
  return entries.flatMap((entry) => ('label' in entry ? [entry.label] : []));
}

describe('"Controlled by" in the token context menu', () => {
  beforeEach(() => { vi.mocked(openContextMenuGlobal).mockClear(); });
  afterEach(() => { resetOnlineSessionStore(); });

  it('shows for a character token in the GM view while hosting', () => {
    onlineSessionStore.setState({ status: 'hosting', tokenControl: new TokenControl(), players: [] });
    expect(rightClickLabels('hero')).toContain(CONTROLLED_BY_LABEL);
  });

  it('does not show for a token that is not a character', () => {
    onlineSessionStore.setState({ status: 'hosting', tokenControl: new TokenControl(), players: [] });
    const labels = rightClickLabels('wolf');
    expect(vi.mocked(openContextMenuGlobal)).toHaveBeenCalledTimes(1);
    expect(labels).not.toContain(CONTROLLED_BY_LABEL);
  });

  it('does not show without a hosted session', () => {
    const labels = rightClickLabels('hero');
    expect(vi.mocked(openContextMenuGlobal)).toHaveBeenCalledTimes(1);
    expect(labels).not.toContain(CONTROLLED_BY_LABEL);
  });

  it('does not show in a player view, which opens no menu at all', () => {
    onlineSessionStore.setState({ status: 'hosting', tokenControl: new TokenControl(), players: [] });
    rightClickLabels('hero', true);
    expect(vi.mocked(openContextMenuGlobal)).not.toHaveBeenCalled();
  });
});
