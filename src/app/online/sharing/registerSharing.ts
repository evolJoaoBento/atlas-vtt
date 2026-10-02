/** Sharing between Obsidian clients: commands, and what each session teaches the people list. Tasks 3–6 add to it. */
import type { Plugin } from 'obsidian';
import { joinedSessionStore } from '../obsidian/joinedSessionStore';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import type { SettingsService } from '../../services/SettingsService';
import type { PeopleBook } from './people/PeopleBook';
import { recordSessionPeople } from './people/sessionPeople';
import { openPeopleModal } from './people/ui/PeopleModal';

export interface SharingServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  settings: SettingsService;
}

export function registerSharing(plugin: Plugin, services: SharingServices): void {
  const { joins, people, settings } = services;
  plugin.addCommand({
    id: 'people', name: 'People…',
    callback: () => openPeopleModal(plugin.app, settings.getOnlineSettings().table?.id ?? null),
  });
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
