import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendGivenThrow } from '../../src/app/dice3d/givenThrows';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DICE_ROLLED_EVENT, type DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no WebGL; these cases are about which rolls are thrown, not about the device.
const { webgl } = vi.hoisted(() => ({ webgl: { on: true } }));
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => webgl.on,
}));

const roll = (id: string, overrides: Partial<DiceRollResult> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null, rolledBy: 'Anna',
  ...overrides,
});

/** The GM's dice display in a map view whose store is `store`. */
function setup(store: object = {}): ReturnType<typeof render> & { store: object } {
  const { app } = createInMemoryApp({ files: {} });
  new SettingsService(app).setDiceDisplay('full');
  const view = { viewId: 'v1', atlasStore: store, containerEl: { doc: document, win: window } };
  const rendered = render(
    <AtlasUIContext.Provider value={{ app, view: view as never, pixiApp: null, renderer: null }}>
      <DiceRollDisplay />
    </AtlasUIContext.Provider>,
  );
  return { ...rendered, store };
}

describe("a GM map view's dice display and the rolls handed to it", () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); webgl.on = true; });

  it('throws a handed roll as dice, even one rolled by someone else, and dispatches no dice event', () => {
    const heard = vi.fn();
    document.addEventListener(DICE_ROLLED_EVENT, heard);
    const { container, store } = setup();
    act(() => sendGivenThrow(store, roll('r1')));
    document.removeEventListener(DICE_ROLLED_EVENT, heard);
    expect(container.querySelector('.atlas-dice-roll')?.textContent).toContain('1d20+2');
    expect(container.querySelector('.atlas-dice-toast')).toBeNull();
    expect(heard).not.toHaveBeenCalled();
  });

  it("shows Atlas's result card for a roll that does not list its dice, or where 3D dice cannot draw", () => {
    const clipped = setup();
    act(() => sendGivenThrow(clipped.store, roll('r1', { unlistedDice: 30 })));
    expect(clipped.container.querySelector('.atlas-dice-roll')).toBeNull();
    expect(clipped.container.querySelector('.atlas-dice-toast')?.textContent).toContain('15');
    clipped.unmount();
    webgl.on = false;
    const blind = setup();
    act(() => sendGivenThrow(blind.store, roll('r2')));
    expect(blind.container.querySelector('.atlas-dice-toast')?.textContent).toContain('15');
  });

  it("hears only its own view's rolls, and none after it unmounts", () => {
    const { container, store, unmount } = setup();
    act(() => sendGivenThrow({}, roll('other')));
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    unmount();
    expect(() => sendGivenThrow(store, roll('late'))).not.toThrow();
  });
});
