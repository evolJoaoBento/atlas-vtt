/** The Atlas dashboard's "Join online session" tile opens the Join dialog, as the command does. */
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';

const { openJoinSessionModal } = vi.hoisted(() => ({ openJoinSessionModal: vi.fn() }));
vi.mock('../../../../src/app/online/obsidian/ui/JoinSessionModal', () => ({ openJoinSessionModal }));
vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/app/services/AssetService')>(),
  AssetService: { getInstance: () => ({ getCollections: async () => [], getAssets: async () => [] }) },
}));

import { DashboardView } from '../../../../src/app/dashboard-view';

describe('the dashboard join tile', () => {
  let view: DashboardView | null = null;
  afterEach(async () => {
    await act(async () => { await view?.onClose(); });
    view?.containerEl.remove();
    view = null;
  });

  it("opens the Join dialog from the dashboard, beside the other action tiles", async () => {
    const app = { workspace: { on: () => ({}), offref: () => {} } };
    view = new DashboardView({ app } as unknown as WorkspaceLeaf, {} as never);
    document.body.append(view.containerEl);
    await act(async () => { await view!.onOpen(); });
    const titles = [...view.containerEl.querySelectorAll('.action-card .action-title')].map((el) => el.textContent);
    expect(titles).toEqual(['Create Scene', 'Asset Manager', 'Join online session']);
    expect(screen.getByText("Paste a GM's link to play")).toBeTruthy();
    fireEvent.click(screen.getByText('Join online session'));
    expect(openJoinSessionModal).toHaveBeenCalledWith(app);
  });
});
