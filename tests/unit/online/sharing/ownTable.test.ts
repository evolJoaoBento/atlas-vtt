import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { TABLE_KEY_STORAGE } from '../../../../src/app/online/sharing/identity/tableKey';
import { GM_PERSON_ID } from '../../../../src/app/online/sharing/people/peopleTypes';
import { shareSessionStore } from '../../../../src/app/online/sharing/shareSessionStore';

const peopleModal = vi.hoisted(() => vi.fn());
const shareWithModal = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/app/online/sharing/people/ui/PeopleModal', () => ({ openPeopleModal: peopleModal }));
vi.mock('../../../../src/app/online/sharing/ui/ShareWithModal', () => ({ openShareWithModal: shareWithModal }));
vi.mock('../../../../src/app/online/sharing/model/catalogueSources', () => ({ obsidianCatalogueSources: () => ({}) }));
vi.mock('../../../../src/app/online/sharing/model/SenderCatalogue', () => ({ SenderCatalogue: class {} }));
vi.mock('../../../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({}) } }));

import { registerShareCommands } from '../../../../src/app/online/sharing/registerShareCommands';

const OWN = 'O'.repeat(43);
const STALE = 'S'.repeat(43);

interface Command { id: string; callback?: () => void; checkCallback?: (checking: boolean) => boolean }

/**
 * The GM's Atlas: its table key in local storage (where it lives since 0.6), and settings that still answer
 * with another table, as the settings field read before did. A test reading the id from the settings fails.
 */
function gmAtlas() {
  const local = new Map<string, unknown>([[TABLE_KEY_STORAGE, { id: OWN, publicKey: 'BPub', privateKey: { kty: 'EC', crv: 'P-256', d: 'd' } }]]);
  const note = new TFile('Lore/Coin.md');
  const commands: Command[] = [];
  const app = {
    loadLocalStorage: (key: string) => local.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { local.set(key, value); },
    workspace: { getActiveFile: () => note, on: () => ({}) },
    vault: { on: () => ({}) },
  };
  const plugin = { app, addCommand: (command: Command) => { commands.push(command); return command; }, registerEvent: () => {} };
  const settings = { getOnlineSettings: () => ({ table: { id: STALE } }) };
  const items = { ready: async () => {}, renamed: () => {}, deleted: () => {} };
  registerShareCommands(plugin as never, { people: {} as never, items: items as never, settings: settings as never, sections: {} as never });
  const run = (id: string): void => {
    const command = commands.find((candidate) => candidate.id === id)!;
    if (command.callback) command.callback();
    else command.checkCallback!(false);
  };
  return { run };
}

beforeEach(() => {
  peopleModal.mockReset();
  shareWithModal.mockReset();
  shareSessionStore.setState({ session: null });
});

describe("the GM's own table, read from this device", () => {
  it('opens People… with the table this device hosts', () => {
    gmAtlas().run('people');
    expect(peopleModal).toHaveBeenCalledWith(expect.anything(), OWN);
  });

  it('lets Share with… know the GM as the person of their own table, and of no other', () => {
    gmAtlas().run('share-with');
    const { selfAt } = shareWithModal.mock.calls[0]![2] as { selfAt: (tableId: string) => string | undefined };
    expect(selfAt(OWN)).toBe(GM_PERSON_ID);
    expect(selfAt(STALE)).toBeUndefined();
  });
});
