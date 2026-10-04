import { SoundEffectService } from './SoundEffectService';
import type { SettingsService } from './SettingsService';
import { diceSceneToShow } from '../dice3d/rollPresentation';
import type { DiceRollResult } from '../tools/DiceTool';

/**
 * Plays the result sound for every roll shown as a result card, driven by the
 * same `atlas-dice-rolled` event that raises the card. Rolls thrown as 3D dice
 * make their own sounds.
 */
export class DiceToastObserver {
    private soundEffectService: SoundEffectService;

    constructor(soundEffectService: SoundEffectService, private readonly settings: Pick<SettingsService, 'getDiceDisplay'>) {
        this.soundEffectService = soundEffectService;
        document.addEventListener('atlas-dice-rolled', this.handleDiceRolled);
    }

    private handleDiceRolled = (event: Event): void => {
        const result = (event as CustomEvent<DiceRollResult>).detail;
        // A roll by someone else is never thrown, so it makes its own card sound whatever the display.
        if (!result.rolledBy && diceSceneToShow(result, this.settings.getDiceDisplay())) return;
        this.soundEffectService.playDiceResult(result.crit ?? null);
    };

    destroy(): void {
        document.removeEventListener('atlas-dice-rolled', this.handleDiceRolled);
    }
}
