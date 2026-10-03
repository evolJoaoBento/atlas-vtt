/** Sharing between Obsidian clients: registers sending, receiving and the session hooks. */
import type { Plugin } from 'obsidian';
import type { SettingsService } from '../../services/SettingsService';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import type { OnlineSessionService } from '../OnlineSessionService';
import type { ShareItems } from './model/ShareItems';
import type { PeopleBook } from './people/PeopleBook';
import type { PulledItems } from './receive/PulledItems';
import { registerTagDisplay } from './display/registerTagDisplay';
import { registerPartCommands } from './parts/registerPartCommands';
import { registerAskToPull } from './registerAskToPull';
import { registerReceiving } from './registerReceiving';
import { registerSessionHooks } from './registerSessionHooks';
import { registerShareCommands } from './registerShareCommands';

export interface SharingServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  items: ShareItems;
  pulled: PulledItems;
  settings: SettingsService;
  sessions: OnlineSessionService;
}

export function registerSharing(plugin: Plugin, services: SharingServices): void {
  const { joins, people, items, pulled, settings, sessions } = services;
  const catalogue = registerShareCommands(plugin, { people, items, settings });
  registerPartCommands(plugin, people);
  registerTagDisplay(plugin);
  registerAskToPull(plugin, items, people);
  registerReceiving(plugin, pulled, people);
  registerSessionHooks(plugin, { joins, people, sessions, catalogue });
}
