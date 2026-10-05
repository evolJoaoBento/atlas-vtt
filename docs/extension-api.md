# Extension API

Other Obsidian plugins can extend Atlas VTT through one versioned entry point:

```ts
app.plugins.plugins['atlas-vtt'].api
```

The API is announced with the workspace event `atlas-vtt:api-ready` and withdrawn with `atlas-vtt:api-unload`. Everything an extension adds is tidied up when either plugin unloads.

## Version and capabilities

`api.version` is the semver of the API, independent of Atlas's own version. It is the `API_VERSION` constant in `src/api/version.ts`.

An extension requires its major version and checks `api.has(capability)` before using a feature. It never compares minor versions. `has()` is true only for capabilities that have landed in the running Atlas.

| API version | Status | Capabilities added | Added to `AtlasExtension` | Events added |
|---|---|---|---|---|
| 1.0.0 | released | none | `id`, `on` | `unload` |
| 1.1.0 | shipped in 1.1.0 | `views`, `rules`, `settings`, `storage` | `views`, `rules`, `settings`, `storage` | `map-loaded`, `map-closed`, `rules-changed`, `settings-changed` |
| 1.2.0 | shipped in 1.2.0 | `presentation` | `presentation` | none |
| 1.3.0 | shipped in 1.3.0 | `dice` | `dice` | none |
| 1.4.0 | shipped in 1.4.0 | `lasers` | `lasers` | none |
| 1.5.0 | shipped in 1.5.0 | `lighting` | `lighting` | none |
| 1.6.0 | shipped in 1.6.0 | `tokens` | `tokens` | none |
| 1.7.0 | shipped in 1.7.0 | `ui` | `ui` | none |
| 1.8.0 | shipped in 1.8.0 | `scenes`, `bundles` | `scenes`, `bundles` | `scenes-changed` |
| 1.9.0 | shipped in 1.9.0 | none | none | none |
| 1.10.0 | shipped in 1.10.0 | none | none | none |
| 1.11.0 | shipped in 1.11.0 | none | `bundles.forgetNoteProperties` | none |
| 1.12.0 | planned for 1.12.0 | `remote-view` | `remoteViews` (optional) | none |

Dice events (`dice.onRolled`, `dice.roll`, `dice.publish`) use the main window's `document`, which popout windows share, so they reach every open map view and the player window.

Version 1.9.0 adds `presentationId` to a presented scene: the same while the scene is held and resumed, new for every presentation and never repeated after Atlas reloads. Version 1.10.0 makes `bundles.stripNoteProperties` remember its keys per extension id: they stay stripped when the extension is not loaded, and only the returned disposer forgets them, not the extension unloading.

Version 1.11.0 adds `bundles.forgetNoteProperties()`. Handing the disposer of `bundles.stripNoteProperties` to Obsidian's `this.register()` forgets the keys on every unload, so keep it for an extension that really stops stripping. The keys of an extension that crashed or was uninstalled stay until something calls that disposer or `forgetNoteProperties` (Atlas keeps them in its settings under `extensionNoteKeys`).

Extension data on scenes (`scenes.setData`) lives only in Atlas's asset index, never in the scene's record file, so it travels in no bundle and no copy. When Atlas cannot read the index and rebuilds it from the collection files, that data is lost, because the files do not hold it.

Rows marked planned are not in the running Atlas yet. The report in `api-report/atlas-vtt-api.d.ts` is the source of truth for what the running version contains.

## Semver rules

- **Minor:** a new function, capability, event, optional option, or a new field on a returned object or record type.
- **Major:** removing or renaming anything, changing behaviour a contract test pins, or tightening an input type.
- **Capabilities** let the API grow without a major version. Atlas may ship a capability as experimental: present, documented and excluded from semver guarantees until promoted.
- **Record types are part of the contract on purpose.** When Atlas adds a field to a record type (a minor version), an extension that keeps a `Record<keyof TokenEntity, ...>` table fails to compile until its author decides what to do with the field. New data stays private by default.

`npm run api:check` regenerates the rollup, fails when `api-report/` differs from the committed copy, and fails when the report changed against `API_BASE_REF` (default `origin/beta`) without a change to `API_VERSION`.

## Deprecation

A deprecated function keeps working for at least two Atlas minor releases. It:

- logs one console warning per session;
- is marked `@deprecated` in the types;
- is listed in the changelog.

A major version is announced one release ahead.

## Connecting from an extension

```ts
import type { Plugin } from 'obsidian';
import type { AtlasApi, AtlasExtension } from '@atlas-vtt/api-types';

const REQUIRED_MAJOR = 1;

export class AtlasLink {
  private extension: AtlasExtension | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly plugin: Plugin) {}

  start(): void {
    // Atlas may already be ready, or may announce itself later (and again after a reload).
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('atlas-vtt:api-ready' as never, ((api: AtlasApi) => this.bind(api)) as never),
    );
    const atlas = (this.plugin.app as unknown as { plugins: { plugins: Record<string, { api?: AtlasApi }> } })
      .plugins.plugins['atlas-vtt'];
    if (atlas?.api) this.bind(atlas.api);
  }

  private bind(api: AtlasApi): void {
    if (Number.parseInt(api.version, 10) !== REQUIRED_MAJOR) return;
    this.unsubscribe?.();
    this.extension = api.connect(this.plugin);
    // Atlas is unloading: drop what we hold and wait for the next api-ready.
    this.unsubscribe = this.extension.on('unload', () => { this.extension = null; });
    if (api.has('views')) {
      // Use the capability's namespace here, for example this.extension.views.
    }
  }
}
```

`connect` validates its argument and scopes everything to `plugin.manifest.id`. Connecting again with the same id replaces the earlier registration rather than adding to it.

## No npm: vendor the report and the shared modules

The API types and the shared modules are not published to npm.

- `api-report/atlas-vtt-api.d.ts` is the rolled-up declaration file of `src/api/`. It is committed, and it imports nothing but `obsidian`. An extension vendors it as `@atlas-vtt/api-types`.
- `npm run build:packages` builds `src/shared/` into `dist-packages/shared` (gitignored). Atlas CI uploads that folder as an artifact. An extension vendors it as `@atlas-vtt/shared`.

Record the Atlas commit and the API version of every vendored copy, and verify the copy's hashes in your own CI.

## Who maintains what

- **The API maintainer** owns `src/api/`, `tests/api/`, `api-report/` and `src/shared/`. `.github/CODEOWNERS` routes changes to those paths to them, so a refactor that breaks a contract test pings them instead of blocking the Atlas maintainer.
- **The Atlas maintainer** owns Atlas internals and is free to change them. Only `src/api/` has to keep compiling and its tests passing.
- **Extensions** own everything else, in their own repositories.
