import type { App } from 'obsidian';
import type { NavigationInputMode } from './atlasSettings';

/**
 * Facts about this device, which Atlas keeps in the vault's local storage: they never sync,
 * so a laptop with a trackpad and a desktop with a mouse each keep their own.
 */
export const INPUT_MODE_STORAGE_KEY = 'atlas-vtt:input-mode';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

export const isInputMode = (value: unknown): value is NavigationInputMode => value === 'mouse' || value === 'trackpad';

/** The input mode chosen on this device, or null when none was. */
export function loadInputMode(storage: DeviceStorage): NavigationInputMode | null {
  try {
    const stored: unknown = storage.loadLocalStorage(INPUT_MODE_STORAGE_KEY);
    return isInputMode(stored) ? stored : null;
  } catch (error) {
    console.error('[Atlas] Could not read the input mode of this device', error);
    return null;
  }
}

export function saveInputMode(storage: DeviceStorage, mode: NavigationInputMode): void {
  try {
    storage.saveLocalStorage(INPUT_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.error('[Atlas] Could not save the input mode of this device', error);
  }
}
