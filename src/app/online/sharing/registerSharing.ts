/** Sharing between Obsidian clients: commands, and what each session teaches the people list. Task 3 adds sharing notes and maps; Tasks 4–6 add to it. */
import { TFile, type Plugin, type TAbstractFile } from 'obsidian';
import { joinedSessionStore } from '../obsidian/joinedSessionStore';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import { AssetService } from '../../services/AssetService';
import type { SettingsService } from '../../services/SettingsService';
import { obsidianCatalogueSources } from './model/catalogueSources';
import { SenderCatalogue } from './model/SenderCatalogue';
import type { ShareItems } from './model/ShareItems';
import type { PeopleBook } from './people/PeopleBook';
import { recordSessionPeople } from './people/sessionPeople';
import { openPeopleModal } from './people/ui/PeopleModal';
import { openShareWithModal } from './ui/ShareWithModal';

export interface SharingServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  items: ShareItems;
  settings: SettingsService;
}

export function registerSharing(plugin: Plugin, services: SharingServices): void {
  const { joins, people, items, settings } = services;
  plugin.addCommand({
    id: 'people', name: 'People…',
    callback: () => openPeopleModal(plugin.app, settings.getOnlineSettings().table?.id ?? null),
  });
  void items.ready();
  const catalogue = new SenderCatalogue(obsidianCatalogueSources(plugin.app, settings), items, people);
  const shareable = (file: TAbstractFile | null): file is TFile => file instanceof TFile && (file.extension === 'md' || file.extension === 'atlasmap');
  const share = (file: TFile): void => openShareWithModal(plugin.app, file, { people, catalogue, assets: AssetService.getInstance(plugin.app) });
  plugin.addCommand({
    id: 'share-with', name: 'Share with…',
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!shareable(file)) return false;
      if (!checking) share(file);
      return true;
    },
  });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (!shareable(file)) return;
    menu.addItem((item) => item.setTitle('Share with…').setIcon('share-2').onClick(() => share(file)));
  }));
  // Note item ids follow the vault, so a renamed note keeps its updates and no path is ever sent.
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => items.renamed(oldPath, file.path)));
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => items.deleted(file.path)));
  // A joined session with a checked table: record the GM and everyone with a person id, now and on every presence.
  const record = (): void => {
    const identity = joins.identity;
    const players = joinedSessionStore.getState().session?.players ?? [];
    if (identity) void people.ready().then(() => recordSessionPeople(people, identity, players));
  };
  plugin.register(() => people.flush());
  plugin.register(joins.onIdentity(record));
  plugin.register(joinedSessionStore.subscribe(record));
}
