import { Notice, type Setting, type TextComponent, type ToggleComponent } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { DEFAULT_ONLINE_SETTINGS, formatTurnServers, parseTurnServers } from '../online/onlineSettings';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Rows with several controls keep their text readable: the controls wrap below it (`settings-rows.scss`). */
const WRAP_CLASS = 'atlas-setting-wrap';
/** Controls too wide to sit beside the text take their own full-width row under it. */
const BELOW_CLASS = 'atlas-setting-wrap--below';

/** `newTableKey` asks for and makes a new table key (`confirmNewTableKey`); without it the row is left out. */
export function onlineSettingsSection(settings: SettingsService, newTableKey?: () => void): AtlasSettingSection {
  const signaling = (): ReturnType<SettingsService['getOnlineSettings']>['signaling'] => settings.getOnlineSettings().signaling;
  const setSignaling = (partial: Partial<ReturnType<typeof signaling>>): void =>
    settings.setOnlineSettings({ signaling: { ...signaling(), ...partial } });
  /** The own server's fields stay in place, shown disabled, while the PeerJS cloud is chosen. */
  const ownServerFields = (setting: Setting, fields: Array<TextComponent | ToggleComponent>): () => void => {
    const sync = (): void => {
      const off = signaling().mode !== 'custom';
      setting.settingEl.toggleClass('is-disabled', off);
      for (const field of fields) field.setDisabled(off);
    };
    sync();
    return settings.onChange(sync);
  };

  return {
    heading: t('online.settings.heading'),
    rows: [
      {
        name: t('online.settings.signaling'),
        desc: t('online.settings.signalingDesc'),
        aliases: ['peerjs', 'online', 'multiplayer', 'remote'],
        render: (setting) => {
          setting.addDropdown((dropdown) => dropdown
            .addOption('cloud', t('online.settings.signalingCloud'))
            .addOption('custom', t('online.settings.signalingCustom'))
            .setValue(signaling().mode)
            .onChange((value) => setSignaling({ mode: value === 'custom' ? 'custom' : 'cloud' })));
        },
      },
      {
        name: t('online.settings.ownServer'),
        desc: t('online.settings.ownServerDesc'),
        render: (setting) => {
          const host = (text: TextComponent): TextComponent => text
            .setPlaceholder('peer.example.org')
            .setValue(signaling().host)
            .onChange((value) => setSignaling({ host: value.trim() }));
          const port = (text: TextComponent): TextComponent => text
            .setPlaceholder('443')
            .setValue(String(signaling().port))
            .onChange((value) => {
              const number = Number(value);
              if (Number.isInteger(number) && number >= 1 && number <= 65535) setSignaling({ port: number });
            });
          const path = (text: TextComponent): TextComponent => text
            .setPlaceholder('/')
            .setValue(signaling().path)
            .onChange((value) => setSignaling({ path: value.trim() || '/' }));
          const fields: TextComponent[] = [];
          setting.setClass(WRAP_CLASS).setClass(BELOW_CLASS);
          for (const [label, build] of [[t('online.settings.host'), host], [t('online.settings.port'), port], [t('online.settings.path'), path]] as const) {
            setting.addText((text) => {
              fields.push(build(text));
              text.inputEl.setAttribute('aria-label', label);
              if (build === host) text.inputEl.addClass('atlas-setting-wrap__wide');
            });
          }
          return ownServerFields(setting, fields);
        },
      },
      {
        name: t('online.settings.keyAndTls'),
        desc: t('online.settings.keyAndTlsDesc'),
        render: (setting) => {
          const fields: Array<TextComponent | ToggleComponent> = [];
          setting
            .setClass(WRAP_CLASS)
            .addText((text) => {
              fields.push(text
                .setPlaceholder(DEFAULT_ONLINE_SETTINGS.signaling.key)
                .setValue(signaling().key)
                .onChange((key) => setSignaling({ key: key.trim() || 'peerjs' })));
              text.inputEl.setAttribute('aria-label', t('online.settings.key'));
            })
            .addToggle((toggle) => {
              fields.push(toggle.setValue(signaling().secure).onChange((secure) => setSignaling({ secure })));
              toggle.toggleEl.setAttribute('aria-label', t('online.settings.useTls'));
            });
          return ownServerFields(setting, fields);
        },
      },
      {
        name: t('online.settings.turn'),
        desc: t('online.settings.turnDesc'),
        aliases: ['turn', 'relay', 'nat', 'firewall'],
        render: (setting) => {
          setting.setClass(WRAP_CLASS).addTextArea((area) => area
            .setPlaceholder(formatTurnServers([{ urls: 'turn:relay.example.org:3478', username: 'user', credential: 'password' }]))
            .setValue(formatTurnServers(settings.getOnlineSettings().turnServers))
            .onChange((text) => settings.setOnlineSettings({ turnServers: parseTurnServers(text) })));
        },
      },
      {
        name: t('online.settings.playerPage'),
        desc: t('online.settings.playerPageDesc'),
        render: (setting) => {
          setting.setClass(WRAP_CLASS).addText((text) => {
            text
              .setValue(settings.getOnlineSettings().playerPageUrl)
              .onChange((url) => { if (isHttpUrl(url.trim())) settings.setOnlineSettings({ playerPageUrl: url.trim() }); });
            // Once, when the field is left with a changed value, not on every keystroke.
            text.inputEl.addEventListener('change', () => {
              const url = text.inputEl.value.trim();
              if (url && !isHttpUrl(url)) new Notice(t('online.settings.playerPageInvalid'));
            });
          });
        },
      },
      {
        name: t('online.settings.sharedProperties'),
        desc: t('online.settings.sharedPropertiesDesc'),
        aliases: ['sharing', 'frontmatter', 'atlas-share'],
        render: (setting) => {
          setting.setClass(WRAP_CLASS).addText((text) => text
            .setPlaceholder('Tags, aliases')
            .setValue(settings.getOnlineSettings().shareableProperties.join(', '))
            .onChange((value) => settings.setOnlineSettings({
              shareableProperties: value.split(',').map((key) => key.trim()).filter((key) => key && key !== 'atlas-share'),
            })));
        },
      },
      {
        name: t('online.settings.keepImages'),
        desc: t('online.settings.keepImagesDesc'),
        aliases: ['cache', 'images', 'join', 'online'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(settings.getOnlineSettings().keepImages)
            .onChange((keepImages) => settings.setOnlineSettings({ keepImages })));
        },
      },
      {
        name: t('online.settings.logEvents'),
        desc: t('online.settings.logEventsDesc'),
        aliases: ['debug', 'diagnostics', 'console', 'online'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(settings.getOnlineSettings().logEvents)
            .onChange((logEvents) => settings.setOnlineSettings({ logEvents })));
        },
      },
      ...(newTableKey ? [{
        name: t('online.tableKey.command'),
        desc: t('online.tableKey.settingDesc'),
        aliases: ['table key', 'reset', 'leaked', 'backup', 'online'],
        render: (setting: Setting): void => {
          setting.addButton((button) => {
            button.setButtonText(t('online.tableKey.button')).onClick(newTableKey);
            // `setDestructive` needs Obsidian 1.13 and `setWarning` is deprecated: the class both set.
            button.buttonEl.addClass('mod-warning');
          });
        },
      }] : []),
    ],
  };
}
