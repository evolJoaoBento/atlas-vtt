import type AtlasVTTPlugin from '../../main';
import { AssetService } from '../app/services/AssetService';
import { AtlasApiHost } from './AtlasApiHost';
import { LANDED_CAPABILITIES } from './capabilities';
import { buildExtension } from './extension';
import type { ApiServices } from './services';

/** Publishes `plugin.api` once storage and the asset index have settled (loaded or failed), and takes it down on unload. */
export class ExtensionApiPublisher {
  private host: AtlasApiHost | null = null;
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
    const services: ApiServices = { app: this.plugin.app, plugin: this.plugin };
    const host = new AtlasApiHost({
      app: this.plugin.app,
      capabilities: LANDED_CAPABILITIES,
      build: (scope) => buildExtension(scope, services),
    });
    this.host = host;
    this.plugin.api = host.api;
    host.publish();
  }

  stop(): void {
    this.stopped = true;
    this.host?.dispose();
    this.host = null;
    this.plugin.api = undefined;
  }
}
