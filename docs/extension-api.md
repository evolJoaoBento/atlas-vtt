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
| 1.13.0 | shipped in 1.13.0 | none | `dice.throw`, `scenes.replaceMap` (optional) | none |
| 1.14.0 | shipped in 1.14.0 | none | none | none |
| 1.15.0 | shipped in 1.15.0 | none | none | none |
| 1.15.1 | shipped in 1.15.1 | none | none | none |

Dice events (`dice.onRolled`, `dice.roll`, `dice.publish`) use the main window's `document`, which popout windows share, so they reach every open map view and the player window.

Version 1.9.0 adds `presentationId` to a presented scene: the same while the scene is held and resumed, new for every presentation and never repeated after Atlas reloads. Version 1.10.0 makes `bundles.stripNoteProperties` remember its keys per extension id: they stay stripped when the extension is not loaded, and only the returned disposer forgets them, not the extension unloading.

Version 1.11.0 adds `bundles.forgetNoteProperties()`. Handing the disposer of `bundles.stripNoteProperties` to Obsidian's `this.register()` forgets the keys on every unload, so keep it for an extension that really stops stripping. The keys of an extension that crashed or was uninstalled stay until something calls that disposer or `forgetNoteProperties` (Atlas keeps them in its settings under `extensionNoteKeys`).

Version 1.13.0 adds `MenuItem.keepOpen`: a plain item with `keepOpen: true` leaves its menu open when chosen, for toggles picked several in a row. An open submenu runs its provider again after `ui.invalidate()`, so its checkmarks follow the change. An item in the menu itself also leaves it open, but its checkmark stays as it was when the menu opened; put toggles picked several in a row in a submenu. A submenu finds itself again by its label, so give the submenus among one menu's items distinct labels.

Version 1.13.0 also adds `dice.throw(viewId, roll)`, which throws a roll decided elsewhere with Atlas's own 3D dice in a GM map view or a remote view: seeded by the roll's id as Atlas's own throws are, in the user's dice look and speed, and once per roll id in each view (handing an id again throws nothing and answers true). It answers false when nothing is thrown: the view is not open or its map not loaded, its dice display is not showing, the user shows dice as result cards, or the roll is malformed (a die whose value is not a whole number from 1 to its `max` included); show the roll your own way then. Where the view cannot draw 3D dice, or the roll does not list all its dice, Atlas shows its own result card. It only throws: nothing is logged, `onRolled` hears nothing and the player window shows nothing, which is what `publish` is for. `publish` already throws a roll without `rolledBy` in every open GM map view; use `throw` for a roll you do not publish, or one published with `rolledBy`. In a remote view it shares the thrown ids with `RemoteView.throwRoll`.

Version 1.13.0 also moves more of the scene into `SavedMapInput`, as optional fields `scenes.readMap` returns and `scenes.addToCollection` writes: `pins` (with their note links), `walls`, `lights`, `lightZones`, `camera`, `tokenSettings` and `initiativeTrackerOpen`. A `readMap` result can be handed to `addToCollection` as it is.
- **Reading.** They are normalised as Atlas loads the map, so a file that lacks them reads as empty records, the camera at the origin, Atlas's token settings and a closed tracker. A camera that is not finite numbers with a scale above 0 reads as the default, and only the four known token settings of the right type are kept. Pin, wall and light entries are handed out as saved, also ones Atlas cannot read and skips. They are typed optional because an older Atlas leaves them out.
- **Writing.** A field left out is written as Atlas writes a new map, so a map without them gives the same file as before 1.13.0. A malformed field throws before anything is written: a pin must be `{ id, kind: 'pin', x, y, notePath }` with a plain vault path, the camera finite with a scale above 0, token settings of the right types, and walls, lights and light zones records by id. A pin's `notePath` is a vault path and is never rewritten as an image path; Atlas does not check that the note exists, so write the notes first and drop pins whose note you could not write. The tracker opens only for `initiativeTrackerOpen: true`.
- **What stays behind.** The GM's note on the map, the dice log, explored memory, pinned note previews and the loot roller are never read or written.

Version 1.13.0 also adds `scenes.replaceMap(sceneId, { map, images })`, which puts a newer version of a map in place of a scene's old one and keeps the scene's id, name, collection and map path. It takes the same input and checks as `addToCollection`, with images relative to the map file's folder; an image name already taken there gets a number.
- **Only your own scenes.** Atlas notes in its index (never in record files, exports or copies) which extension added a scene through `addToCollection`. Only that extension may replace the scene's map. Every other scene, including the GM's own maps and a copy of an added scene, is refused: the promise rejects and nothing is written. The note holds only for the map Atlas wrote: a record file (from another device, a sync conflict or a hand edit) that points the scene at another map drops it, and a scene whose map file is not inside its collection's folder is refused. The images Atlas wrote follow a rename in the vault.
- **Not while open.** A scene that is open in a map view, also as a scene tab that is not shown, is refused, so an open view never saves over the new map. Ask the GM to close it first. The check runs again just before the map file is written; a tab opened in the moment between that check and the write is not caught.
- **Order.** The new images are written first, then the map file. Only then are images removed, and only images Atlas itself wrote for this scene (through `addToCollection` or an earlier `replaceMap`; the index keeps the list) that the new map, another asset, another scene's map and resolved note links no longer use. No other file is ever removed, even one the old map named. If a write fails, the images it wrote are removed and the old map is put back.
- **The GM's play stays.** The GM's note link, the dice log, pinned note previews and the loot roller are carried over from the old file. Explored memory resets, since it belongs to the old map's layout.

Extension data on scenes (`scenes.setData`) lives only in Atlas's asset index, never in the scene's record file, so it travels in no bundle and no copy. When Atlas cannot read the index and rebuilds it from the collection files, that data is lost, because the files do not hold it.

Version 1.14.0 follows Atlas 0.6, where a scene can set its own distance per cell. `GridState` gains `unitDistanceOverride` (unset: the collection's), and `MeasurementSettings` gains `ruleDistance`, the collection's distance per cell that distances written in squares convert with; `unitDistance` is the scene's where it sets one. `rules.forMap` gives the collection's settings; `resolveMeasurementSettings(gridDefaults, snapshot.grid)` from `@atlas-vtt/shared/grid` gives the scene's. `RemotePlayerState.measurement` may leave `ruleDistance` out, and then it is `unitDistance`.

Version 1.15.0 adds `ToolbarItem.isVisible(ctx)`, which decides per view whether the item shows, among the `views` it is for. Only `true` shows it; a hidden item takes no room in the bar and is not in "More tools", and `ui.invalidate()` asks again. Its context adds `ownRemote`, true in a remote view the asking extension opened, so a button that acts on your own remote view can stay out of other extensions' remote views. A predicate that throws hides the item and is logged once.

Version 1.15.0 also adds `RemoteStatus.actions`, status bar buttons `{ id, label, icon? }` after the single `action`, at most 3 buttons in all with it, and `RemoteView.onStatusAction(listener)` (optional), told the id of the one chosen; call it as `view.onStatusAction?.(...)` to run on 1.14 too. `action` keeps running its own `run`. More than 3 buttons in all, an id given twice, or an entry of `actions` with an empty id, label or icon throws. A label past the button's width truncates, keeping its icon.

Version 1.15.0 also adds `setCamera(camera, { padded: true })`, which leaves the margin the remote view's Fit map (Shift+1) leaves around the map (16 screen pixels), so a Fit button of your own frames its area the way Shift+1 does.

Version 1.15.0 also keeps what `setPlayer` writes when it did not change: each part (the movable tokens, the measurement, the condition and resource definitions, the initiative rules and the HP bars) equal by value to the one shown keeps its object, so the initiative list and the badges are not drawn again, and a state equal to the last one writes nothing.

Version 1.15.1 checks the grid of `RemoteView.setScene`, `scenes.addToCollection` and `scenes.replaceMap`: its numbers must be finite, its `size` at least 4 px and at most 2,000 cells along a side of the map (for a saved map, when Atlas can read the background image's size), and its `type` and `lineType` known values; anything else throws before anything is shown or written. Atlas draws no grid at all for a size of 0 or less, or past 2,000 cells along a side, wherever it comes from.

Rows marked planned are not in the running Atlas yet. The report in `api-report/atlas-vtt-api.d.ts` is the source of truth for what the running version contains.

### Atlas 0.6

What changed for extensions with Atlas 0.6 besides version 1.14.0:

- **Library sync.** Atlas keeps its library in record files that sync tools carry between devices; the asset index in `atlas-vtt/.atlas-data/` is each device's cache of them. Atlas never writes extension data, or the note of which extension added a scene and the images it wrote, to the library files, and never takes them from one: a record file that arrives from another device, or that someone edits or copies by hand, neither removes nor adds any. A scene whose record file moves (another device moved it to another collection) and that comes back from its new path in a later read keeps its data for as long as Atlas runs; a scene whose file disappears and comes back only after Atlas restarted has lost it on this device. Saving extension data is no edit of the scene: its `modifiedAt` and record file stay as they were. So `scenes.getData` answers on the device that wrote the data, and `scenes.replaceMap` accepts only scenes added on that device; elsewhere the same scene is the GM's. A sync tool set to carry dot folders as well (Remotely Save and Self-hosted LiveSync can be) copies the whole index, extension data included, with it: the device that saved last then wins, as with any file such a tool carries.
- **Toolbar items.** Atlas 0.6 lets the GM reorder and hide the toolbar's controls, and the bar now moves controls into "More tools" from its right end. Extension items sit together right after the dice button (before the Command palette when there is none), and `ToolbarItem.priority` orders them among themselves: a higher priority sits further left, so lower priorities move into "More tools" first. The GM's toolbar editor arranges Atlas's controls only; extension items are not in it and leave the bar while it is open.
- **Language.** Atlas follows Obsidian's language. Texts Atlas shows around what extensions add (the panel's close button, the eye's menu, notices) are translated; the labels, titles and messages an extension gives are shown as given. Errors thrown to an extension stay in English. The `@atlas-vtt/shared` packages carry no translations: their texts (laser colours, map icons, token sizes) stay in English.
- **Links in notes.** Notes can link and embed scenes, their snapshots (`[[Tavern.atlasmap#Snapshot name]]`) and encounters. Those links are note text that names the map file, so `scenes` and `bundles` do not track them: `replaceMap` keeps the map path and the scene id (its snapshots stay with it), so links to the scene keep working; a scene `addToCollection` adds has a new path no link names yet. Embeds draw a card, not a map view, so they never appear in `views.list()`.

## Remote views (`remote-view`, 1.12.0)

**From 1.12.0, `views.list()`, `map-loaded` and `map-closed` include remote views**, with `kind: 'remote'` and the map path `remote:<viewId>` once a scene is shown. An extension that picks, hosts or presents GM map views filters on `kind === 'map'`.

`remoteViews` is set only when `api.has('remote-view')`. `remoteViews.open({ title, icon?, reuse?, maxDice? })` opens a tab of type `atlas-vtt-remote`, owned by the calling extension, and resolves to a `RemoteView` handle. With `reuse` it reveals the extension's remote view that is already open; that view keeps its own title, icon and `maxDice`. `maxDice` (a whole number from 1 to 100, default 100) is the most dice its tray offers for one roll: pass the limit your own roll path takes. The view is an Atlas map view fed from outside: read-only, never saved, with no undo history, and it closes when the extension or Atlas unloads. A tab Obsidian restores at startup, or a copy of the tab, has no owner and closes itself.

- **Scene.** `setScene(input)` shows a `RemoteSceneInput`: Atlas's own records, the background and each token's image by a `blob:`, `data:` or `https:` URL (release an object URL only after replacing it), the grid, widgets and initiative. The scene is read once: the background, the image URLs and the grid are copied and checked, so a getter or a later change cannot get past the checks. The records are copied, and a record handed again as the same object is not copied again, so keep unchanged records as the same objects; a grid, widgets or initiative equal by value to the shown one keep it. A record that is not plain data (a function, a typed array) throws and the scene shown stays. The snapshot (`views.snapshot(viewId)`) is loaded with the map path `remote:<viewId>`. `setScene(null)` shows an empty, unloaded scene. The initiative list shows whenever `initiative.entries` is non-empty; send an empty initiative to hide it. A token's `notePath` and `statblockPath` are dropped, whatever its kind, and so is a combatant's `statblockPath` and an `imagePath` that is no such URL: they are another vault's paths, and the view never reads the player's vault by them. Map sides are at most 100,000 pixels, and a malformed input throws and changes nothing.
- **Player.** `setPlayer(state)` says which tokens the player may drag, the measurement of the ruler and the measure tool, the definitions of the condition badges and of each token's bars (decided per token: a definition with `visibleToPlayers: false` draws no bar on that token but still downs it), and the initiative list's rules and HP bars. A part equal by value to the one shown is kept as it is, so resending the whole state redraws only what changed.
- **Moves.** The player drags a movable token with Atlas's drag and ruler, one at a time. `onTokenDrop` reports the drop at the point it snaps to in the view's grid; the token goes back until the next `setScene` moves it. `cancelDrag()` ends a drag in progress, and a new scene or player state ends a drag whose token left the scene or may no longer move.
- **Camera.** `setCamera(camera, { animate, padded })` shows a world area as large as fits the view, with the remote view's Fit map margin around it when `padded`, and keeps showing it through resizes. `onCameraMoved(true)` fires when the player pans or zooms, and `onCameraMoved(false)` when Fit map (Shift+1) fits the map. Following someone stays the extension's decision: add Follow and Fit buttons as toolbar items with `views: ['remote']`, and `isVisible: (ctx) => ctx.ownRemote` to keep them out of other extensions' remote views.
- **Dice.** The dice tray, at most the view's `maxDice` (100 by default), and the dice log's Roll again go to `onRoll` listeners and never roll locally. Listeners are asked in the order they were added until one returns null (sent); otherwise the tray shows the first reason returned. `setDiceLog(entries)` is the log the view's dice log shows, without Clear. `throwRoll(result)` throws one of the player's own rolls once per id with their dice look, or shows a result card where WebGL is unavailable.
- **Status.** `setStatus(status)` fills the status bar at the start of the top row; its optional `action` is a button, and `actions` follow it, at most 3 buttons in all, each telling `onStatusAction` its id. A long message gives way to the buttons, then a long button label truncates.
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
