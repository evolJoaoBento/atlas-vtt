import type AtlasVTTPlugin from '../../main';
import { AssetService } from '../app/services/AssetService';
import { AtlasApiHost } from './AtlasApiHost';
import { ATLAS_VIEW_HOOKS } from './atlasViewHooks';
import { LANDED_CAPABILITIES } from './capabilities';
import { buildExtension } from './extension';
import type { ApiServices } from './services';
import { ViewTracker } from './viewTracker';

/** Publishes `plugin.api` once storage and the asset index have settled (loaded or failed), and takes it down on unload. */
export class ExtensionApiPublisher {
  private host: AtlasApiHost | null = null;
  private views: ViewTracker | null = null;
  private stopped = false;

  constructor(private readonly plugin: AtlasVTTPlugin) {}

  async start(): Promise<void> {
    try {
      await AssetService.getInstance(this.plugin.app).initialize();
    } catch (error) {
      // Publish anyway: a failed index must not disable every extension; scene functions will reject.
      console.error('[Atlas API] The asset index failed to load; publishing the API without it:', error);
    }
    if (this.stopped) return;
    // The tracker needs the host's events and the host's builder needs the tracker: services is read lazily.
    let services!: ApiServices;
    const host = new AtlasApiHost({
      app: this.plugin.app,
      capabilities: LANDED_CAPABILITIES,
      build: (scope) => buildExtension(scope, services),
    });
    const views = new ViewTracker(this.plugin.app, host.apiEvents, ATLAS_VIEW_HOOKS);
    services = { app: this.plugin.app, plugin: this.plugin, views };
    this.host = host;
    this.views = views;
    views.start();
    this.plugin.api = host.api;
    host.publish();
  }

  stop(): void {
    this.stopped = true;
    this.host?.dispose();
    this.host = null;
    this.views?.stop();
    this.views = null;
    this.plugin.api = undefined;
  }
}
