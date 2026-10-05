import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENSION_PRIORITY, extensionToolbarItem } from '../../src/app/extensions/extensionToolbarItems';
import type { ToolbarItem, ViewContext } from '../../src/api/types/ui';

const ctx: ViewContext = { viewId: 'v1', kind: 'map', isPlayerView: false };
const entry = (item: Partial<ToolbarItem> = {}): Parameters<typeof extensionToolbarItem>[0] => ({
  owner: 'ext', item: { id: 'x', icon: 'network', label: 'Online session', onClick: vi.fn(), ...item },
});

describe('extensionToolbarItem', () => {
  it('has priority 50 unless the item gives one, and a namespaced id', () => {
    expect(DEFAULT_EXTENSION_PRIORITY).toBe(50);
    expect(extensionToolbarItem(entry(), ctx)).toMatchObject({ id: 'ext:ext:x', priority: 50 });
    expect(extensionToolbarItem(entry({ priority: 72 }), ctx).priority).toBe(72);
  });

  it('is pinned exactly while it is active, and a throwing isActive counts as inactive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(extensionToolbarItem(entry(), ctx).pinned).toBe(false);
    expect(extensionToolbarItem(entry({ isActive: () => true }), ctx)).toMatchObject({ pinned: true, menuEntry: { isActive: true } });
    expect(extensionToolbarItem(entry({ isActive: () => { throw new Error('boom'); } }), ctx).pinned).toBe(false);
    vi.restoreAllMocks();
  });

  it('gives a More tools entry with the label, shortcut and a guarded onSelect that passes the context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClick = vi.fn();
    const { menuEntry } = extensionToolbarItem(entry({ onClick, shortcut: 'Ctrl+O' }), ctx);
    expect(menuEntry).toMatchObject({ label: 'Online session', shortcut: 'Ctrl+O', isActive: false });
    menuEntry.onSelect();
    expect(onClick).toHaveBeenCalledWith(ctx);
    const throwing = extensionToolbarItem(entry({ onClick: () => { throw new Error('boom'); } }), ctx).menuEntry;
    expect(() => throwing.onSelect()).not.toThrow();
    vi.restoreAllMocks();
  });
});
