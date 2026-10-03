// online-client/dice3d/diceThrows.mts
/**
 * The join page's 3D dice: Atlas's own (`src/app/dice3d/`, three.js) throwing the player's own
 * rolls. Its own chunk, loaded with the first roll the page throws (`OwnRollThrows`), so the page
 * opens as fast as without it. The Obsidian globals the dice use are installed first.
 */
import './obsidianShim.mts';
import { borrowStage, returnStage, warmStages } from '../../src/app/dice3d/stagePool';
import type { DiceThrowModule } from '../../src/app/online/page/ownRollThrows';
import { ThrowPanel, type PageThrow } from './throwPanel.mts';

let current: ThrowPanel | null = null;

/** Throws `roll` into `container`; false without WebGL, so the page shows the result card instead. */
function throwRoll(container: HTMLElement, roll: PageThrow): boolean {
  const lease = borrowStage(document);
  if (!lease.renderer) {
    returnStage(lease);
    return false;
  }
  current?.dismiss();
  const panel = new ThrowPanel(container, lease, roll, () => {
    if (current === panel) current = null;
  });
  current = panel;
  // The next roll finds a stage made: building one is a freeze at the moment the dice leave the hand.
  warmStages(document);
  return true;
}

export const diceThrows: DiceThrowModule = { throwRoll };
