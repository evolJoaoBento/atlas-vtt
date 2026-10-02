/**
 * Atlas's renderers wait for a background sprite: the grid, and with it the token renderer,
 * starts from one. Until the scene's map image shows, and whenever the scene has none, this puts
 * a transparent placeholder there at the map's size (Atlas's own placeholder texture, shared and
 * never unloaded), and starts the grid once. `BackgroundSprite` replaces the placeholder when the
 * image arrives; the renderer destroys the sprite it replaces.
 */
import type { Sprite } from 'pixi.js';
import type { GridOptions } from '../../grid/GridSystem';
import { toGridOptions } from '../../grid/gridStateOptions';
import type { GridState } from '../../services/MapPersistence';
import type { PlayerScene } from '../scene/sceneTypes';

export interface BackdropRenderer {
  setBackgroundSprite(sprite: Sprite): void;
  initGrid(options: GridOptions, sprite: Sprite): void;
  getGridSystem(): unknown;
}

/** Cells each way of a map without a size: Atlas's placeholder for maps without a background. */
export const PLACEHOLDER_CELLS = 20;
const DEFAULT_CELL = 70;

export class RemoteMapBackdrop {
  private placeholder: Sprite | null = null;

  constructor(
    private readonly renderer: BackdropRenderer,
    private readonly createSprite: (width: number, height: number, cellSize: number) => Sprite,
  ) {}

  /** After the store took a scene: `background` and `grid` are what the store now holds. */
  show(scene: PlayerScene | null, background: string | null, grid: GridState | null): void {
    if (background !== null) {
      // BackgroundSprite shows the image and replaces this placeholder.
      this.placeholder = null;
      return;
    }
    const cell = scene?.map.cellSize ?? grid?.size ?? DEFAULT_CELL;
    const sized = scene !== null && scene.map.width > 0 && scene.map.height > 0;
    const width = sized ? scene.map.width : cell * PLACEHOLDER_CELLS;
    const height = sized ? scene.map.height : cell * PLACEHOLDER_CELLS;
    const shown = this.placeholder;
    if (shown && !shown.destroyed && shown.width === width && shown.height === height) return;
    const sprite = this.createSprite(width, height, cell);
    this.placeholder = sprite;
    this.renderer.setBackgroundSprite(sprite);
    if (!this.renderer.getGridSystem() && grid) this.renderer.initGrid(toGridOptions(grid), sprite);
  }

  dispose(): void {
    this.placeholder = null;
  }
}
