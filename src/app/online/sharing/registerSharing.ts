/** Sharing between Obsidian clients: registers sending, receiving and the session hooks. */
import type { Plugin } from 'obsidian';
import type { SettingsService } from '../../services/SettingsService';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import type { OnlineSessionService } from '../OnlineSessionService';
import type { ShareItems } from './model/ShareItems';
import type { PeopleBook } from './people/PeopleBook';
import type { PulledItems } from './receive/PulledItems';
import { registerTagDisplay } from './display/registerTagDisplay';
import { sectionTrustFor } from './model/sectionTrust';
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
  // One record of what the metadata cache parsed, for everything that reads a note's sections.
  const sections = sectionTrustFor(plugin);
  const catalogue = registerShareCommands(plugin, { people, items, settings, sections });
  registerPartCommands(plugin, people);
  registerTagDisplay(plugin);
  registerAskToPull(plugin, items, people, sections);
  registerReceiving(plugin, pulled, people);
  registerSessionHooks(plugin, { joins, people, sessions, catalogue });
}
