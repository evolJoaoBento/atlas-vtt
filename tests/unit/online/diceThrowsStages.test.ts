import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { built } = vi.hoisted(() => ({ built: { count: 0 } }));
// A stand-in renderer, as jsdom has no WebGL: it counts the contexts the page makes.
vi.mock('../../../src/app/dice3d/DiceRenderer', () => ({
  stagePixelRatio: () => 1,
  DiceRenderer: class {
    constructor() { built.count++; }
    stage(): readonly [number, number] { return [4, 3]; }
    setView(): void {}
    setSize(): void {}
    setPlan(): void {}
    render(): void {}
    isStill(): boolean { return true; }
    reset(): void {}
  },
}));

import { diceThrows, PAGE_STAGES } from '../../../online-client/dice3d/diceThrows.mts';
import { throwStyle } from '../../../src/app/dice3d/diceDisplay';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import type { DiceRollResult } from '../../../src/app/tools/diceRolling';

const roll = (id: string): Parameters<typeof diceThrows.throwRoll>[1] => {
  const result: DiceRollResult = { id, timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7, crit: null };
  return { result, scene: sceneFromRolls(result.rolls)!, style: throwStyle('full'), reduced: false };
};

describe("the join page's WebGL contexts", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('makes at most two, the stage on screen and one spare, however many rolls come', async () => {
    for (let i = 0; i < 6; i++) {
      expect(diceThrows.throwRoll(document.body, roll(`r${i}`))).toBe(true);
      await vi.advanceTimersByTimeAsync(4000);
    }
    expect(PAGE_STAGES).toBe(2);
    expect(built.count).toBe(PAGE_STAGES);
    expect(document.querySelectorAll('.dice-throw').length).toBeLessThanOrEqual(1);
  });
});
