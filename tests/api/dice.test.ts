import { afterEach, describe, expect, it, vi } from 'vitest';
import { diceApi } from '../../src/api/dice';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { DisposerSet } from '../../src/api/disposers';
import { AssetService } from '../../src/app/services/AssetService';
import { persistableDiceLog, rollFormula, type DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP = 'atlas-vtt/collections/c1/maps/a.atlasmap';

/** A collection whose dice are one d6 that explodes on its highest face, with a natural critical rule. */
function seededAppWithExplodingD6Collection(): ReturnType<typeof createInMemoryApp> {
  const settings = { dice: { defaultRoll: '1d6', crit: 'natural', explode: { dice: 'all', repeats: false, highFaces: 1, lowFaces: 0 } } };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionForMap: (path: string) => (path === MAP ? 'c1' : null),
    getCollectionSettings: () => settings,
    initialize: () => Promise.resolve(),
  } as unknown as AssetService);
  return createInMemoryApp();
}

/** Plays `values` to the dice in turn; the roll's random id takes whatever comes next. */
function throwSequence(...values: number[]): void {
  let index = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[index++] ?? 0.5);
}

afterEach(() => vi.restoreAllMocks());

describe('dice', () => {
  it('C-dice-1: roll uses the collection dice rules, sets rolledBy, reaches onRolled, and is not persisted', () => {
    const { app } = seededAppWithExplodingD6Collection();
    const dice = diceApi(app, new DisposerSet());
    const seen: DiceRollResult[] = [];
    dice.onRolled((result) => seen.push(result));
    // 2d6: the first die shows a 6 and explodes into a 1, the second die shows a 3 (floor(0.4 × 6) + 1 = 3).
    throwSequence(0.99, 0, 0.4);
    const result = dice.roll({ formula: '2d6+1', mapPath: MAP, rolledBy: 'Ana' });
    expect(result.rolledBy).toBe('Ana');
    expect(result.formula).toBe('2d6+1');
    expect(result.rolls.map((die) => [die.value, die.exploded === true])).toEqual([[6, false], [1, true], [3, false]]);
    expect(result.total).toBe(6 + 1 + 3 + 1);
    expect(result.crit).toBe('high');
    expect(seen).toEqual([result]);
    expect(persistableDiceLog([result])).toEqual([]);
  });

  it('C-dice-1: outside a collection nothing explodes, and a bonus is added to the default roll', () => {
    const { app } = seededAppWithExplodingD6Collection();
    const dice = diceApi(app, new DisposerSet());
    throwSequence(0.99);
    const outside = dice.roll({ formula: '1d6', mapPath: 'maps/loose.atlasmap' });
    expect(outside.rolls).toHaveLength(1);
    expect(outside.rolledBy).toBeUndefined();
    throwSequence(0.5);
    const bonus = dice.roll({ formula: '+3', mapPath: MAP });
    expect(bonus.formula).toBe('1d6+3');
    expect(bonus.total).toBe(4 + 3);
  });

  it('is a landed capability', () => {
    expect(LANDED_CAPABILITIES).toContain('dice');
  });

  it('returns frozen copies, so an extension cannot change what Atlas logged', () => {
    const { app } = createInMemoryApp();
    const dice = diceApi(app, new DisposerSet());
    const seen: DiceRollResult[] = [];
    dice.onRolled((result) => seen.push(result));
    const result = dice.roll({ formula: '1d20' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rolls[0])).toBe(true);
    expect(Object.isFrozen(seen[0])).toBe(true);
  });

  it('C-dice-2: publish adds a roll made elsewhere without re-rolling it', () => {
    const dice = diceApi(createInMemoryApp().app, new DisposerSet());
    const seen: DiceRollResult[] = [];
    dice.onRolled((result) => seen.push(result));
    const made = rollFormula('1d20', () => 0.5, 1);
    dice.publish(made);
    expect(seen).toEqual([made]);
  });

  it('publish refuses what is not a roll', () => {
    const dice = diceApi(createInMemoryApp().app, new DisposerSet());
    const listener = vi.fn();
    dice.onRolled(listener);
    expect(() => dice.publish({ formula: '1d20' } as unknown as DiceRollResult)).toThrow('[Atlas API] publish needs a roll');
    expect(() => dice.publish(null as unknown as DiceRollResult)).toThrow('[Atlas API] publish needs a roll');
    expect(listener).not.toHaveBeenCalled();
  });

  it('onRolled disposer stops listening', () => {
    const disposers = new DisposerSet();
    const dice = diceApi(createInMemoryApp().app, disposers);
    const listener = vi.fn();
    dice.onRolled(listener)();
    dice.publish(rollFormula('1d4', () => 0, 1));
    expect(listener).not.toHaveBeenCalled();
  });

  it('disposing the extension stops its listeners', () => {
    const disposers = new DisposerSet();
    const dice = diceApi(createInMemoryApp().app, disposers);
    const listener = vi.fn();
    dice.onRolled(listener);
    disposers.disposeAll();
    dice.publish(rollFormula('1d4', () => 0, 1));
    expect(listener).not.toHaveBeenCalled();
  });

  it('a listener that throws is logged and does not stop the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dice = diceApi(createInMemoryApp().app, new DisposerSet());
    const heard = vi.fn();
    dice.onRolled(() => { throw new Error('boom'); });
    dice.onRolled(heard);
    dice.publish(rollFormula('1d4', () => 0, 1));
    expect(error).toHaveBeenCalledWith('[Atlas API] A dice listener failed:', expect.any(Error));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('listens on the document it is given', () => {
    const other = document.implementation.createHTMLDocument('popout');
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), other);
    const listener = vi.fn();
    dice.onRolled(listener);
    document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: rollFormula('1d4', () => 0, 1) }));
    expect(listener).not.toHaveBeenCalled();
    dice.publish(rollFormula('1d4', () => 0, 1));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
