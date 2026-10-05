/** Sending: the People and Share with… commands, the file menu, and note item ids that follow the vault. */
import { TFile, type Plugin, type TAbstractFile } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import type { SettingsService } from '../../services/SettingsService';
import { followVaultChange, type VaultChange } from './model/mapShareRenames';
import { obsidianCatalogueSources } from './model/catalogueSources';
import { SenderCatalogue } from './model/SenderCatalogue';
import type { SectionTrust } from './model/sectionTrust';
import type { ShareItems } from './model/ShareItems';
import type { PeopleBook } from './people/PeopleBook';
import { GM_PERSON_ID } from './people/peopleTypes';
import { shareSessionStore } from './shareSessionStore';
import { openPeopleModal } from './people/ui/PeopleModal';
import { openShareWithModal } from './ui/ShareWithModal';
import { t } from '../../i18n';
import { obsidianLocalStore } from './identity/deviceKeys';
import { tableKeyStore } from './identity/tableKey';

export interface ShareCommandServices {
  people: PeopleBook;
  items: ShareItems;
  settings: SettingsService;
  /** What the metadata cache parsed, so a note's sections are used only for the text they came from. */
  sections: SectionTrust;
}

/** Notes and maps are what can be shared. */
export const shareable = (file: TAbstractFile | null): file is TFile =>
  file instanceof TFile && (file.extension === 'md' || file.extension === 'atlasmap');

/** Registers the sending commands; returns the catalogue of what this Atlas shares, which sessions answer from. */
export function registerShareCommands(plugin: Plugin, { people, items, settings, sections }: ShareCommandServices): SenderCatalogue {
  // This device's table (its key stays on the device): the GM is the person of their own table.
  const tableKeys = tableKeyStore(obsidianLocalStore(plugin.app));
  plugin.addCommand({
    id: 'people', name: t('share.command.people'),
    callback: () => openPeopleModal(plugin.app, tableKeys.get()?.id ?? null),
  });
  void items.ready();
  const catalogue = new SenderCatalogue(obsidianCatalogueSources(plugin.app, settings, sections), items, people);
  const selfAt = (tableId: string): string | undefined => {
    if (tableKeys.get()?.id === tableId) return GM_PERSON_ID;
    const session = shareSessionStore.getState().session;
    return session?.tableId === tableId ? session.self : undefined;
  };
  const share = (file: TFile): void => openShareWithModal(plugin.app, file, { people, catalogue, assets: AssetService.getInstance(plugin.app), selfAt, sections });
  plugin.addCommand({
    id: 'share-with', name: t('share.command.shareWith'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!shareable(file)) return false;
      if (!checking) share(file);
      return true;
    },
  });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (!shareable(file)) return;
    menu.addItem((item) => item.setTitle(t('share.command.shareWith')).setIcon('share-2').onClick(() => share(file)));
  }));
  // Note item ids and ticked map notes follow the vault, so a renamed note keeps its updates and its place on a map, and no path is ever sent.
  const assets = AssetService.getInstance(plugin.app);
  let following: Promise<void> = Promise.resolve();
  const follow = (change: VaultChange): void => {
    following = following.then(() => followVaultChange(assets, change)).catch((error: unknown) => console.error('Atlas: could not update a map share after a vault change', error));
  };
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
    items.renamed(oldPath, file.path);
    follow({ rename: [oldPath, file.path] });
  }));
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => {
    items.deleted(file.path);
    follow({ removed: file.path });
  }));
  return catalogue;
}
