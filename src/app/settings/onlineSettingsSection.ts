import { Notice, type Setting, type TextComponent, type ToggleComponent } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { DEFAULT_ONLINE_SETTINGS, formatTurnServers, parseTurnServers } from '../online/onlineSettings';
import type { AtlasSettingSection } from './settingSections';

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

export function onlineSettingsSection(settings: SettingsService): AtlasSettingSection {
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
    heading: 'Online play',
    rows: [
      {
        name: 'Signaling server',
        desc: 'Helps players find your session; no game data goes through it. The free PeerJS cloud works out of the box. Only used while a session is running.',
        aliases: ['peerjs', 'online', 'multiplayer', 'remote'],
        render: (setting) => {
          setting.addDropdown((dropdown) => dropdown
            .addOption('cloud', 'PeerJS cloud (free)')
            .addOption('custom', 'My own server')
            .setValue(signaling().mode)
            .onChange((value) => setSignaling({ mode: value === 'custom' ? 'custom' : 'cloud' })));
        },
      },
      {
        name: 'Own server address',
        desc: 'Host, port and path of your peerjs-server, used when "My own server" is chosen.',
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
          for (const [label, build] of [['Host', host], ['Port', port], ['Path', path]] as const) {
            setting.addText((text) => {
              fields.push(build(text));
              text.inputEl.setAttribute('aria-label', label);
              if (label === 'Host') text.inputEl.addClass('atlas-setting-wrap__wide');
            });
          }
          return ownServerFields(setting, fields);
        },
      },
      {
        name: 'Own server key and TLS',
        desc: 'The key your peerjs-server expects, and whether it uses TLS (https).',
        render: (setting) => {
          const fields: Array<TextComponent | ToggleComponent> = [];
          setting
            .setClass(WRAP_CLASS)
            .addText((text) => {
              fields.push(text
                .setPlaceholder(DEFAULT_ONLINE_SETTINGS.signaling.key)
                .setValue(signaling().key)
                .onChange((key) => setSignaling({ key: key.trim() || 'peerjs' })));
              text.inputEl.setAttribute('aria-label', 'Key');
            })
            .addToggle((toggle) => {
              fields.push(toggle.setValue(signaling().secure).onChange((secure) => setSignaling({ secure })));
              toggle.toggleEl.setAttribute('aria-label', 'Use TLS');
            });
          return ownServerFields(setting, fields);
        },
      },
      {
        name: 'Relay (TURN) servers',
        desc: 'For players whose network blocks direct connections. One per line: turn:host:port username password. Players receive these in the join link.',
        aliases: ['turn', 'relay', 'nat', 'firewall'],
        render: (setting) => {
          setting.setClass(WRAP_CLASS).addTextArea((area) => area
            .setPlaceholder(formatTurnServers([{ urls: 'turn:relay.example.org:3478', username: 'user', credential: 'password' }]))
            .setValue(formatTurnServers(settings.getOnlineSettings().turnServers))
            .onChange((text) => settings.setOnlineSettings({ turnServers: parseTurnServers(text) })));
        },
      },
      {
        name: 'Player page',
        desc: 'The web page players open to join. Change it if you publish the page yourself.',
        render: (setting) => {
          setting.setClass(WRAP_CLASS).addText((text) => {
            text
              .setValue(settings.getOnlineSettings().playerPageUrl)
              .onChange((url) => { if (isHttpUrl(url.trim())) settings.setOnlineSettings({ playerPageUrl: url.trim() }); });
            // Once, when the field is left with a changed value, not on every keystroke.
            text.inputEl.addEventListener('change', () => {
              const url = text.inputEl.value.trim();
              if (url && !isHttpUrl(url)) new Notice("That isn't a web address; the player page was not changed.");
            });
          });
        },
      },
      {
        name: 'Shared note properties',
        desc: 'Properties that notes you share keep, separated by commas. All other properties are removed before sending; atlas-share always is.',
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
        name: 'Keep online images on this device',
        desc: 'When you join a session from Atlas, keep its images outside your vault so the next session loads faster. Switching it off deletes them.',
        aliases: ['cache', 'images', 'join', 'online'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(settings.getOnlineSettings().keepImages)
            .onChange((keepImages) => settings.setOnlineSettings({ keepImages })));
        },
      },
      {
        name: 'Log online play events',
        desc: 'For troubleshooting: writes what Atlas sends to online players, and every change of the presented scene, to the developer console.',
        aliases: ['debug', 'diagnostics', 'console', 'online'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(settings.getOnlineSettings().logEvents)
            .onChange((logEvents) => settings.setOnlineSettings({ logEvents })));
        },
      },
    ],
  };
}
