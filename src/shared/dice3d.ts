/**
 * `@atlas-vtt/shared/dice3d`: the 3D dice renderer and its presentation helpers (three is an external dependency).
 */
import d4 from '../app/assets/dice-icons/d4.webp';
import d6 from '../app/assets/dice-icons/d6.webp';
import d8 from '../app/assets/dice-icons/d8.webp';
import d10 from '../app/assets/dice-icons/d10.webp';
import d12 from '../app/assets/dice-icons/d12.webp';
import d20 from '../app/assets/dice-icons/d20.webp';

export * from '../app/dice3d/DiceRenderer';
export * from '../app/dice3d/diceDisplay';
export * from '../app/dice3d/diceScene';
export * from '../app/dice3d/dieArtwork';
export * from '../app/dice3d/dieGeometry';
export * from '../app/dice3d/dieMotion';
export * from '../app/dice3d/dieTour';
export * from '../app/dice3d/rollPresentation';
export * from '../app/dice3d/stagePool';
export * from '../app/dice3d/throwChain';
export * from '../app/dice3d/throwSeed';
export * from '../app/react/components/dice3d/diceRollText';

/** The six dice icons the tray shows, as URLs (inlined as data URLs by the package build). */
export const DIE_ICONS = { d4, d6, d8, d10, d12, d20 } as const;
