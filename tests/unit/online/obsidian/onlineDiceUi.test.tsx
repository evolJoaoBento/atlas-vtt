import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const { ui } = vi.hoisted(() => ({ ui: { view: null as unknown } }));
vi.mock('../../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));
vi.mock('../../../../src/app/react/components/dice/DiceToastContainer', () => ({ DiceToastContainer: () => <div>toasts</div> }));

import { diceLogResults, rollOfResult, traySelection } from '../../../../src/app/online/obsidian/onlineDice';
import { initialRemoteScene } from '../../../../src/app/online/obsidian/remoteScene';
import { DiceDropdownMenu } from '../../../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceRollLog } from '../../../../src/app/react/components/dice-log/DiceRollLog';
import { ViewStoreProvider } from '../../../../src/app/react/ViewStoreContext';
import { DICE_ROLLED_EVENT, rollFormula, type DiceRollResult } from '../../../../src/app/tools/diceRolling';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

// jsdom has no scrollTo; the log scrolls to its newest roll.
Element.prototype.scrollTo = vi.fn();

const ENTRY = { id: 'r1', name: 'Anna', formula: '2d6+1', dice: [{ die: 'd6', value: 4 }, { die: 'd6', value: 2 }], modifier: 1, total: 7, at: 1000 };

afterEach(() => {
  cleanup();
  ui.view = null;
});

describe('rolling again and from the tray', () => {
  it("rolls a logged roll's dice and modifier again, when the tray can", () => {
    expect(rollOfResult(diceLogResults([ENTRY])[0]!)).toEqual({ dice: { d6: 2 }, modifier: 1 });
    expect(rollOfResult({ ...diceLogResults([ENTRY])[0]!, rolls: [{ die: 'd7', value: 1, max: 7 }] })).toBeNull();
    const many: DiceRollResult = { ...diceLogResults([ENTRY])[0]!, rolls: Array.from({ length: 21 }, () => ({ die: 'd6', value: 1, max: 6 })) };
    expect(rollOfResult(many)).toBeNull();
    expect(traySelection({ d6: 2, d20: 0, x: 3 })).toEqual({ d6: 2 });
  });

  it('sends the picked dice instead of rolling them, and shows no toasts', () => {
    const rollDice = vi.fn();
    const onRoll = vi.fn();
    render(<DiceDropdownMenu diceTool={{ rollDice } as never} isOpen onToggle={() => {}} onRoll={onRoll} showToasts={false} />);
    fireEvent.click(document.querySelectorAll('.atlas-dice-btn')[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Roll/ }));
    expect(onRoll).toHaveBeenCalledWith({ d6: 1 });
    expect(rollDice).not.toHaveBeenCalled();
    expect(screen.queryByText('toasts')).toBeNull();
  });
});

describe("the online scene's dice log", () => {
  function renderLog() {
    const controls = { followGm: vi.fn(), fitMap: vi.fn(), reconnect: vi.fn(), rollDice: vi.fn(() => true) };
    ui.view = { onlineControls: () => controls };
    const store = create(() => ({
      diceLog: diceLogResults([ENTRY]), addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn(), remoteScene: initialRemoteScene(),
    }));
    render(<ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => {}} /></ViewStoreProvider>);
    return { controls, store };
  }

  it('shows the shared log, rolls an entry again through the GM, and offers no clearing', () => {
    const { controls } = renderLog();
    expect(screen.getByText('2d6+1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    expect(controls.rollDice).toHaveBeenCalledWith({ d6: 2 }, 1);
  });

  it("does not take the player's own rolls from their other maps", () => {
    const { store } = renderLog();
    document.dispatchEvent(new CustomEvent(DICE_ROLLED_EVENT, { detail: rollFormula('d4') }));
    expect(screen.queryByText('d4')).toBeNull();
    expect(store.getState().addDiceLogEntry).not.toHaveBeenCalled();
  });

  it("dispatches no dice event: the player's own maps never record the shared log", () => {
    const heard = vi.fn();
    document.addEventListener(DICE_ROLLED_EVENT, heard);
    const t = onlineSceneSetup();
    t.sink().session(admitted());
    t.sink().diceLog([ENTRY]);
    t.client.controls.rollDice({ d20: 1 }, 0);
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    document.removeEventListener(DICE_ROLLED_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
