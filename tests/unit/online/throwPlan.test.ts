import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AFTERGLOW, GLEAM } from '../../../online-client/dice3d/stageClock.mts';
import { LEAVE_MS, LINGER_MS, LINGER_STUCK_MS, TICK_DELAY_MS } from '../../../online-client/dice3d/throwPanel.mts';
import { throwStyle } from '../../../src/app/dice3d/diceDisplay';
import { layoutDice, sceneFromRolls, type DiceScene } from '../../../src/app/dice3d/diceScene';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from '../../../src/app/dice3d/dieGeometry';
import { makeDie, stepDie, type DieAnim } from '../../../src/app/dice3d/dieMotion';
import { beginThrow } from '../../../src/app/dice3d/throwChain';
import { throwRandom } from '../../../src/app/dice3d/throwSeed';
import { planThrow, type ThrowStage } from '../../../src/app/online/page/throwPlan';

const source = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const STAGE: ThrowStage = { before: [5, 3.5], measure: () => [4.2, 3] };

function scene(): DiceScene {
  // A d20 that exploded once, and a d6: three bodies, the third thrown after the first lands.
  return sceneFromRolls([
    { die: 'd20', value: 20, max: 20 }, { die: 'd20', value: 7, max: 20, exploded: true }, { die: 'd6', value: 3, max: 6 },
  ])!;
}

/** Steps every die to rest and lists where each ended up. */
function landing(anims: DieAnim[], steps: Array<() => number>): string[] {
  for (let frame = 0; frame < 2000 && anims.some((anim) => anim.phase !== 'rest'); frame++) {
    anims.forEach((anim, i) => stepDie(anim, 1 / 60, steps[i]!));
  }
  return anims.map((anim) => `${anim.p.map((n) => n.toFixed(4)).join(',')}|${[anim.q.x, anim.q.y, anim.q.z, anim.q.w].map((n) => n.toFixed(4)).join(',')}`);
}

/** `DiceStage`'s own steps, written out as it orders them. */
function upstreamThrow(plan: DiceScene, seed: string): { anims: DieAnim[]; steps: Array<() => number> } {
  const { offsets, radius } = layoutDice(plan.plan.length);
  const anims = plan.plan.map((die, i) => makeDie(throwRandom(seed, -1 - i), offsets[i], radius, STAGE.before, lyingHeight(dieGeometry(die.sides))));
  const walls = STAGE.measure()!;
  for (const anim of anims) anim.stage = walls;
  const targets = plan.plan.map((die, i) => {
    const geometry = dieGeometry(die.sides);
    return restingQuaternion(geometry, faceIndexForValue(geometry, plan.faces[i] ?? 1), (throwRandom(seed, 2000 + i)() * 2 - 1) * REST_YAW);
  });
  beginThrow(anims, plan.plan, targets, (i) => throwRandom(seed, i), Infinity);
  return { anims, steps: plan.plan.map((_, i) => throwRandom(seed, 1000 + i)) };
}

describe("the join page's throw", () => {
  it("throws a roll as upstream's dice stage does: the same id gives the same throw", () => {
    const page = planThrow(scene(), 'roll_7_abc', STAGE, throwStyle('full'), false);
    const atlas = upstreamThrow(scene(), 'roll_7_abc');
    const pageLanding = landing(page.dice.map((die) => die.anim), page.stepRandoms);
    expect(pageLanding).toEqual(landing(atlas.anims, atlas.steps));
    const again = planThrow(scene(), 'roll_7_abc', STAGE, throwStyle('full'), false);
    expect(landing(again.dice.map((die) => die.anim), again.stepRandoms)).toEqual(pageLanding);
    const other = planThrow(scene(), 'roll_8_abc', STAGE, throwStyle('full'), false);
    expect(landing(other.dice.map((die) => die.anim), other.stepRandoms)).not.toEqual(pageLanding);
  });

  it('lets the exploded die wait for its parent, and bursts the die that exploded', () => {
    const { dice } = planThrow(scene(), 'roll_1', STAGE, throwStyle('fast'), false);
    expect(dice.map((die) => [die.sides, die.waits, die.burst])).toEqual([[20, false, 'high'], [20, true, null], [6, false, null]]);
    expect(dice[1]!.anim.delay).toBeGreaterThan(dice[0]!.anim.tour.duration);
  });

  it('lays the dice on their faces at once with reduced motion', () => {
    const { dice } = planThrow(scene(), 'roll_1', STAGE, throwStyle('full'), true);
    expect(dice.every((die) => die.anim.phase === 'rest')).toBe(true);
  });

  // The page copies `DiceStage`'s and `DiceRollPanel`'s steps and times: if upstream changes them, this says so.
  it("keeps upstream's seeded streams, clock and panel times", () => {
    const stage = source('src/app/react/components/dice3d/DiceStage.tsx');
    for (const stream of ['throwRandom(seed, -1 - i)', 'throwRandom(seed, 1000 + i)', 'throwRandom(seed, 2000 + i)', '(i) => throwRandom(seed, i)']) {
      expect(stage, stream).toContain(stream);
    }
    expect(stage).toContain(`const GLEAM = ${GLEAM};`);
    expect(stage).toContain(`const AFTERGLOW = ${AFTERGLOW};`);
    const panel = source('src/app/react/components/dice3d/DiceRollPanel.tsx');
    for (const [name, value] of Object.entries({ LINGER_MS, LINGER_STUCK_MS, TICK_DELAY_MS, LEAVE_MS })) {
      expect(panel, name).toContain(`const ${name} = ${value};`);
    }
  });
});
