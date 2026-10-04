import { Notice } from 'obsidian';
import { presentedScene } from './PresentedScene';

/** Stop presenting: an open player window keeps the last scene it showed. */
export function stopPresenting(): void {
  if (!presentedScene.current()) return;
  presentedScene.clear();
  new Notice('Players no longer see a scene');
}
