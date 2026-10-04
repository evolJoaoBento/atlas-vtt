import { EventEmitter } from 'events';
import { DEFAULT_DICE_RULES } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import { hasDiceTerm } from './diceFormula';
import { DICE_ROLLED_EVENT, DICE_TYPES, rollFormula, type DiceRollResult } from './diceRolling';

export type { DiceRollResult } from './diceRolling';

export interface DiceToolState {
  isTrayOpen: boolean;
  rollHistory: DiceRollResult[];
  activeFormula: string;
  quickDice: string[]; // Quick access dice buttons
}

export class DiceTool {
  public state: DiceToolState;
  private eventBus: EventEmitter;
  private readonly getDiceRules: () => DiceRules;

  constructor(eventBus: EventEmitter, getDiceRules: () => DiceRules = () => DEFAULT_DICE_RULES) {
    this.eventBus = eventBus;
    this.getDiceRules = getDiceRules;
    this.state = {
      isTrayOpen: false,
      rollHistory: [],
      activeFormula: '',
      quickDice: [...DICE_TYPES],
    };
  }

  public toggleTray(): void {
    this.state.isTrayOpen = !this.state.isTrayOpen;
    this.eventBus.emit('dice-tray-toggled', this.state.isTrayOpen);
  }

  public rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult {
    const result = this.parseAndRoll(formula);
    if (source) {
      result.source = source;
    }
    
    // Add to history
    this.state.rollHistory.unshift(result);
    
    // Keep only last 50 rolls
    if (this.state.rollHistory.length > 50) {
      this.state.rollHistory = this.state.rollHistory.slice(0, 50);
    }
    
    document.dispatchEvent(new CustomEvent(DICE_ROLLED_EVENT, { detail: result }));

    return result;
  }

  /** Rolls the formula; one without dice (`+3`) is added to the collection's default roll. */
  private parseAndRoll(formula: string): DiceRollResult {
    const rules = this.getDiceRules();
    const complete = hasDiceTerm(formula) ? formula : withDefaultRoll(formula, rules.defaultRoll);
    return rollFormula(complete, Math.random, Date.now(), rules);
  }

  public clearHistory(): void {
    this.state.rollHistory = [];
    this.eventBus.emit('dice-history-cleared');
    document.dispatchEvent(new CustomEvent('atlas-dice-history-cleared'));
  }

  public setActiveFormula(formula: string): void {
    this.state.activeFormula = formula;
  }

  public getQuickDice(): string[] {
    return this.state.quickDice;
  }

  public addQuickDie(die: string): void {
    if (!this.state.quickDice.includes(die)) {
      this.state.quickDice.push(die);
    }
  }

  public removeQuickDie(die: string): void {
    this.state.quickDice = this.state.quickDice.filter(d => d !== die);
  }

  // Get current state
  public getState(): DiceToolState {
    return { ...this.state };
  }
}

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}
