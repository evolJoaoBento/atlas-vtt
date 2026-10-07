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
| 1.16.0 | shipped in 1.16.0 | `dice-looks` | `dice.registerLook` (optional) | none |
| 1.17.0 | shipped in 1.17.0 | `scene-tabs` | `views.showTab`, `ui.addSceneTabMenuSection` (optional) | `tabs-changed` |
| 1.18.0 | shipped in 1.18.0 | `asset-tabs`, `collections` | `ui.addAssetTab`, `ui.addCollectionSettingsTab`, `collections` (optional) | `collections-changed` |

`dice.onRolled` hears every roll Atlas logs once, whichever map view or window made it (`dice.roll` and `dice.publish` included); Atlas no longer announces rolls as a `document` event. Since Atlas keeps each map view's rolls in that view (see Atlas 0.6.1 below), `roll` and `publish` hand their roll to every open GM map view, whose log, toasts and sounds show it, and to the player window through the view it presents; a remote view shows only its owner's log.

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

Version 1.15.1 checks the grid of `RemoteView.setScene`, `scenes.addToCollection` and `scenes.replaceMap`: the numbers it sets must be finite, its `size` at least 4 px and at most 2,000 cells along a side of the map (for a saved map, when Atlas can read the background image's size), its offsets within 100,000 px, and its `type` and `lineType` known values; anything else throws before anything is shown or written. Atlas draws no grid at all for a size of 0 or less, or past 2,000 cells along a side, wherever it comes from, and a saved grid whose origin lies farther than 100,000 px away is moved next to the map by whole cells when the map loads, which draws the same grid.

Version 1.16.0 bounds the fog a remote view works out. Since Atlas 0.6.1 fog is one clipped shape that most changes replay operation by operation, which takes seconds for a few thousand operations. `RemoteView.setScene` shows at most 2,000 fog operations (`objects.fog`), 200,000 brush and lasso points in all and 10,000 in one operation, and brushes whose radius is at most the map's longer side (100,000 px while the background's size is 0 × 0). A scene over any of these fails closed: the view covers the whole map with fog and leaves every token out, as Atlas does for fog it cannot draw, and its status bar says the scene has too much fog to show, in Atlas's language. It does not throw, the rest of the scene shows. Send fewer operations and points (merge or simplify them, or drop the oldest under a cover) to show the fog itself. A fog record (like any record) handed as a new object but equal by value to the one shown keeps it, so sending the same fog again works nothing out anew.

Version 1.16.0 also adds `dice.registerLook(spec)` (optional, with the `dice-looks` capability): a dice look the GM can choose in Atlas's dice settings and the command palette's Dice settings, after Atlas's own. Atlas keeps its dice, throw, sounds and results; the look changes only the faces and the body's colour, on every die Atlas throws in 3D (the dice tray, the player window, remote views, `dice.throw`). See Dice looks below.

Version 1.16.0 also lets a die carry a tag: `DiceRollResult.rolls[]` entries take optional `color` (`#rrggbb`) and `colorName` (e.g. `"Fire"`), the shape Atlas's physical dice write, so rolls move between the two unchanged. Atlas only carries, saves and shows them: they never change a result. `dice.publish`, `dice.throw`, `RemoteView.setDiceLog` and `RemoteView.throwRoll` keep a `color` that is `#rrggbb` and a `colorName` that is plain text (any script, emoji and punctuation, but no `<`, `>`, `[`, `]`, backticks, control or invisible formatting characters; trimmed, at most 32 characters) and drop any other, never the roll. Tags are saved with the map's dice log, and an older log reads as before. The dice log, the toasts, the player window and remote views list tagged dice grouped under their tag, a dot of the colour and its name (or the colour's code without a name); a roll without tags shows as before. Atlas's 3D dice are not tinted by a tag.

Version 1.16.0 also adds an optional second argument to `dice.publish(roll, { throw })`. `throw` defaults to true, as before: a roll without `rolledBy` is thrown with Atlas's 3D dice in every open GM map view. With `throw: false` the roll is logged, toasted (with the result card's sound) and reaches the player window and `onRolled` exactly as before, but Atlas shows it as a result card instead of throwing it, for dice an extension has shown already (a physical dice plugin's own throw). Options that are not `{ throw?: boolean }` throw. An extension written for 1.15 that passes no second argument behaves as before; one that passes it to an older Atlas has it ignored.

Version 1.17.0 adds the `tabs-changed` event (with the `scene-tabs` capability): a GM map view's tabs changed (one was opened, closed, moved or renamed) or its active tab did. It fires once per view per microtask, however many changes that microtask made, with the view's `ViewInfo` as it is then, and never for a remote view; marking a tab dirty or loaded fires nothing. Until 1.17.0 nothing told an extension that a background tab closed or was renamed. `map-loaded` and `map-closed` are unchanged.

Version 1.17.0 also adds `SceneSnapshot.tabId`: the tab whose scene the snapshot holds, set once `loaded`, and null while a map loads and in remote views. When the GM switches tabs Atlas makes the next tab active before it loads that tab's map, so for a moment `ViewInfo.activeTabId` names the next tab while the store still holds the previous one's scene; `tabId` is null then. A snapshot whose `tabId` names a tab always holds that tab's scene, and one without a `tabId` is no tab's: attribute a scene by `loaded && tabId`, never by `activeTabId`. `views.subscribe` hears `tabId` change too.

Version 1.17.0 also adds `views.showTab(viewId, tabId)` (optional): it makes a tab of a GM map view active without presenting it, and answers true once that tab's map is loaded. It answers false, and never throws, for a closed, unknown or remote view, an unknown tab, a switch that failed, or when another switch (another `showTab`, the GM's click) overtook it. The presented scene holds while the view shows another tab, as on any switch, and resumes when the GM returns to it. Until 1.17.0 only `presentation.present` switched tabs, and it also presented.

Version 1.17.0 also adds `ui.addSceneTabMenuSection(section)` (optional, with `scene-tabs`): a section in the menu that right-clicking a scene tab's eye opens, or the context-menu key or Shift+F10 with the eye focused. `section` is `{ heading, items(context) }`: `heading` is shown as a label row (plain text, trimmed, at most 40 characters; an empty one throws) and `items` is told the tab (`viewId`, `tabId`, `mapPath`, `name`, whether it is the view's active tab and whether it is Atlas's presented tab, held or not) and answers the section's items; `[]` leaves it out. The menu lists Atlas's own "Open player window" while a presentation target is active, then each section after a separator, and from 1.17.0 it opens whenever it has something to show, not only while a target is active. While it is open it reads every section again after `ui.invalidate()` and whenever the view's tabs or the presented scene change, so a top-level item's checkmark follows, and it stays open while an item's action makes its tab active. An `items` that throws leaves its section out and is logged once.

From 1.17.0 the scene-tab menu's own items follow `ui.invalidate()` too, unlike the items of a map's More options and a token's menu (the 1.13.0 note above).

Version 1.17.0 also adds `PresentationTarget.tabBadge(tab)` (optional, read with `scene-tabs`): a short mark after a scene tab's eye, such as "2 players", or null for none. `tab` is `{ viewId, tabId }`. It is asked only while the target is active, on render and after `ui.invalidate()`, and the first active target's non-null mark wins. The mark is plain text, trimmed and at most 24 characters (a longer one is cut with "…"). A tab with a mark draws its eye as shown even when it is not the presented tab, and the mark joins the eye's accessible name; what clicking the eye does is unchanged. A `tabBadge` that throws or answers something other than a string or null shows no mark and is logged once; one that is given but is not a function makes `addTarget` throw.

Version 1.18.0 adds `ui.addAssetTab({ id, title, icon, mount })` (optional, with the `asset-tabs` capability): a tab in the asset manager after Scenes, Maps, Encounters and Tokens, with the extension's icon and title and no count. Choosing it shows what `mount(container, { collectionId })` renders in place of the asset grid (the breadcrumb and filters go with it), for the collection the asset manager shows; picking another collection runs the disposer and mounts again with the new `collectionId`, and leaving the tab, closing the asset manager or removing the tab runs the disposer. The context is frozen. Keys pressed inside the container stay there, all but Escape, which still closes the asset manager, so Atlas's own shortcuts (Tab between tabs, select all) never act behind the extension's controls. Render inside the container: a press outside the asset manager closes it. The asset manager reopens on Atlas's tab it was on, never on an extension's. A mount or disposer that throws is logged; `id`, `title` and `icon` must be non-empty strings and `mount` a function, and an `id` this extension already added throws.

Version 1.18.0 also adds the `collections` namespace (optional, with the `collections` capability). `list()` gives every collection as `{ id, name }` (a collection is named like its folder), and `getData(collectionId)` and `setData(collectionId, value)` keep this extension's own data on a collection, by the same rules as `scenes.getData` and `setData`: plain JSON, copied in and handed out frozen, `null` clears it, and each extension sees only its own. It lives in Atlas's asset index alone, beside the collection records: never in the collection's `collection.json`, an export, an install or a copied folder, and saving it is no edit of the collection (its file and `modifiedAt` stay as they were). Renaming a collection, in Atlas or outside Obsidian, keeps it; deleting one takes it along, so a new collection of the same name starts without it. Like extension data on scenes it stays on the device that wrote it, and goes when Atlas has to rebuild its index from the library files. `setData` rejects for a collection that does not exist, and every call rejects when the asset index could not load. The `collections-changed` event fires when collections are added, removed or renamed, or when any extension's data on one changes; read again then.

Version 1.18.0 also adds `ui.addCollectionSettingsTab({ id, title, icon?, mount })` (optional, with `collections`): a tab in a collection's settings dialog after Atlas's own, with the extension's icon (a Lucide name, `puzzle` when left out) and title. Choosing it shows what `mount(container, { collectionId })` renders in place of Atlas's tab; choosing another tab, closing the dialog or removing the tab runs the disposer. The dialog's Save button saves Atlas's own settings only: what the tab changes is the extension's to save, at once, typically with `collections.setData`. Keys pressed inside the container stay there, all but Escape, which closes the dialog. The context is frozen, and a mount or disposer that throws is logged.

Rows marked planned are not in the running Atlas yet. The report in `api-report/atlas-vtt-api.d.ts` is the source of truth for what the running version contains.

### Atlas 0.6

What changed for extensions with Atlas 0.6 besides version 1.14.0:

- **Library sync.** Atlas keeps its library in record files that sync tools carry between devices; the asset index in `atlas-vtt/.atlas-data/` is each device's cache of them. Atlas never writes extension data, or the note of which extension added a scene and the images it wrote, to the library files, and never takes them from one: a record file that arrives from another device, or that someone edits or copies by hand, neither removes nor adds any. A scene whose record file moves and that comes back from its new path in a later read keeps its extension data for as long as Atlas runs, and keeps the note of which extension added it, and the images Atlas wrote, only while its map path stays the same: a file that points the scene at another map (another device moved the scene to another collection, or the file was edited) drops them, so `replaceMap` then refuses it on this device. A scene whose file disappears and comes back only after Atlas restarted has lost all of it on this device. Saving extension data is no edit of the scene: its `modifiedAt` and record file stay as they were. So `scenes.getData` answers on the device that wrote the data, and `scenes.replaceMap` accepts only scenes added on that device; elsewhere the same scene is the GM's. A sync tool set to carry dot folders as well (Remotely Save and Self-hosted LiveSync can be) copies the whole index, extension data included, with it: the device that saved last then wins, as with any file such a tool carries.
- **Toolbar items.** Atlas 0.6 lets the GM reorder and hide the toolbar's controls, and the bar now moves controls into "More tools" from its right end. Extension items sit together right after the dice button (before the Command palette when there is none), and `ToolbarItem.priority` orders them among themselves: a higher priority sits further left, so lower priorities move into "More tools" first. The GM's toolbar editor arranges Atlas's controls only; extension items are not in it and leave the bar while it is open.
- **Language.** Atlas follows Obsidian's language where it has a translation, and English otherwise. Texts Atlas shows around what extensions add (the panel's close button, the eye's menu, notices) go through its translations; they are written in English so far, so other languages show them in English until they are translated. The labels, titles and messages an extension gives are shown as given. Errors thrown to an extension stay in English. The `@atlas-vtt/shared` packages run outside Obsidian and carry Atlas's English texts (laser colours, map icons, token sizes, the roller's name).
- **Links in notes.** Notes can link and embed scenes, their snapshots (`[[Tavern.atlasmap#Snapshot name]]`) and encounters. Those links are note text that names the map file, so `scenes` and `bundles` do not track them: `replaceMap` keeps the map path and the scene id (its snapshots stay with it), so links to the scene keep working; a scene `addToCollection` adds has a new path no link names yet. Embeds draw a card, not a map view, so they never appear in `views.list()`.

### Atlas 0.6.1

What changed for extensions with the Atlas 0.6.1 betas, in API 1.15.1 (no type changed shape):

- **Dice stay in their map view.** Atlas's dice tray, statblocks and the dice log's Roll again log a roll in the view that made it only, and the player window follows the view it presents. `dice.onRolled` still hears each of them once. `dice.roll` and `dice.publish` still reach every open GM map view, as before.
- **Formulas Atlas does not roll.** `dice.roll` checks the formula before any die is rolled, as the dice tray does: at most 64 characters, 10 terms, 100 dice and 1,000 faces per die, constants of up to four digits, and nothing but dice, numbers, `+`, `-`, spaces and exploding notation (`!`, `!!`, `!3`, `!i`). Anything else throws `[Atlas API] dice.roll: …` and nothing is rolled or logged; a formula `diceFormula` builds from at most 100 dice and a modifier of at most four digits always passes. An empty formula, like a bare bonus such as `+3`, rolls the rules' default roll. `dice.publish` and `dice.throw` take rolls decided elsewhere and still check only the roll itself (plain data, at most 1,000 dice): their `formula` is the text Atlas shows. `rollFormula` in `@atlas-vtt/shared/rules` throws `DiceFormulaError` for the same formulas.
- **Fog hides tokens from players.** The player window leaves out every token under committed fog, lit scene or not, and while the fog cannot be drawn it covers the whole map. `lighting.playerVisibility` answers the same: a token under fog is `'unseen'`, and fog Atlas cannot draw makes it `pending`. `lighting.watch` fires when the fog changes. While the answer is `unlit`, apply hidden tokens and fog yourself, as before.
- **GM-hidden tokens give players no sight.** A token the GM hid neither sees nor explores for the players any more, so `playerVisibility` shows nothing that only a hidden token's vision would show, and the hidden token itself is `'unseen'`. Areas explored before stay in the memory.
- **Door badges** under fog no longer show to players. The API hands out no walls or doors, so this changes no answer.

## Rules every group follows

- **Frozen data.** What Atlas hands an extension from its own state is frozen, to its depth: store records by reference once Atlas has frozen them, frozen copies otherwise. Changing it throws in strict mode and never reaches Atlas. A list or result object built fresh for one call (`views.list()`, `scenes.list()`, the outer result of `tokens.move`) is the extension's own and may be unfrozen.
- **Read once, then checked.** Input is read once (every field, every getter) and Atlas checks and keeps what it read, never the extension's object; a later change to that object changes nothing.
- **Guarded callbacks.** Every listener and callback runs guarded: a throw is logged and Atlas carries on. Each is dropped when its view closes, when the extension unloads, or when Atlas unloads.
- **Listeners.** A listener that is not a function (or `on` with an event Atlas does not have) registers nothing, gets a disposer that does nothing, and is logged once. `ui.*` registrations, which describe an item rather than listen, throw instead.
- **Disposers.** Every disposer may be called more than once; the second call does nothing.
- **Errors.** A malformed call throws (an async call rejects) with `[Atlas API] <namespace>.<method>: <what is wrong>`, in English whatever Atlas's language.
- **Optional members.** From 1.12.0 on, a member added to a namespace that already shipped is typed optional (`dice.throw`, `scenes.replaceMap`, `RemoteView.onStatusAction`, `dice.registerLook`, `views.showTab`, `ui.addSceneTabMenuSection`, `PresentationTarget.tabBadge`, `SceneSnapshot.tabId`, `ui.addAssetTab`, `ui.addCollectionSettingsTab`, `collections`), so call it as `extension.dice.throw?.(...)`. Earlier additions (`bundles.forgetNoteProperties`, 1.11.0) and the members of the 1.1.0 to 1.8.0 namespaces are required. Whole namespaces are gated by `has()`.
- **Unknown views.** A call naming a view that is not open never throws: it answers `null`, `false` or a pending result, or gives a disposer that does nothing.

## Reference by group

The report (`api-report/atlas-vtt-api.d.ts`) has every member with its JSDoc; this is what each group is for and how it behaves.

- **`views`.** `list()` and `active()` describe the open map views (`active()` never a remote view); `snapshot(viewId)` gives the scene in a view's store, and `subscribe` hears each store change that replaced one of its fields. `camera(viewId)` gives the visible world area and `watchCamera` hears it after every viewport frame. `map-loaded` fires once per map load, `map-closed` when a view closes. With `scene-tabs` (1.17.0), `tabs-changed` fires when a GM map view's tabs or active tab change, a snapshot's `tabId` names the tab whose scene it holds (null while loading), and `showTab(viewId, tabId)` opens a tab without presenting it; see Scene tabs below.
- **`rules`.** `forMap(mapPath)` gives the collection's grid defaults, measurement (with the GM's cone angle), dice, initiative, conditions and resources, or Atlas's defaults outside a collection. `rules-changed` names the collection whose rules changed, or `null` once the asset index has loaded.
- **`settings`.** `get(key)` reads one of the four settings an extension may know (`laserPointer`, `diceLook`, `diceDisplay`, `playerView`); `settings-changed` names a key whose value changed. Read-only.
- **`storage`.** `folder()` creates and returns `atlas-vtt/.atlas-data/extensions/<extension id>/`, a dot folder Obsidian does not index; the id must be kebab-case.
- **`presentation`.** `current()` gives the presented scene (also while held), `present(viewId, tabId?)` presents a tab and `stop()` stops; `subscribe` hears `presented`, `held` and `cleared`, each with a `presentationId` that names one presentation. `addTarget` adds an audience besides the player window, which changes what the scene tab's eye does while it is active. With `scene-tabs` (1.17.0) a target's `tabBadge` marks scene tabs next to their eye.
- **`dice`.** `roll` rolls by a map's collection rules (optionally for someone, `rolledBy`); `onRolled` hears every roll Atlas logs; `publish` adds a roll made elsewhere to the log, toasts and sounds, thrown in 3D unless `{ throw: false }`; `throw` throws a decided roll with Atlas's 3D dice in one view and logs nothing. A roll result is plain data with at most 1,000 dice; each die may carry a tag (`color`, `colorName`, 1.16.0) that Atlas shows and saves with it.
- **Dice looks** (`dice-looks`). `dice.registerLook(spec)` adds a look; see Dice looks below.
- **`lasers`.** `onLocal(viewId)` hears each point of the GM's laser and its lift; `show(viewId, laser)` draws someone else's laser, fading like Atlas's own. A laser not heard from for a second is let go.
- **`lighting`.** `playerVisibility(viewId)` says what the player window shows of a lit scene, token by token and cell by cell; it fails closed (`pending`) whenever Atlas cannot tell yet. `watch` hears when that answer may have changed.
- **`tokens`.** `move(viewId, moves)` moves tokens like a GM drop, as one undo step, and answers why when it moves none; `snapPoint` says where a dropped token lands.
- **`ui`.** Toolbar buttons, command palette sections, dashboard tiles, entries in a map's More options and a token's menu, and floating panels, with `scene-tabs` (1.17.0) a section in a scene tab eye's menu (`addSceneTabMenuSection`), with `asset-tabs` (1.18.0) a tab of the asset manager (`addAssetTab`), and with `collections` (1.18.0) a tab of a collection's settings (`addCollectionSettingsTab`); `invalidate()` has Atlas read the callbacks again. Each `add*` throws for a malformed item.
- **`scenes`.** `list()` and `findByMap` read the scene records; `getData` and `setData` keep this extension's own data on a scene (index only, never exported); `readMap` reads a saved map without opening it; `addToCollection` adds a scene with its images in one step, and `replaceMap` replaces the map of a scene this extension added. They reject when the asset index could not load.
- **`collections`** (`collections`, 1.18.0). `list()` reads the collections; `getData` and `setData` keep this extension's own data on a collection (index only, never exported or copied); `collections-changed` fires when collections or that data change.
- **`bundles`.** `stripNoteProperties(keys)` keeps note properties out of collection exports and installs, remembered per extension; `forgetNoteProperties()` forgets them.
- **`remoteViews`** (`remote-view`). A read-only map view an extension feeds; see Remote views below.

## Remote views (`remote-view`, 1.12.0)

**From 1.12.0, `views.list()`, `map-loaded` and `map-closed` include remote views**, with `kind: 'remote'` and the map path `remote:<viewId>` once a scene is shown. An extension that picks, hosts or presents GM map views filters on `kind === 'map'`.

`remoteViews` is set only when `api.has('remote-view')`. `remoteViews.open({ title, icon?, reuse?, maxDice? })` opens a tab of type `atlas-vtt-remote`, owned by the calling extension, and resolves to a `RemoteView` handle. With `reuse` it reveals the extension's remote view that is already open; that view keeps its own title, icon and `maxDice`. `maxDice` (a whole number from 1 to 100, default 100) is the most dice its tray offers for one roll: pass the limit your own roll path takes. The view is an Atlas map view fed from outside: read-only, never saved, with no undo history, and it closes when the extension or Atlas unloads. A tab Obsidian restores at startup, or a copy of the tab, has no owner and closes itself.

- **Scene.** `setScene(input)` shows a `RemoteSceneInput`: Atlas's own records, the background and each token's image by a `blob:`, `data:` or `https:` URL (release an object URL only after replacing it), the grid, widgets and initiative. The scene is read once: the background, the image URLs and the grid are copied and checked, so a getter or a later change cannot get past the checks. The records are copied, and a record handed again as the same object is not copied again, so keep unchanged records as the same objects (from 1.16.0 a record equal by value is kept too, after one comparison); a grid, widgets or initiative equal by value to the shown one keep it. A record that is not plain data (a function, a typed array) throws and the scene shown stays. The snapshot (`views.snapshot(viewId)`) is loaded with the map path `remote:<viewId>`. `setScene(null)` shows an empty, unloaded scene. The initiative list shows whenever `initiative.entries` is non-empty; send an empty initiative to hide it. A token's `notePath` and `statblockPath` are dropped, whatever its kind, and so is a combatant's `statblockPath` and an `imagePath` that is no such URL: they are another vault's paths, and the view never reads the player's vault by them. Map sides are at most 100,000 pixels, and a malformed input throws and changes nothing. Fog over the limits (2,000 operations, 200,000 points in all, 10,000 in one operation, a brush wider than the map) covers the whole map, every token hidden, with a line in the status bar saying so (1.16.0), and records equal by value to the ones shown are kept as they are, so resending the same fog is cheap.
- **Player.** `setPlayer(state)` says which tokens the player may drag, the measurement of the ruler and the measure tool, the definitions of the condition badges and of each token's bars (decided per token: a definition with `visibleToPlayers: false` draws no bar on that token but still downs it), and the initiative list's rules and HP bars. A part equal by value to the one shown is kept as it is, so resending the whole state redraws only what changed.
- **Moves.** The player drags a movable token with Atlas's drag and ruler, one at a time. `onTokenDrop` reports the drop at the point it snaps to in the view's grid; the token goes back until the next `setScene` moves it. `cancelDrag()` ends a drag in progress, and a new scene or player state ends a drag whose token left the scene or may no longer move.
- **Camera.** `setCamera(camera, { animate, padded })` shows a world area as large as fits the view, with the remote view's Fit map margin around it when `padded`, and keeps showing it through resizes. `onCameraMoved(true)` fires when the player pans or zooms, and `onCameraMoved(false)` when Fit map (Shift+1) fits the map. Following someone stays the extension's decision: add Follow and Fit buttons as toolbar items with `views: ['remote']`, and `isVisible: (ctx) => ctx.ownRemote` to keep them out of other extensions' remote views.
- **Dice.** The dice tray, at most the view's `maxDice` (100 by default), and the dice log's Roll again go to `onRoll` listeners and never roll locally. Listeners are asked in the order they were added until one returns null (sent); otherwise the tray shows the first reason returned. `setDiceLog(entries)` is the log the view's dice log shows, without Clear. `throwRoll(result)` throws one of the player's own rolls once per id with their dice look, or shows a result card where WebGL is unavailable.
- **Status.** `setStatus(status)` fills the status bar at the start of the top row; its optional `action` is a button, and `actions` follow it, at most 3 buttons in all, each telling `onStatusAction` its id. A long message gives way to the buttons, then a long button label truncates.
- **Other groups.** `views.*`, `lasers.*`, `lighting.*`, `tokens.snapPoint` and `dice.throw` take the remote view's id. `views.active()` never returns it, `tokens.move` answers `not-loaded` and `presentation.present` answers false for it, as do Atlas's own Present commands.
- **Lighting.** `lighting.playerVisibility` and `lighting.watch` answer for a remote id from the remote view's own store, which has no lighting: pending until a scene is shown, then unlit, so everything in it is what that player sees. A lit scene's darkness is the owner's to send, as fog.
- **Scenes.** `scenes.*` never knows a `remote:` path: `findByMap` finds nothing for one, and `readMap` throws on it, as on any path that is not an `.atlasmap` file.

Every handle method does nothing after the view closed, every listener runs guarded and is dropped when it closes, and `onClose` fires once, however the view closed.

## Dice looks (`dice-looks`, 1.16.0)

`dice.registerLook({ id, name, faces, bump?, body?, preview? })` adds a look and returns its disposer; it is set only when `api.has('dice-looks')`, so call it as `extension.dice.registerLook?.(...)`. Atlas stores the GM's choice as `<extension id>:<id>`. While the extension is not loaded, or after the disposer ran (also when the extension or Atlas unloads), Atlas paints its own look and keeps the choice, so the look comes back when it is registered again. Disposing the look in effect repaints the dice with Atlas's look once.

- **Faces.** `faces(sides)` answers the art of one die type, keyed by face value. Atlas asks each type once per registration, all together, the first time the look is in effect, and keeps the look it had until every type answered (each within 10 s). The faces are then repainted once. The keys per type:

  | `sides` | Keys | Notes |
  |---|---|---|
  | 4 | 1–4 | Each face carries three numbers, at its corners; a value's art is painted at the three corners showing it, turned to its corner, and the value at the top tip is the roll. |
  | 6 | 1–6 | A d2 and a d3 are thrown as a d6 and wear its faces. |
  | 8 | 1–8 | |
  | 10 | 1–10 | 10 is the face Atlas prints "10"; on a d100's units die it reads as 0. |
  | 12 | 1–12 | |
  | 20 | 1–20 | |
  | 100 | 0, 10, 20, … 90 | The d100's tens die, a d10 of its own; 0 is "00". With Atlas's own looks it carries the d10's numerals. |

  Art goes where Atlas prints the numeral: upright, centred, and as large as the face allows within Atlas's margin, so leave transparent room in the image for anything that must not touch the edge. An image is copied at most 256 px on its longer side. Hand an image (an `ImageBitmap` or a canvas is always readable) or a URL Atlas loads: `data:`, `blob:`, or `https:` from a server that allows CORS. For a vault file, read it yourself (`app.vault.adapter.readBinary`, then `createImageBitmap(new Blob([data]))` or `URL.createObjectURL`); an `app://` resource URL from `getResourcePath` may not be readable back, and then the face shows Atlas's numeral.
- **Never a broken die.** A value left out, an image that fails to load or is over 8,192 px on a side, one that cannot be read back (a cross-origin image without CORS, which would make WebGL refuse the whole die), an answer after 10 s, or a `faces` that throws or rejects gets Atlas's own numeral for that face, in the GM's numbers font and the look's `ink` (or one that reads on its body). Atlas logs what it painted itself once per registration.
- **Body and relief.** `body.colour` (`#rrggbb`) paints the card under the art, with the card's grain and worn rim; left out, the faces keep Atlas's card stock. `bump(sides)` gives the relief by the same keys, grey with dark pressed in; without it a face's art is pressed in as its silhouette, as Atlas presses its numerals in.
- **Settings.** The look's `name` (at most 64 characters) and `preview` image are shown as given in Atlas's dice look setting and in the command palette's Dice settings. Colour and numbers stay the GM's own choice for Atlas's dice, and the numbers also set the faces a look has no art for. `settings.get('diceLook')` is unchanged: it still names the colour and numbers.
- **Checks.** `registerLook` throws for an `id` or `name` that is not a non-empty string, a name over 64 characters, an `id` this extension registered already, a `faces` (or `bump`) that is not a function, a `body` colour or `ink` that is not `#rrggbb`, or a `preview` that is not a string. Another extension may use the same `id`.

## Scene tabs (`scene-tabs`, 1.17.0)

An Atlas map view holds one live scene: its active tab, which Atlas has loaded and renders. Its other tabs are their files and nothing more, until the GM switches to one and Atlas loads it into the same store. `scene-tabs` lets an extension follow the tabs, tell which tab a scene belongs to, open a tab without presenting it, and add to the scene tab eye's menu and marker. Check `api.has('scene-tabs')`; every member it adds to a namespace that already shipped is optional.

- **Tabs.** `tabs-changed` fires for a GM map view whose tabs were opened, closed, moved or renamed, or whose active tab changed: once per view per microtask, with its `ViewInfo` as it is then. Marking a tab dirty or loaded fires nothing, a remote view never fires it, and `map-loaded` and `map-closed` fire as before.
- **Which tab a scene is.** A switch makes the next tab active first and loads its map after, so `ViewInfo.activeTabId` can name a tab whose scene the store does not hold yet. `SceneSnapshot.tabId` names the tab only once the store holds that tab's map, loaded, and is null while a map loads, between the switch and the load, and in remote views. Attribute a scene by `loaded && tabId`, never by `activeTabId`; a snapshot without a `tabId` is no tab's. `views.subscribe` hears `tabId` change too, also when the active tab changes before any load (closing the active tab).
- **Opening a tab.** `views.showTab(viewId, tabId)` switches the view to the tab as the GM's click does, and answers true once that tab's map is loaded. It answers false, never throwing, for a closed, unknown or remote view, an unknown tab, a switch that failed, and when another switch overtook it: a later `showTab` from any extension, or the GM choosing another tab. It also answers false when the view closes before the tab has loaded, and when the switch and load take longer than 60 seconds (a backstop: Atlas gives up on a stalled load after 30). It never presents. The presented scene holds while the view shows another tab, as on any switch, and resumes when the GM returns to it.
- **The eye's menu.** Right-clicking a scene tab's eye, or the context-menu key or Shift+F10 with it focused, opens Atlas's menu at the eye whenever it has something to show: Atlas's own "Open player window" while a presentation target is active, then, for each section an extension added with `ui.addSceneTabMenuSection({ heading, items })` whose `items` are not empty, a separator, the heading as a label row (plain text, at most 40 characters) and the items. `items(context)` is told the tab: `viewId`, `tabId`, `mapPath`, `name`, `active` (the view's active tab) and `presented` (Atlas's presented tab, held or not), frozen. While the menu is open Atlas reads every section again after `ui.invalidate()`, and when the view's tabs, the presentation targets or the presented scene change, so the checkmarks of top-level items follow; the rows keep their places, so focus and the arrow keys survive a rebuild. An item with `keepOpen` keeps the menu open, also while its action makes the tab active. A menu that has nothing left to show closes, as when its tab closes. An `items` that throws leaves its section out and is logged once.
- **The eye's marker.** A presentation target's `tabBadge({ viewId, tabId })` puts a short mark after a tab's eye, such as "2 players". Only active targets are asked, the first non-null mark wins, and it is read on render and after `ui.invalidate()`. The mark is plain text, trimmed and cut at 24 characters with "…". A tab with a mark draws its eye in the shown style even when it is not presented, and the mark joins the eye's accessible name; the eye's click, its pressed state and its icon are unchanged. A throw, or an answer that is neither a string nor null, shows no mark and is logged once.

Not part of `scene-tabs`: live state or player visibility of a tab that is not active. A background tab has no store and no sight to read; an extension keeps what it last read of it.

## Semver rules

- **Minor:** a new function, capability, event, optional option, or a new field on a returned object or record type.
- **Major:** removing or renaming anything, changing behaviour a contract test pins, or tightening an input type.
- **Capabilities** let the API grow without a major version. Atlas may ship a capability as experimental: present, documented and excluded from semver guarantees until promoted.
- **Record types are part of the contract on purpose.** When Atlas adds a field to a record type (a minor version), an extension that keeps a `Record<keyof TokenEntity, ...>` table fails to compile until its author decides what to do with the field. New data stays private by default.

`npm run api:check` regenerates the rollup, fails when `api-report/` differs from the committed copy, and fails when the report changed against `API_BASE_REF` without a change to `API_VERSION`. `API_BASE_REF` must be set: the check fails without it. CI sets it to the pull request's base branch (`origin/<base>`, `origin/beta` on a push); locally, name the ref to compare against, for example `API_BASE_REF=origin/beta npm run api:check`.

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
- Some record fields use types the report declares but does not export by name, such as `DieType`, `RolledDie`, `WallType`, `Widget`, `WidgetIcon` and `InitiativeSide`. Name them through the record that holds them, for example `DiceRollResult['rolls'][number]` or `WidgetSettings['widgets'][string]['icon']`. Comments on Atlas's own record types may name Atlas functions (`lightKindOf`, `tokenSenses`, `FogCanvasCompositor`); they describe Atlas, and an extension cannot call them.
- `npm run build:packages` builds `src/shared/` into `dist-packages/shared` (gitignored). Atlas CI uploads that folder as an artifact. An extension vendors it as `@atlas-vtt/shared`. Its entries are `grid`, `draw`, `rules`, `dice3d` (needs three.js) and `diceDisplay` (how a roll is presented and the six tray icons, without three.js; `dice3d` re-exports it). `dice3d` creates its canvases through a DOM host that Atlas installs when it starts; a page outside Obsidian calls `installDomHost(host)` from `dice3d` before it draws dice, with the browser's own DOM (`createCanvas(doc, size?)`, `createDiv(parent, cls)`, `ownerWindow(node)`, `activeDocument()`, typed `DomHost`); the returned function puts back the host before it. Without one, drawing dice throws "DOM host has not been installed".

Record the Atlas commit and the API version of every vendored copy, and verify the copy's hashes in your own CI.

## Who maintains what

- **The API maintainer** owns `src/api/`, `tests/api/`, `api-report/` and `src/shared/`. `.github/CODEOWNERS` routes changes to those paths to them, so a refactor that breaks a contract test pings them instead of blocking the Atlas maintainer.
- **The Atlas maintainer** owns Atlas internals and is free to change them. Only `src/api/` has to keep compiling and its tests passing.
- **Extensions** own everything else, in their own repositories.
