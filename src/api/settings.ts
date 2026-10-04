import type { SettingsService } from '../app/services/SettingsService';
import type { ApiEvents } from './events';
import type { AtlasSettingKey, AtlasSettingsView, SettingsApi } from './types/settings';

/** The player window rules online players follow. A runtime export: `public.ts` carries types only, so extensions list these themselves. */
export const PLAYER_VIEW_RULE_KEYS = ['showGrid', 'showTokenNameplates', 'showWidgets', 'showInitiative'] as const;
const KEYS: readonly AtlasSettingKey[] = ['laserPointer', 'diceLook', 'diceDisplay', 'playerView'];

export function settingsView(service: SettingsService): AtlasSettingsView {
  const laser = service.getLaserPointerSettings();
  const look = service.getDiceLook();
  const player = service.getLocalPlayerViewSettings();
  return {
    laserPointer: { color: laser.color, size: laser.size },
    diceLook: { colour: look.colour, font: look.font },
    diceDisplay: service.getDiceDisplay(),
    playerView: {
      showGrid: player.showGrid === true,
      showTokenNameplates: player.showTokenNameplates === true,
      showWidgets: player.showWidgets === true,
      showInitiative: player.showInitiative === true,
    },
  };
}

export function settingsApi(service: SettingsService): SettingsApi {
  return Object.freeze({
    get: <K extends AtlasSettingKey>(key: K): AtlasSettingsView[K] => settingsView(service)[key],
  });
}

/** `settings-changed` per key whose value changed; returns the stop. */
export function watchSettings(service: SettingsService, events: ApiEvents): () => void {
  let previous = settingsView(service);
  return service.onChange(() => {
    const next = settingsView(service);
    const changed = KEYS.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
    previous = next;
    for (const key of changed) events.emit('settings-changed', key);
  });
}
