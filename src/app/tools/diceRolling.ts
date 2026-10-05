/**
 * Atlas's dice: the dice its tray offers, the formula a selection makes, rolling a formula, and
 * what players may see of a roll. It imports only pure dice maths (`diceFormula.ts`, `diceCrit.ts`
 * and the dice rules they read, `gameSystems/diceRules`), so it needs no PIXI or UI code.
 */
import { getDiceCrit, type DiceCrit } from './diceCrit';
import { hasDiceTerm, rollFormula as rollDiceFormula, type RolledDie } from './diceFormula';
import type { DiceRules } from '../types/diceRulesTypes';
import { t } from '../i18n';

/** The dice of Atlas's dice tray, in tray order. */
export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
export type DieType = typeof DICE_TYPES[number];

/** How many of each die are picked; a die left out counts 0. */
export type DiceSelection = Partial<Record<DieType, number>>;

/** Every roll reaches Atlas's dice log, toasts and sounds as this document event. */
export const DICE_ROLLED_EVENT = 'atlas-dice-rolled';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  modifiers: number;
  total: number;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
  /** Dice the roll had beyond those in `rolls`: a log may list only the first of a roll's dice (for example a long roll made by someone other than the GM). */
  unlistedDice?: number;
  /** Atlas's own label for the GM's roller ("Player" in English), stamped on every roll; not who rolled it. */
  player?: string;
  /** Who rolled it when it was someone other than the GM: their name. Atlas shows it in the log and toasts. */
  rolledBy?: string;
  source?: {
    type: 'toolbar' | 'statblock';
    /** Let the roll follow its token's or statblock's current artwork. */
    tokenId?: string;
    statblockPath?: string;
    tokenName?: string;
    tokenImagePath?: string;
    abilityName?: string;
  };
}

export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && (DICE_TYPES as readonly string[]).includes(value);
}

/** The picked dice in the order they were picked, e.g. `['2d6', 'd20']`; dice with no count are left out. */
export function diceTerms(selection: Readonly<Partial<Record<string, number>>>): string[] {
  return Object.entries(selection).flatMap(([die, count]) => (
    isDieType(die) && count !== undefined && count > 0 ? [count > 1 ? `${count}${die}` : die] : []
  ));
}

/** The formula Atlas rolls for a selection and a modifier, e.g. "2d6+d20-1"; empty without dice. */
export function diceFormula(selection: Readonly<Partial<Record<string, number>>>, modifier = 0): string {
  const dice = diceTerms(selection).join('+');
  if (!dice || modifier === 0) return dice;
  return `${dice}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

/**
 * Rolls `formula` with `random` for the dice (`diceFormula.ts`), by the collection's `rules` when
 * given: its exploding dice and, for the result, its critical rule. The id stays random however
 * the dice are rolled, so rolls made in the same millisecond never share one.
 */
export function rollFormula(formula: string, random: () => number = Math.random, now: number = Date.now(), rules?: DiceRules): DiceRollResult {
  const { rolls, modifiers, total } = rollDiceFormula(formula, random, rules);
  return {
    id: `roll_${now}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: now,
    formula,
    rolls,
    modifiers,
    total,
    ...(rules && { crit: getDiceCrit(rolls, rules) }),
    player: t('dice.player'),
  };
}

/** A roll for a token hidden from players keeps its ability and result, not the token's name or portrait. */
export function withoutHiddenToken(result: DiceRollResult, isTokenHidden: (tokenId: string) => boolean): DiceRollResult {
  const source = result.source;
  const tokenId = source?.tokenId;
  if (!source || !tokenId || !isTokenHidden(tokenId)) return result;
  const { type, abilityName } = source;
  return { ...result, source: abilityName ? { type, abilityName } : { type } };
}

/** The dice log as a map file keeps it: rolls by someone other than the GM stay in the live log only. */
export function persistableDiceLog(log: readonly DiceRollResult[]): DiceRollResult[] {
  return log.filter((entry) => !entry.rolledBy);
}

/** The name a roll shows: the person who rolled it, or a statblock roll's token; null for the GM's own. */
export function rollerName(result: DiceRollResult): string | null {
  if (result.rolledBy) return result.rolledBy;
  const source = result.source;
  return source?.type === 'statblock' && source.tokenName ? source.tokenName : null;
}

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}

/** Rolls `formula` by a collection's `rules`; one without dice (`+3`) is added to the rules' default roll. */
export function rollByRules(formula: string, rules: DiceRules, random: () => number = Math.random, now: number = Date.now()): DiceRollResult {
  return rollFormula(hasDiceTerm(formula) ? formula : withDefaultRoll(formula, rules.defaultRoll), random, now, rules);
}
