import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/app/i18n';
import { laserColorHint, laserColorSwatches, mapIconLabels, tokenResetLabel, tokenSizeOptions } from '../../src/app/i18n/sharedTexts';
import { TOKEN_SIZE_OPTIONS } from '../../src/app/pixi/token-renderer/tokenSizing';
import { LASER_COLOR_HINT, LASER_COLOR_SWATCHES } from '../../src/app/tools/laserPointerSettings';
import { MAP_ICON_LABELS } from '../../src/app/pixi/mapIcons';
import { resetLabel } from '../../src/app/resources/resourceValues';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';

const definition = (key: string): ResourceDefinition => ({ key } as ResourceDefinition);

describe("texts of the shared packages, in Atlas's language", () => {
  afterEach(() => setLocale('en'));

  it('read in English exactly as the shared modules write them, so a player page and Atlas never drift apart', () => {
    setLocale('en');
    expect(tokenSizeOptions()).toEqual(TOKEN_SIZE_OPTIONS);
    expect(laserColorSwatches()).toEqual(LASER_COLOR_SWATCHES.map(({ value, label }) => ({ value, label })));
    expect(laserColorHint()).toBe(LASER_COLOR_HINT);
    expect(mapIconLabels()).toEqual(MAP_ICON_LABELS);
    for (const definitions of [[definition('hp')], [definition('hp'), definition('str')]]) {
      expect(tokenResetLabel(definitions)).toBe(resetLabel(definitions));
    }
  });

  it('follow the active language in Atlas, while the shared modules keep English', () => {
    setLocale('ru');
    expect(tokenSizeOptions().map(({ label }) => label)).not.toEqual(TOKEN_SIZE_OPTIONS.map(({ label }) => label));
    expect(Object.keys(mapIconLabels())).toEqual(Object.keys(MAP_ICON_LABELS));
    expect(LASER_COLOR_SWATCHES[0].label).toBe('Red');
  });
});
