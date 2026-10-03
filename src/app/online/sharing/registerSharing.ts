/** Sharing between Obsidian clients: commands, and what each session teaches the people list. Task 3 adds sharing notes and maps; Tasks 4–6 add to it. */
import { TFile, type Plugin, type TAbstractFile } from 'obsidian';
import { joinedSessionStore } from '../obsidian/joinedSessionStore';
import { onlineSessionStore } from '../onlineSessionStore';
import type { OnlineSessionService } from '../OnlineSessionService';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import { AssetService } from '../../services/AssetService';
import type { SettingsService } from '../../services/SettingsService';
import { obsidianCatalogueSources } from './model/catalogueSources';
import { SenderCatalogue } from './model/SenderCatalogue';
import type { ShareItems } from './model/ShareItems';
import type { PeopleBook } from './people/PeopleBook';
import { GM_PERSON_ID } from './people/peopleTypes';
import { recordSessionPeople } from './people/sessionPeople';
import { openPeopleModal } from './people/ui/PeopleModal';
import { addPush, shareSessionStore } from './shareSessionStore';
import { GmShareHost } from './transport/GmShareHost';
import { PlayerShareLink } from './transport/PlayerShareLink';
import type { PushRequestBody } from './transport/ShareNode';
import { openShareWithModal } from './ui/ShareWithModal';

export interface SharingServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  items: ShareItems;
  settings: SettingsService;
  sessions: OnlineSessionService;
}

export function registerSharing(plugin: Plugin, services: SharingServices): void {
  const { joins, people, items, settings, sessions } = services;
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
  registerTransport(plugin, { joins, people, sessions, catalogue });
  plugin.register(() => people.flush());
  plugin.register(joins.onIdentity(record));
  plugin.register(joinedSessionStore.subscribe(record));
}

interface TransportServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  sessions: OnlineSessionService;
  catalogue: SenderCatalogue;
}

/** Hosting and joining: each session with a checked table gets a share node, shown to the rest of the UI through `shareSessionStore`. */
function registerTransport(plugin: Plugin, { joins, people, sessions, catalogue }: TransportServices): void {
  const nameOf = (tableId: string, personId: string, fallback: string): string => people.get(tableId, personId)?.name ?? fallback;
  const onPush = (from: string, push: PushRequestBody): void => addPush({ from, ...push, at: Date.now() });
  const reset = (): void => shareSessionStore.setState({ session: null, people: [], pushes: [] });

  sessions.useSharingHooks({
    started: ({ session, table }) => {
      const host = new GmShareHost({ session, tableId: table.id, catalogue, onPush });
      host.start();
      const present = (): void => shareSessionStore.setState({
        people: host.people().map((person) => ({ personId: person.personId, name: nameOf(table.id, person.personId, person.name) })),
      });
      shareSessionStore.setState({ session: { role: 'gm', tableId: table.id, self: GM_PERSON_ID, node: host.node }, pushes: [] });
      present();
      const stopPresent = onlineSessionStore.subscribe(present);
      return () => {
        stopPresent();
        host.stop();
        reset();
      };
    },
  });
  plugin.register(() => sessions.useSharingHooks(null));

  const link = new PlayerShareLink({ catalogue, onPush });
  joins.useShare(link);
  plugin.register(() => joins.useShare(null));
  const presentForPlayer = (): void => {
    const identity = joins.identity;
    if (!identity) return;
    const others = (joinedSessionStore.getState().session?.players ?? [])
      .filter((player) => player.personId && player.personId !== identity.personId)
      .map((player) => ({ personId: player.personId!, name: nameOf(identity.tableId, player.personId!, player.name) }));
    shareSessionStore.setState({ people: [{ personId: GM_PERSON_ID, name: nameOf(identity.tableId, GM_PERSON_ID, identity.gmName) }, ...others] });
  };
  plugin.register(joins.onIdentity((identity) => {
    if (!identity) {
      link.deactivate();
      reset();
      return;
    }
    const node = link.activate(identity);
    shareSessionStore.setState({ session: { role: 'player', tableId: identity.tableId, self: identity.personId, node }, pushes: [] });
    presentForPlayer();
  }));
  plugin.register(joinedSessionStore.subscribe(presentForPlayer));
}
