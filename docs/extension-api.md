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
| 1.12.0 | shipped in 1.12.0 | `remote-view` | `remoteViews` (optional) | none |
| 1.13.0 | shipped in 1.13.0 | none | none | none |

Dice events (`dice.onRolled`, `dice.roll`, `dice.publish`) use the main window's `document`, which popout windows share, so they reach every open map view and the player window.

Version 1.9.0 adds `presentationId` to a presented scene: the same while the scene is held and resumed, new for every presentation and never repeated after Atlas reloads. Version 1.10.0 makes `bundles.stripNoteProperties` remember its keys per extension id: they stay stripped when the extension is not loaded, and only the returned disposer forgets them, not the extension unloading.

Version 1.11.0 adds `bundles.forgetNoteProperties()`. Handing the disposer of `bundles.stripNoteProperties` to Obsidian's `this.register()` forgets the keys on every unload, so keep it for an extension that really stops stripping. The keys of an extension that crashed or was uninstalled stay until something calls that disposer or `forgetNoteProperties` (Atlas keeps them in its settings under `extensionNoteKeys`).

Version 1.13.0 adds `MenuItem.keepOpen`: a plain item with `keepOpen: true` leaves its menu open when chosen, for toggles picked several in a row. An open submenu runs its provider again after `ui.invalidate()`, so its checkmarks follow the change; the items of the menu itself are read when it opens.

Extension data on scenes (`scenes.setData`) lives only in Atlas's asset index, never in the scene's record file, so it travels in no bundle and no copy. When Atlas cannot read the index and rebuilds it from the collection files, that data is lost, because the files do not hold it.

Rows marked planned are not in the running Atlas yet. The report in `api-report/atlas-vtt-api.d.ts` is the source of truth for what the running version contains.

## Remote views (`remote-view`, 1.12.0)

**From 1.12.0, `views.list()`, `map-loaded` and `map-closed` include remote views**, with `kind: 'remote'` and the map path `remote:<viewId>` once a scene is shown. An extension that picks, hosts or presents GM map views filters on `kind === 'map'`.

`remoteViews` is set only when `api.has('remote-view')`. `remoteViews.open({ title, icon?, reuse?, maxDice? })` opens a tab of type `atlas-vtt-remote`, owned by the calling extension, and resolves to a `RemoteView` handle. With `reuse` it reveals the extension's remote view that is already open; that view keeps its own title, icon and `maxDice`. `maxDice` (a whole number from 1 to 100, default 100) is the most dice its tray offers for one roll: pass the limit your own roll path takes. The view is an Atlas map view fed from outside: read-only, never saved, with no undo history, and it closes when the extension or Atlas unloads. A tab Obsidian restores at startup, or a copy of the tab, has no owner and closes itself.

- **Scene.** `setScene(input)` shows a `RemoteSceneInput`: Atlas's own records, the background and each token's image by URL (object URLs work; release one only after replacing it), the grid, widgets and initiative. The records are copied, and a record handed again as the same object is not copied again, so keep unchanged records as the same objects. The snapshot (`views.snapshot(viewId)`) is loaded with the map path `remote:<viewId>`. `setScene(null)` shows an empty, unloaded scene. The initiative list shows whenever `initiative.entries` is non-empty; send an empty initiative to hide it. A token's `notePath` and `statblockPath` are dropped: they are another vault's paths, and the view never reads the player's notes by them. Map sides are at most 100,000 pixels, and a malformed input throws and changes nothing.
- **Player.** `setPlayer(state)` says which tokens the player may drag, the measurement of the ruler and the measure tool, the definitions of the condition badges and of each token's bars (decided per token: a definition with `visibleToPlayers: false` draws no bar on that token but still downs it), and the initiative list's rules and HP bars.
- **Moves.** The player drags a movable token with Atlas's drag and ruler, one at a time. `onTokenDrop` reports the drop at the point it snaps to in the view's grid; the token goes back until the next `setScene` moves it. `cancelDrag()` ends a drag in progress, and a new scene or player state ends a drag whose token left the scene or may no longer move.
- **Camera.** `setCamera(camera, { animate })` shows a world area as large as fits the view and keeps showing it through resizes. `onCameraMoved(true)` fires when the player pans or zooms, and `onCameraMoved(false)` when Fit map (Shift+1) fits the map. Following someone stays the extension's decision: add Follow and Fit buttons as toolbar items with `views: ['remote']`.
- **Dice.** The dice tray (up to 100 dice) and the dice log's Roll again go to `onRoll` listeners and never roll locally. Listeners are asked in the order they were added until one returns null (sent); otherwise the tray shows the first reason returned. `setDiceLog(entries)` is the log the view's dice log shows, without Clear. `throwRoll(result)` throws one of the player's own rolls once per id with their dice look, or shows a result card where WebGL is unavailable.
- **Status.** `setStatus(status)` fills the status bar at the start of the top row; its optional action is a button.
- **Other groups.** `views.*` and `lasers.*` take the remote view's id. `views.active()` never returns it, `tokens.move` answers `not-loaded` and `presentation.present` answers false for it, as do Atlas's own Present commands.
- **Lighting.** `lighting.playerVisibility` and `lighting.watch` answer for a remote id from the remote view's own store, which has no lighting: pending until a scene is shown, then unlit, so everything in it is what that player sees. A lit scene's darkness is the owner's to send, as fog.
- **Scenes.** `scenes.*` never knows a `remote:` path: `findByMap` finds nothing for one, and `readMap` throws on it, as on any path that is not an `.atlasmap` file.

Every handle method does nothing after the view closed, every listener runs guarded and is dropped when it closes, and `onClose` fires once, however the view closed.

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
- `npm run build:packages` builds `src/shared/` into `dist-packages/shared` (gitignored). Atlas CI uploads that folder as an artifact. An extension vendors it as `@atlas-vtt/shared`. Its entries are `grid`, `draw`, `rules`, `dice3d` (needs three.js) and `diceDisplay` (how a roll is presented and the six tray icons, without three.js; `dice3d` re-exports it).

Record the Atlas commit and the API version of every vendored copy, and verify the copy's hashes in your own CI.

## Who maintains what

- **The API maintainer** owns `src/api/`, `tests/api/`, `api-report/` and `src/shared/`. `.github/CODEOWNERS` routes changes to those paths to them, so a refactor that breaks a contract test pings them instead of blocking the Atlas maintainer.
- **The Atlas maintainer** owns Atlas internals and is free to change them. Only `src/api/` has to keep compiling and its tests passing.
- **Extensions** own everything else, in their own repositories.
