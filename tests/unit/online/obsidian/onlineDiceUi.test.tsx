import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { create } from 'zustand';

const { ui } = vi.hoisted(() => ({ ui: { view: null as unknown } }));
vi.mock('../../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));
vi.mock('obsidian', async (importOriginal) => ({ ...await importOriginal<typeof import('obsidian')>(), Notice: vi.fn() }));
vi.mock('../../../../src/app/react/components/dice/DiceToastContainer', () => ({ DiceToastContainer: () => <div>toasts</div> }));

import { diceLogResults, rollOfResult, traySelection } from '../../../../src/app/online/obsidian/onlineDice';
import { initialRemoteScene } from '../../../../src/app/online/obsidian/remoteScene';
import { DiceDropdownMenu } from '../../../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceRollLog } from '../../../../src/app/react/components/dice-log/DiceRollLog';
import { ViewStoreProvider } from '../../../../src/app/react/ViewStoreContext';
import { DICE_ROLLED_EVENT, rollFormula, type DiceRollResult } from '../../../../src/app/tools/diceRolling';
import type { DiceLogEntry } from '../../../../src/app/online/tools/toolMessages';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

// jsdom has no scrollTo; the log scrolls to its newest roll.
Element.prototype.scrollTo = vi.fn();

const ENTRY: DiceLogEntry = { id: 'r1', name: 'Anna', formula: '2d6+1', dice: [{ die: 'd6', value: 4 }, { die: 'd6', value: 2 }], modifier: 1, total: 7, at: 1000 };

afterEach(() => {
  cleanup();
  ui.view = null;
});

/** The tray's d6 (its tooltip names it "d6"; `aria-label` says what a click does). */
const addD6 = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[aria-label^="Add a d6"]')!;

describe('rolling again and from the tray', () => {
  it("rolls a logged roll's dice and modifier again, when the tray can", () => {
    expect(rollOfResult(diceLogResults([ENTRY])[0]!)).toEqual({ dice: { d6: 2 }, modifier: 1 });
    expect(rollOfResult({ ...diceLogResults([ENTRY])[0]!, rolls: [{ die: 'd7', value: 1, max: 7 }] })).toBeNull();
    const many: DiceRollResult = { ...diceLogResults([ENTRY])[0]!, rolls: Array.from({ length: 21 }, () => ({ die: 'd6', value: 1, max: 6 })) };
    expect(rollOfResult(many)).toBeNull();
    expect(traySelection({ d6: 2, d20: 0, x: 3 })).toEqual({ d6: 2 });
  });

  it('rolls again without the dice an explosion added, and never a roll with subtracted or unlisted dice', () => {
    const [base] = diceLogResults([ENTRY]);
    const exploded = { ...base!, rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 3, max: 6, exploded: true as const }] };
    expect(rollOfResult(exploded)).toEqual({ dice: { d6: 1 }, modifier: 1 });
    const downwards = { ...base!, rolls: [{ die: 'd10', value: 1, max: 10 }, { die: 'd10', value: 7, max: 10, negative: true as const, exploded: true as const }] };
    expect(rollOfResult(downwards)).toEqual({ dice: { d10: 1 }, modifier: 1 });
    expect(rollOfResult({ ...base!, rolls: [{ die: 'd6', value: 2, max: 6 }, { die: 'd4', value: 1, max: 4, negative: true as const }] })).toBeNull();
    expect(rollOfResult({ ...base!, unlistedDice: 3 })).toBeNull();
  });

  it("takes a logged roll's crit, flags and unlisted dice into Atlas's roll", () => {
    const [result] = diceLogResults([{
      ...ENTRY, crit: 'high', unlisted: 4,
      dice: [{ die: 'd6', value: 6 }, { die: 'd6', value: 2, exploded: true }, { die: 'd4', value: 1, negative: true }],
    }]);
    expect(result).toMatchObject({
      crit: 'high', unlistedDice: 4,
      rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 2, max: 6, exploded: true }, { die: 'd4', value: 1, max: 4, negative: true }],
    });
    expect(result?.rolls[0]).not.toHaveProperty('exploded');
  });

  it('sends nothing above the GM limit, and nothing empty', () => {
    expect(traySelection({ d6: 20 })).toEqual({ d6: 20 });
    expect(traySelection({ d6: 15, d8: 6 })).toBeNull();
    expect(traySelection({ d6: 0 })).toBeNull();
  });

  it('stops adding dice at the limit, and keeps the tray open when the roll could not go', () => {
    const onToggle = vi.fn();
    const onRoll = vi.fn(() => false);
    render(<DiceDropdownMenu diceTool={{ rollDice: vi.fn() } as never} isOpen onToggle={onToggle} onRoll={onRoll} maxDice={2} />);
    fireEvent.click(addD6());
    fireEvent.click(addD6());
    const d6 = addD6();
    expect(d6.disabled).toBe(true);
    fireEvent.click(d6);
    fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));
    expect(onRoll).toHaveBeenCalledWith({ 6: 2 }, 0);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText(/send the roll/)).toBeTruthy();
    // The tray keeps its dice for another try
    expect(addD6().getAttribute('aria-label')).toBe('Add a d6, 2 in the tray');
  });

  it('sends the picked dice instead of rolling them, and shows no toasts', () => {
    const rollDice = vi.fn();
    const onRoll = vi.fn(() => true);
    render(<DiceDropdownMenu diceTool={{ rollDice } as never} isOpen onToggle={() => {}} onRoll={onRoll} />);
    fireEvent.click(addD6());
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
    fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));
    expect(onRoll).toHaveBeenCalledWith({ 6: 1 }, 1);
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

  it('says so when an entry cannot be rolled again', () => {
    const { controls } = renderLog();
    ui.view = { onlineControls: () => controls };
    cleanup();
    const store = create(() => ({
      diceLog: [{ ...diceLogResults([ENTRY])[0]!, rolls: [{ die: 'd7', value: 1, max: 7 }] }],
      addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn(), remoteScene: initialRemoteScene(),
    }));
    render(<ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => {}} /></ViewStoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    expect(controls.rollDice).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith("Can't roll that again.");
  });

  it('marks the crit, writes exploded and subtracted dice as Atlas does, and counts the dice it does not list', () => {
    const controls = { followGm: vi.fn(), fitMap: vi.fn(), reconnect: vi.fn(), rollDice: vi.fn(() => true) };
    ui.view = { onlineControls: () => controls };
    const entry: DiceLogEntry = {
      ...ENTRY, formula: '1d6-1d4', crit: 'high', unlisted: 4,
      dice: [{ die: 'd6', value: 6 }, { die: 'd6', value: 2, exploded: true }, { die: 'd4', value: 1, negative: true }],
    };
    const store = create(() => ({ diceLog: diceLogResults([entry]), addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn(), remoteScene: initialRemoteScene() }));
    const { container } = render(<ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => {}} /></ViewStoreProvider>);
    expect(container.querySelector('.dice-log-entry--crit-success')).not.toBeNull();
    fireEvent.click(screen.getByText('1d6-1d4'));
    expect(screen.getByText('d6: 6!')).toBeTruthy();
    expect(screen.getByText('d6: 2')).toBeTruthy();
    expect(screen.getByText('+4 more')).toBeTruthy();
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
