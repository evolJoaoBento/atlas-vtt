import type { App } from 'obsidian';
import type AtlasVTTPlugin from '../../main';

/** What the facades need of Atlas. One per published API; later groups add their trackers here. */
export interface ApiServices {
  app: App;
  plugin: AtlasVTTPlugin;
}
