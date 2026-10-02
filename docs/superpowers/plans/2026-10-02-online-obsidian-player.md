# Online Play Piece 6a: Players Join from Obsidian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player with Atlas runs **Join online session…**, pastes the GM's join link and a name, and after the GM approves plays in an **Online scene** tab drawn by Atlas's own renderer. They follow the GM's camera, can break away and come back, move their own tokens with the drag ruler, measure privately, point Atlas's laser and roll Atlas's dice into the shared log. The player's own maps, collections and vault are never written.

**Architecture:**
- **A remote store and a converter (Task 1).**
  - `createViewAtlasStore(..., { remote: true })` makes a view store whose storage is inert from creation and whose undo history is paused from creation. It carries a new non-persisted field, `remoteScene`, which is null in every normal view.
  - A pure converter, `playerSceneToAtlasState`, turns the `PlayerScene` that `PlayerSceneMirror` keeps into Atlas records, field by field.
  - `RemoteSceneApplier` writes that into the store. It reuses Atlas records whose GM record did not change, so Atlas's renderers redraw exactly as they do for a local edit.
- **Joining (Task 2).**
  - `OnlineJoinService` (one per app) parses the link with the existing `joinLink` code and runs the existing `PlayerSession` with `client: 'obsidian'` and the existing `AssetLoader`/`AssetCache` (IndexedDB when "keep images" is on).
  - It refuses to join while hosting or while already joined, opens the tab on admission, and offers **Reconnect**.
  - A Join dialog in Atlas's native-modal style starts it. The GM's panel marks Obsidian players.
- **The view (Task 3).**
  - `OnlineSceneView` (type `atlas-online-scene`) is an `AtlasView` built on a remote store, the way `PlayerView` is an `AtlasView` with a player store. Its `OnlineSceneClient` feeds the store from the session.
  - Images become `blob:` object URLs. Atlas's `TextureCache` and `BackgroundSprite` already load those. Each image gets one URL for the map and one for tokens, so the two caches never unload each other's texture.
  - `ViewportFollower` drives Atlas's pixi-viewport with the shared `CameraController`. **Follow GM** and **Fit map** are toolbar items, and the GM tools are hidden.
  - A slim status bar shows the session and its end.
- **Player tools (Task 4).**
  - `InteractionController` lets an online player drag only the tokens they control, with Atlas's drag ruler. A drop goes out once as a `token-move`; `RemoteTokenMoves` holds it until the GM answers.
  - The measure tool stays local. Atlas's laser goes through its `LaserHub` and the shared `LaserBatcher`.
  - The dice tray and the dice log send `dice-roll` and show the shared log. They never dispatch Atlas's document-wide dice event, which would write the shared rolls into the player's own open maps.
- **Docs, checks and the end-to-end test (Task 5).**

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), PIXI v8 (`pixi.js` imports only, never Obsidian's global PIXI v7), pixi-viewport 6, React 19, zustand + zundo, Obsidian API, PeerJS/WebRTC (unchanged), Vitest 4 with jsdom (no canvas, no `URL.createObjectURL`, no `createImageBitmap`, no `HTMLImageElement.decode`; `ResizeObserver` is polyfilled by `tests/setup/obsidianDom.ts`), SCSS.

**Spec:** `docs/superpowers/specs/2026-10-02-online-obsidian-player-design.md` (binding). Forward compatibility only: `docs/superpowers/specs/2026-10-02-online-sharing-design.md` (piece 6b adds a table id to join links and a stable player id per table for Obsidian players; this plan keeps player keys behind one method, `OnlineJoinService.playerKeyFor`, so 6b can replace them, and builds nothing of 6b). The earlier pieces' plans are in `docs/superpowers/plans/`; the player page this mirrors is `online-client/` with its shared modules under `src/app/online/`.

## Global Constraints

- **Never run `npm run build`**: its `postbuild` copies the plugin into the user's vault. Build with `npm run build:ci` (and `npm run build:online` for the join page).
- **The full check**, run at the end of every task: `npx tsc --noEmit && npm run lint && npx vitest run`. Each task also lists the focused test files to run first.
- **Command:** id `join-online-session`, name exactly `Join online session…` (with the ellipsis character `…`). The dialog's title is `Join online session`.
- **The GM's online panel**, while not hosting, gains a second button with the same label, `Join online session…`, beside **Start online session**; it opens the dialog. This is "the toolbar's network button when not hosting" from the spec: that button opens the panel.
- **Link parsing:** the existing `parseJoinFragment` (host id, `signal`, `ice`). The dialog accepts the whole link or just its `#…` fragment; anything else is refused with the join page's text `This link is incomplete. Ask your GM for the join link again.`
- **Names:** `normalizePlayerName` (1–40 characters after cleaning). A refused name shows the join page's text `Enter a name of up to 40 characters.` The last name used is remembered in Atlas's settings as `online.playerName`.
- **The join message:** `{ v: 1, type: 'join', name, playerKey, client: { kind: 'obsidian', version: <Atlas's manifest version> } }`. The web page still sends `kind: 'web'`; protocol version stays 1, and no wire type changes.
- **Player keys:** one random key (`randomId()`) per host id, kept in memory for the plugin's lifetime, so a reconnect is recognised by the GM and re-admitted without a new approval. Piece 6b replaces this with stable per-table ids.
- **One joined session per Atlas.**
  - Joining while hosting is refused with `Stop hosting your online session before joining another.`
  - Joining while already joined (a session that has not ended) is refused with `You are already in an online session. Close its tab to leave it first.`
  - Hosting while joined is refused with `Leave the online session you joined before hosting one.`
  - A session that has ended may be replaced by a new join; its tab closes.
- **The GM's panel** marks a player who joined from Obsidian with a gem icon (lucide `Gem`) after the name, with the `LabelTooltip` and `aria-label` text `Joined from Obsidian`. `SessionPlayer.client` is `'obsidian'` for them and absent for web players.
- **The view:** type `atlas-online-scene`, display text `Online scene`, icon `network`. It opens in a new tab on the first admission of a join. Closing the tab leaves the session. A tab restored at startup with no session closes itself once the layout is ready. Its `getState()` carries no session data.
- **The remote store** has:
  - no map file (`mapPath` null), and no persistence: its storage adapter never reads or writes, from creation;
  - no undo history: zundo is paused from creation;
  - no autosave, no snapshots, no vault-sync, no collection widget sync (not registered with `WidgetSyncService`), no scene thumbnails;
  - `isPlayerView: true` and `isGMView: false`.
  - Nothing it holds reaches `partialize`.
- **The converter** (`playerSceneToAtlasState`) maps every field the coverage tables in `src/app/online/coverage.ts` mark `sent`. A test keyed by those tables fails when a sent field has no mapping.
- **Images** come only from `AssetLoader` (memory, plus IndexedDB when `online.keepImages`, default on, is set). They become `blob:` object URLs:
  - one URL for the background and another for tokens, per image;
  - revoked when the image leaves the scene, and when the session is left.
  - Nothing is written to the vault.
- **Camera:**
  - It follows the GM's `scene-camera` by default (`GLIDE_MS` = 150 ms glides).
  - A pan or zoom by the player breaks away: pixi-viewport `moved` events of type `drag`, `wheel`, `pinch` or `decelerate`.
  - **Follow GM** and **Fit map** appear in the main toolbar, as `ToolButton` items with priorities `follow: 95` and `fit: 92` and `menuEntry`s, only while the player has broken away. Shift+1 (Atlas's fit-map hotkey) runs **Fit map** in this view.
- **Read-only:**
  - The toolbar keeps only Move/Laser, Measure and Dice (plus Follow GM / Fit map).
  - Hidden: fog, draw, text, note pins, walls, ambient sound, the online button, loot roller, asset manager, command palette, the GM view switch, scene tabs, undo/redo, view actions, the DM dashboard, the GM initiative tracker and the online panel.
  - Tokens have no context menu.
- **Player tools:**
  - **Move:** Atlas's token drag with the drag ruler, only for the tokens in the GM's latest `token-control` list and only while admitted; one token at a time (no Shift group drag, no Alt copy). One `token-move` goes out on drop.
  - **Refused moves:** they snap back, and `Move not allowed.` shows in the status bar for `REFUSED_NOTICE_MS` = 3000 ms. A drop the GM has not answered within `CONFIRM_TIMEOUT_MS` = 2000 ms also goes back to the scene's position.
  - **Measure:** Atlas's measure tool with the GM's measurement settings; nothing is sent.
  - **Laser:** Atlas's laser in the player's Atlas laser colour (sent when it is a `#rrggbb` colour; the GM relays only swatch colours), batched by `LaserBatcher`; others' lasers are drawn with Atlas's `RemoteLaserRenderer`.
  - **Dice:** Atlas's dice tray sends `dice-roll` (modifier 0). The dice log shows the shared log, the last 50 entries, newest first. Repeating an entry sends its dice and modifier again.
  - Nothing dispatches `atlas-dice-rolled` in this view.
- **Status bar:**
  - It shows the GM's session title (`the table` until known), a dot and the connection.
  - Connection text: `Connected`, `Connecting…`, `Reconnecting…`, `Waiting for the GM` or `Disconnected`.
  - Messages:
    - waiting to be let in: `Waiting for the GM to let you in…`
    - no scene shown: `Waiting for the GM to show a scene.`
    - ended: `The session ended.`
    - after giving up reconnecting (`RECONNECT_GIVE_UP_MS` = 300 000 ms, backoff `RECONNECT_DELAYS_MS` = 1, 2, 4, 8, 15 s): `Lost the connection to your GM.` with a **Reconnect** button
    - `unreachable`: the join page's text, also with **Reconnect**
    - denied, kicked, full, version and replaced: the join page's texts, verbatim.
  - The tab keeps the last scene after the session ends.
- **Styling** (repo `CLAUDE.md`):
  - `ToolButton` for toolbar buttons, with a `PRIORITY` entry and a `menuEntry`.
  - `Button` for others; `LabelTooltip` for tooltips, never a `title` attribute.
  - Obsidian modals add `ATLAS_NATIVE_MODAL_CLASSES`.
  - Surfaces use `atlas-elevated-surface`. Bars under 48 px are capsules: `atlas-panel-radius` with `atlas-panel-inset-radius-value($inset, $max)` for their end controls.
  - SCSS classes, not Tailwind. Uniform padding equals the gap. Sentence-case copy.
- **Files** stay under 300 lines; every function has an explicit return type.

## Review Focus

1. **The player's own vault and open maps are never written.** This means no vault or adapter write, and no `atlas-dice-rolled` event across join, scene, token drop, dice roll, dice log, laser and closing the tab. A dispatched dice event reaches `useDiceHistory` in every open map view, and `partialize` saves `diceLog` into those maps' files. Tests:
   - Task 1: `remoteStore.test.ts`.
   - Task 4: `onlineDiceUi.test.tsx`, "dispatches no dice event".
   - Task 5: `obsidianPlayerEndToEnd.test.ts`, "never writes the player's vault".
2. **GM-only data never reaches the store.** Converted records hold only the fields Atlas's types name and the projection sends: no `notePath`, `tags`, `statblockPath`, `isHidden`, pins, walls, lights or sounds. A field the network adds to a record is dropped. Tests:
   - Task 1: `playerSceneToAtlasState.test.ts`, "takes named fields only".
   - Task 1: `convertCoverage.test.ts`.
3. **Textures and URLs are released.** An image that leaves the scene has both its URLs revoked. Blob backgrounds are unloaded when their last user lets go, never kept idle. The map and a token never share a URL, so one cache's unload never destroys the other's texture. Tests:
   - Task 2: `objectUrlImages.test.ts`.
   - Task 3: `backgroundTextureCache.test.ts` additions.
4. **Leaving cleans up and allows a new join.** Closing the tab sends `bye`, and the GM sees the player gone. The loader is disposed and its URLs revoked, the store's session state is reset and the client unsubscribes everything. A second join then works, and a stale ended tab closes when a new join replaces it. Tests:
   - Task 2: `onlineJoinService.test.ts`, "leaving".
   - Task 3: `onlineSceneClient.test.ts`, "dispose".
5. **Atlas's normal map views are unaffected.** The default store still persists and records history, with `remoteScene` null. The GM's `InteractionController` keeps group drags, Alt copies and its context menu. The GM's toolbar keeps every tool. `mapMeasurementSettings` and the condition badges read the collection as before. Tests:
   - Task 1: `remoteStore.test.ts`, "normal stores".
   - Task 3: `onlineSceneToolbar.test.tsx`, "GM toolbar".
   - Task 4: `onlinePlayerDrag.test.ts`, "GM view".

## Rulings on spec ambiguities

1. **The view is an `AtlasView` subclass**, like `PlayerView`, built on a remote store. `UIRoot`, `MainToolbar`, the renderers and the dice UI already take an `AtlasView` and a view store. A separate `ItemView` would duplicate all of that.
   - Commands that change "the active map" (toggle initiative tracker, toggle loot roller, clean up missing assets) skip remote views through a new `activeMapView(app)`.
   - Toggle dice log still works in the online view.
2. **Textures come from object URLs, not new renderer entry points.** `TextureCache` already loads `blob:` URLs (`normalizeImagePath` leaves `blob:app://obsidian.md/<uuid>` unchanged) and unloads them by URL. `BackgroundSprite` gets them through `backgroundTextureCache`, which now loads blob URLs with PIXI's texture parser and unloads them as soon as their last user lets go. This replaces `BackgroundSprite`'s blob branch: that branch created `Texture.from(img)` and never destroyed it, and no other code creates blob backgrounds.
3. **Images stay until the session is left, not until it ends.** The spec keeps the last scene after the end and offers Reconnect, so the loader is disposed only by leaving (closing the tab, a replacing join, unloading the plugin). **Reconnect** starts a fresh `PlayerSession` with the same player key, the same loader and the same cache. The GM re-admits a known key without approval.
4. **Camera.** The shared `CameraController` decides the camera. A new `movedByPlayer(camera)` takes the viewport's camera after a player pan or zoom, without moving the viewport back. `ViewportFollower` applies glides to pixi-viewport (`setZoom`, then `moveCenter`), which emit no `moved` event. When the background image loads, `BackgroundSprite` re-centres the viewport, so the follower re-applies its camera on `background-sprite-updated`.
5. **No grid, no tokens.** `TokenRenderer` exists only after `initGrid(options, sprite)`. `RemoteMapBackdrop` puts a transparent placeholder sprite of the map's size (Atlas's own placeholder texture) under the scene until the image arrives, and again whenever the background goes. It initialises the grid from it once.
6. **Token drags.** Atlas's `InteractionController` and `DragRuler` drag the token, and the store is the preview. Moving the token in the remote store saves nothing, because the store is inert. The view keeps the dragged or dropped position over the GM's patches until the GM answers. The rules come from the web page's `TokenMoves`: its constants and text are reused, but not its class, because Atlas does the hit-testing and the drag.
7. **Dice.**
   - The tray and the log's repeat call the view's controls, which send `dice-roll`.
   - The online `DiceRollLog` does not listen to the document event and shows no clear button. A player cannot clear the GM's shared log.
   - The tray renders no `DiceToastContainer` in this view, because that container shows the document event. The online view therefore shows no dice toasts in 6a.
8. **Conditions** show as neutral badges, like the web page: definitions named `Condition` in `NEUTRAL_BADGE_COLOR`, valued where a value was sent. Players never receive the GM's condition definitions.
9. **Widgets and initiative.**
   - Clocks show as counters (their filled count), because `PlayerWidget` carries no segment count.
   - Timers show their remaining time; their duration is that same time, since players receive none, so a timer's progress shows full.
   - Initiative shows with Atlas's read-only `PlayerInitiativePanel` (the local player window's), fed through a settings source that shows everything, since the GM's rules were applied before sending. An entry's avatar is its token's image.
   - No wire change in 6a.
10. **Nameplates.** The map's "show nameplates" stays off, and each token with a sent name sets `showNameplate`. This way a character whose name the GM withholds never gets an empty plate. HP and stress bars are on (only allowed values arrive).
11. **The dialog** stays open while connecting and waiting, showing the status. It closes on admission, when the tab opens. Closing it before admission cancels the join. Denial texts show in it.
12. **Settings boundary.** The online scene never writes settings. It reads only the laser colour and the navigation settings. The join dialog writes `online.playerName`, and the settings tab writes `online.keepImages`. Switching keeping off deletes the stored images at once (`AssetCache.setKeep(false)`).
13. **The texts.** The spec says to use "the same texts as the web page", so the version text keeps "This page is out of date…". The `connection-lost` case uses the spec's shorter `Lost the connection to your GM.`, since the web text tells the player to reload the page. **Reconnect** is also offered after `unreachable`.
14. **Placement of the restored-tab check.** `OnlineJoinService` is created in `onload` right after the settings service and before the views are registered, so a restored tab always finds it. The tab then closes itself on `onLayoutReady`, because it has no session.

## Items for the controller to decide

1. **Dice toasts in the online view** (ruling 7) are off in 6a. Showing them needs `DiceToastContainer` to take a feed instead of the document event.
2. **Clock segments and timer durations** (ruling 9) need two new `PlayerWidget` fields. That is a wire change, for a later piece.
3. **A custom laser colour** that is not one of Atlas's swatches shows to everyone else in the player's join-order colour, because `LaserRelay` relays only swatches. The player's own beam keeps their colour.
4. **Image loading progress** is not shown in the Obsidian view. The web page's progress bar code is shared and could be added to the status bar later.
5. **Manual test (Task 5, step 6)** needs two vaults on two machines, run by the user.

## File Structure

New (all under `src/app/online/obsidian/` unless noted):
- `remoteScene.ts` — `RemoteSceneState` (the store's `remoteScene`), `OnlineSceneStatus`, `OnlineSceneControls`, `RemoteImages`, initial values, `updateRemoteScene`.
- `convertTokens.ts` — tokens and neutral condition definitions.
- `convertShapes.ts` — fog operations, texts, drawings.
- `convertPanels.ts` — widgets and initiative.
- `playerSceneToAtlasState.ts` — the converter: grid, measurement, assembly, record builders.
- `RemoteSceneApplier.ts` — writes converted scenes into a store, reusing unchanged records.
- `objectUrlImages.ts` — the Obsidian `ImageDecoder`: two object URLs per image.
- `joinedSessionStore.ts` — the joined session's state for the dialog.
- `OnlineJoinService.ts` — one joined session: join, leave, reconnect, attach a view.
- `onlineSceneTab.ts` — the view type, its title, opening its tab.
- `ui/JoinSessionModal.ts` — the Join dialog.
- `onlineSceneStatus.ts` — the status bar's text from the session state.
- `ViewportFollower.ts` — follow, break away, Follow GM, Fit map on pixi-viewport.
- `RemoteMapBackdrop.ts` — the placeholder background and grid start.
- `OnlineSceneClient.ts` — the view's wiring: sink of the service, store, camera, tools.
- `OnlineSceneView.ts` — the Obsidian view.
- `remoteTokenMoves.ts` — drag gate, held and pending positions, refusals.
- `OnlineLaserLink.ts` — Atlas's laser hub to and from the session.
- `onlineDice.ts` — shared log entries as Atlas rolls, and a roll back to dice.
- `src/app/grid/gridStateOptions.ts` — `GridState` to `GridOptions` (moved from `BackgroundSprite.tsx`).
- `src/app/react/components/online/OnlineSceneBar.tsx`, `onlineSceneToolbarItems.tsx`, `online-scene.scss`.

Modified: `storeFactory.ts`, `online/scene/sceneDiff.ts`, `online/PlayerSession.ts`, `online/gmSessionTypes.ts`, `online/GmSession.ts`, `online/joinLink.ts`, `online/onlineSettings.ts`, `settings/onlineSettingsSection.ts`, `online/OnlineSessionService.ts`, `online/registerOnline.ts`, `online/ui/onlineCopy.ts`, `online/ui/online-session.scss`, `online/page/pageScreen.ts`, `online/page/diceLogModel.ts`, `online/view/CameraController.ts`, `react/components/online/OnlinePlayerList.tsx`, `react/components/online/OnlinePanel.tsx`, `react/components/online/online-panel.scss`, `atlas-view.ts`, `services/ServiceManager.ts`, `MapLoader.ts`, `react/BackgroundSprite.tsx`, `pixi/backgroundTextureCache.ts`, `react/UIRoot.tsx`, `packages/components/MainToolbar.tsx`, `pixi/TokenRenderer.ts`, `services/PlayerSceneOverlay.ts`, `services/PlayerInitiativePanel.ts`, `plugin/atlasLeaves.ts`, `plugin/registerCommands.ts`, `plugin/statusBarVisibility.ts`, `pixi/token-renderer/InteractionController.ts`, `services/mapMeasurementSettings.ts`, `react/components/dice/DiceDropdownMenu.tsx`, `react/components/dice-log/DiceRollLog.tsx`, `react/components/dice-log/useDiceHistory.ts`, `styles/main.scss`, `main.ts`, docs.

---

### Task 1: The remote store and the player scene converter

A view store can now be made "remote": it never reads or writes storage and records no undo history, from the moment it exists. It also holds a `remoteScene` part with what the GM's scene and session decide beyond Atlas's records. A pure converter rebuilds Atlas records from a `PlayerScene`, field by field, covering every field the coverage tables mark as sent. An applier writes the result into the store and reuses records that did not change.

**Files:**
- Create: `src/app/online/obsidian/remoteScene.ts`
- Create: `src/app/online/obsidian/convertTokens.ts`
- Create: `src/app/online/obsidian/convertShapes.ts`
- Create: `src/app/online/obsidian/convertPanels.ts`
- Create: `src/app/online/obsidian/playerSceneToAtlasState.ts`
- Create: `src/app/online/obsidian/RemoteSceneApplier.ts`
- Modify: `src/app/online/scene/sceneDiff.ts` (export `setOwn`)
- Modify: `src/app/storeFactory.ts` (the `remoteScene` field, `ViewStoreOptions`, inert storage, paused history)
- Test: `tests/unit/online/obsidian/remoteStore.test.ts`
- Test: `tests/unit/online/obsidian/playerSceneToAtlasState.test.ts`
- Test: `tests/unit/online/obsidian/convertCoverage.test.ts`
- Test: `tests/unit/online/obsidian/remoteSceneApplier.test.ts`

**Interfaces:**
- Consumes: `PlayerScene` and its parts (`src/app/online/scene/sceneTypes.ts`), `withMeasurementDefaults`, `sameValue`/`applyPatch` (`sceneDiff.ts`), `NEUTRAL_BADGE_COLOR` (`src/app/online/view/layers/tokenUiDrawing.ts`), `runUntracked`/`getHistoryStore` (`src/app/stores/history.ts`), `DEFAULT_GRID_SIZE` (`src/app/online/scene/objectBounds.ts`).
- Produces (later tasks rely on these exact names):
  - `ViewAtlasState.remoteScene: RemoteSceneState | null`.
  - `createViewAtlasStore(app, viewId, plugin?, isPlayerView = false, options: ViewStoreOptions = {})` with `ViewStoreOptions { remote?: boolean }`.
  - From `remoteScene.ts`:
    - `RemoteSceneState { movableTokenIds; measurement; conditions; status; following; notice }`
    - `OnlineSceneStatus { title; connection; tone: 'connected' | 'pending' | 'ended'; message; reconnect }`
    - `OnlineSceneControls { followGm(); fitMap(); reconnect(); rollDice(dice, modifier): boolean }`
    - `RemoteImages { background(assetId); token(assetId) }`
    - `DEFAULT_TABLE_TITLE`, `atlasMeasurement(measurement)`, `initialRemoteScene()`, `updateRemoteScene(store, partial)`.
  - From `playerSceneToAtlasState.ts`: `playerSceneToAtlasState(scene, images, builders?)`, `RemoteSceneParts`, `RemoteAtlasState`, `RecordBuilders`, `plainBuilders(images, positionOf?)`, `emptyRemoteScene(builders)`, `mapRecords`.
  - `new RemoteSceneApplier({ store, images, positionOf? })` with `apply(scene | null)`, `refresh()`, `current`, `dispose()`.

- [ ] **Step 1: Write the failing remote store test**

Create `tests/unit/online/obsidian/remoteStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { getHistoryStore } from '../../../../src/app/stores/history';

/** Every file and folder of the in-memory vault, in a stable order. */
function vaultSnapshot(files: Map<string, string>, folders: Set<string>): string {
  return JSON.stringify([[...files].sort(), [...folders].sort()]);
}

describe('remote view store', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts without saving, without history and as a player view without a map file', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'online-1', undefined, false, { remote: true });
    const state = store.getState();
    expect(state.persistenceEnabled).toBe(false);
    expect(state.isPlayerView).toBe(true);
    expect(state.isGMView).toBe(false);
    expect(state.mapPath).toBeNull();
    expect(state.remoteScene).toMatchObject({ movableTokenIds: [], conditions: [], following: true, notice: null });
    expect(state.remoteScene?.status).toEqual({ title: 'the table', connection: 'Connecting…', tone: 'pending', message: null, reconnect: false });
    expect(getHistoryStore(store)?.getState().isTracking).toBe(false);
  });

  it('never reads or writes the vault and records no undo step, even with saving switched on and a map path set', async () => {
    const { app, files, folders } = createInMemoryApp({ files: { 'maps/mine.atlasmap': '{"mine":true}' } });
    const before = vaultSnapshot(files, folders);
    const store = createViewAtlasStore(app, 'online-2', undefined, false, { remote: true });
    store.getState().setPersistenceEnabled(true);
    store.getState().setMapPath('maps/mine.atlasmap');
    const id = store.getState().addToken({ x: 10, y: 10, imagePath: 'blob:app://obsidian.md/abc' });
    store.getState().moveToken(id, 70, 70);
    await store.flushStorage();
    // Past every save debounce Atlas has.
    await vi.advanceTimersByTimeAsync(5000);
    expect(vaultSnapshot(files, folders)).toBe(before);
    expect(app.vault.create).not.toHaveBeenCalled();
    expect(app.vault.process).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.vault.adapter.write).not.toHaveBeenCalled();
    expect(app.vault.adapter.read).not.toHaveBeenCalled();
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });

  it('leaves normal stores as they were: saved, tracked, without a remote part', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'map-1');
    expect(store.getState().remoteScene).toBeNull();
    expect(store.getState().persistenceEnabled).toBe(true);
    expect(store.getState().isPlayerView).toBe(false);
    expect(store.getState().isGMView).toBe(true);
    expect(getHistoryStore(store)?.getState().isTracking).toBe(true);
    const saved = store.persist.getOptions().partialize?.(store.getState()) ?? {};
    expect(Object.keys(saved)).not.toContain('remoteScene');
    store.getState().addToken({ x: 1, y: 1, imagePath: 'art/a.png' });
    expect(getHistoryStore(store)?.getState().pastStates.length).toBeGreaterThan(0);
  });

  it('keeps a player view store a player view, without a remote part', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'player-1', undefined, true);
    expect(store.getState().isPlayerView).toBe(true);
    expect(store.getState().remoteScene).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/online/obsidian/remoteStore.test.ts`
Expected: FAIL. `remoteScene` is undefined, and the remote store still has persistence on and history tracking on.

- [ ] **Step 3: Write `remoteScene.ts`**

Create `src/app/online/obsidian/remoteScene.ts`:

```ts
/**
 * The online scene view's own part of its store: what the GM's scene and session decide beyond
 * Atlas's records, read by the toolbar, the status bar, the drag gate, the ruler and the
 * condition badges. Null in every other view, and never persisted (`partialize` names its
 * fields). The UI reaches the view's actions through `AtlasView.onlineControls()`.
 */
import type { StoreApi } from 'zustand';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ViewAtlasState } from '../../storeFactory';
import type { DiceSelection } from '../../tools/diceRolling';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { withMeasurementDefaults, type PlayerMeasurement } from '../scene/sceneTypes';

export interface OnlineSceneStatus {
  /** The GM's session title. */
  title: string;
  /** `Connected`, `Connecting…`, `Reconnecting…`, `Waiting for the GM` or `Disconnected`. */
  connection: string;
  /** The status dot. */
  tone: 'connected' | 'pending' | 'ended';
  /** A line after the connection: waiting, no scene, or why the session ended; null for none. */
  message: string | null;
  /** Shows the Reconnect button. */
  reconnect: boolean;
}

export interface RemoteSceneState {
  /** The tokens this player may drag: the GM's latest `token-control` list. */
  movableTokenIds: readonly string[];
  /** The GM's measurement settings, for the drag ruler and the measure tool. */
  measurement: MeasurementSettings;
  /** Neutral definitions for the condition ids the scene shows. */
  conditions: readonly ConditionDefinition[];
  status: OnlineSceneStatus;
  /** Whether the camera follows the GM; Follow GM and Fit map show while it does not. */
  following: boolean;
  /** `Move not allowed.` for a while after a refusal; null otherwise. */
  notice: string | null;
}

/** What the online scene's UI asks of its view. */
export interface OnlineSceneControls {
  followGm(): void;
  fitMap(): void;
  reconnect(): void;
  /** Sends a roll from the dice tray or the dice log; false when it could not go. */
  rollDice(dice: DiceSelection, modifier: number): boolean;
}

/** The object URLs the scene's images show by; null while an image is not ready. */
export interface RemoteImages {
  background(assetId: string | null): string | null;
  token(assetId: string | null): string | null;
}

/** The session title until the GM's arrives, as on the join page. */
export const DEFAULT_TABLE_TITLE = 'the table';

/** The GM's measurement as Atlas's settings. */
export function atlasMeasurement(measurement: PlayerMeasurement): MeasurementSettings {
  return {
    mode: measurement.mode,
    unitType: measurement.unitType,
    unitDistance: measurement.unitDistance,
    diagonalRule: measurement.diagonalRule,
    rangeBands: measurement.rangeBands.map((band) => ({ name: band.name, maxSquares: band.maxSquares })),
  };
}

export function initialRemoteScene(): RemoteSceneState {
  return {
    movableTokenIds: [],
    measurement: atlasMeasurement(withMeasurementDefaults(undefined)),
    conditions: [],
    status: { title: DEFAULT_TABLE_TITLE, connection: 'Connecting…', tone: 'pending', message: null, reconnect: false },
    following: true,
    notice: null,
  };
}

/** Changes part of a remote store's `remoteScene`; does nothing to a normal view's store. */
export function updateRemoteScene(
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>,
  partial: Partial<RemoteSceneState>,
): void {
  const current = store.getState().remoteScene;
  if (!current) return;
  store.setState({ remoteScene: { ...current, ...partial } });
}
```

- [ ] **Step 4: Make the store remote on request**

In `src/app/storeFactory.ts`:

1. Next to the other imports, add:

```ts
import { initialRemoteScene, type RemoteSceneState } from './online/obsidian/remoteScene';
```

and change the history import from `import { createHistoryOptions } from './stores/history';` to:

```ts
import { createHistoryOptions, getHistoryStore } from './stores/history';
```

2. In `interface ViewAtlasState`, right after the line `isPlayerView: boolean;` (under `// Player view state`), add:

```ts
  /** The online scene view's session data (`online/obsidian/remoteScene.ts`); null in every other view. Never persisted. */
  remoteScene: RemoteSceneState | null;
```

3. Just above `export function createViewAtlasStore(`, add:

```ts
/** How a view store is made. */
export interface ViewStoreOptions {
  /**
   * The online scene view's store: a scene another Atlas sends. It never reads or writes
   * storage and records no undo history, from creation, and is a player view.
   */
  remote?: boolean;
}

/** Storage of a store that never saves: it reads nothing and writes nothing. */
const INERT_STORAGE = {
  getItem: async (): Promise<StorageValue<PersistedViewState> | null> => null,
  setItem: async (): Promise<void> => undefined,
  removeItem: async (): Promise<void> => undefined,
};
```

4. Change the signature to:

```ts
export function createViewAtlasStore(
  app: App,
  viewId: string,
  plugin?: AtlasVTTPlugin,
  isPlayerView: boolean = false,
  options: ViewStoreOptions = {},
): ViewAtlasStore {
  const remote = options.remote === true;
```

(the existing first line of the body, `// Create a storage factory ...`, follows).

5. In the `immer` initializer, replace

```ts
          // Player view state (set during creation)
          isPlayerView: isPlayerView,
          isGMView: true,
```

with

```ts
          // Player view state (set during creation); the online scene view's store is a player view that never saves
          isPlayerView: isPlayerView || remote,
          isGMView: !remote,
          remoteScene: remote ? initialRemoteScene() : null,
          ...(remote ? { persistenceEnabled: false } : {}),
```

6. In the `persist` options, replace `storage: createDelayedStorage(),` with:

```ts
          // A remote store never touches storage; others save through this view's map file.
          storage: remote ? INERT_STORAGE : createDelayedStorage(),
```

7. Replace

```ts
  // Set the store reference after creation
  storeRef = store;
```

with

```ts
  // Set the store reference after creation
  storeRef = store;
  // A remote store's edits are the GM's scene or a preview; nothing of it is undoable.
  if (remote) getHistoryStore(store)?.getState().pause();
```

`partialize` lists its fields by name, so `remoteScene` is never saved, and the history's `partializeHistory` does the same for undo.

- [ ] **Step 5: Run the remote store test**

Run: `npx vitest run tests/unit/online/obsidian/remoteStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing converter tests**

Create `tests/unit/online/obsidian/playerSceneToAtlasState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  emptyRemoteScene, plainBuilders, playerSceneToAtlasState,
} from '../../../../src/app/online/obsidian/playerSceneToAtlasState';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import type { PlayerScene } from '../../../../src/app/online/scene/sceneTypes';
import { NEUTRAL_BADGE_COLOR } from '../../../../src/app/online/view/layers/tokenUiDrawing';
import { fogRect, playerScene, playerToken } from '../sceneFixtures';

const images: RemoteImages = {
  background: (id) => (id ? `blob:map/${id}` : null),
  token: (id) => (id ? `blob:token/${id}` : null),
};
const noImages: RemoteImages = { background: () => null, token: () => null };

describe('playerSceneToAtlasState', () => {
  it('shows the map and token art by object URL, one URL per use', () => {
    const { state } = playerSceneToAtlasState(playerScene(), images);
    expect(state.background).toBe('blob:map/map-asset');
    expect(state.objects.tokens.t1).toEqual({
      id: 't1', kind: 'token', x: 100, y: 100, size: 1, rotation: 0, layer: 0,
      imagePath: 'blob:token/asset-1', showRing: true, ringColor: '#ffffff',
    });
  });

  it("shows a token whose art has not arrived as Atlas's default token, and no map image yet", () => {
    const { state } = playerSceneToAtlasState(playerScene(), noImages);
    expect(state.background).toBeNull();
    expect(state.objects.tokens.t1?.imagePath).toBe('');
  });

  it('makes a token with a name, HP or stress a character, with a plate only for a sent name', () => {
    const scene = playerScene({
      tokens: {
        named: playerToken({ name: 'Anna', hp: { current: 7, max: 10 }, stress: { current: 2, max: 6 }, ring: null }),
        unnamed: playerToken({ hp: { current: 3, max: 8 } }),
      },
    });
    const { tokens } = playerSceneToAtlasState(scene, images).state.objects;
    expect(tokens.named).toMatchObject({
      kind: 'character', name: 'Anna', showNameplate: true, hp: { current: 7, max: 10 },
      stress: { current: 2, max: 6 }, maxStress: 6, showRing: false,
    });
    expect(tokens.named).not.toHaveProperty('ringColor');
    expect(tokens.unnamed).toMatchObject({ kind: 'character', name: '' });
    expect(tokens.unnamed).not.toHaveProperty('showNameplate');
    expect(tokens.unnamed).not.toHaveProperty('stress');
  });

  it('gives conditions neutral definitions, valued where a value was sent', () => {
    const scene = playerScene({
      tokens: { a: playerToken({ name: 'A', conditions: [{ id: 'prone', value: null }, { id: 'frightened', value: 2 }] }) },
    });
    const parts = playerSceneToAtlasState(scene, images);
    expect(parts.state.objects.tokens.a).toMatchObject({ conditions: ['prone', 'frightened'], conditionValues: { frightened: 2 } });
    expect(parts.conditions).toEqual([
      { id: 'prone', name: 'Condition', color: NEUTRAL_BADGE_COLOR },
      { id: 'frightened', name: 'Condition', color: NEUTRAL_BADGE_COLOR, valued: true },
    ]);
  });

  it('rebuilds fog, texts and drawings in their orders', () => {
    const scene = playerScene({
      fog: {
        f1: fogRect(4, { erase: true, x: 10, y: 20, width: 30, height: 40 }),
        f2: { type: 'brush', erase: false, order: 5, radius: 12, points: [{ x: 1, y: 2 }] },
        f3: { type: 'lasso', erase: true, order: 6, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 4, y: 7 }] },
      },
    });
    const { objects } = playerSceneToAtlasState(scene, images).state;
    expect(objects.fog).toEqual({
      f1: { id: 'f1', kind: 'fog', timestamp: 4, isErasing: true, type: 'rectangle', x: 10, y: 20, width: 30, height: 40 },
      f2: { id: 'f2', kind: 'fog', timestamp: 5, isErasing: false, type: 'brush', brushRadius: 12, points: [{ x: 1, y: 2 }] },
      f3: { id: 'f3', kind: 'fog', timestamp: 6, isErasing: true, type: 'lasso', points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 4, y: 7 }] },
    });
    expect(objects.texts.x1).toEqual({
      id: 'x1', kind: 'text', x: 50, y: 50, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#000000',
      padding: 4, borderRadius: 0, opacity: 1, align: 'center', bold: false, italic: false, rotation: 0, scale: 1,
    });
    expect(objects.drawings.d1).toEqual({
      id: 'd1', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#ff0000', width: 4, opacity: 1,
    });
  });

  it('shows the grid as the GM sends it, and a hidden grid with the map cell size so tokens keep their size', () => {
    const shown = playerSceneToAtlasState(playerScene(), images).state.grid;
    expect(shown).toEqual({
      enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1,
      snapToGrid: true, measurementType: 'units', unitType: 'feet', unitDistance: 5,
    });
    const hidden = playerSceneToAtlasState(playerScene({ grid: null, map: { asset: null, width: 0, height: 0, cellSize: 50 } }), images).state.grid;
    expect(hidden).toMatchObject({ enabled: true, visible: false, size: 50 });
  });

  it("takes the GM's measurement for the ruler, snapping included", () => {
    const scene: PlayerScene = playerScene({
      measurement: {
        mode: 'abstract', unitType: 'custom', unitDistance: 1, diagonalRule: 'alternating',
        rangeBands: [{ name: 'Close', maxSquares: 2 }], snapToGrid: false,
      },
    });
    const parts = playerSceneToAtlasState(scene, images);
    expect(parts.measurement).toEqual({ mode: 'abstract', unitType: 'custom', unitDistance: 1, diagonalRule: 'alternating', rangeBands: [{ name: 'Close', maxSquares: 2 }] });
    expect(parts.state.grid).toMatchObject({ snapToGrid: false, measurementType: 'abstract' });
    expect(parts.state.grid).not.toHaveProperty('unitType');
  });

  it('shows counters and clocks by their value and timers by their remaining time, all to players', () => {
    const scene = playerScene({
      widgets: [
        { id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', value: 3 },
        { id: 'doom', type: 'clock', label: 'Doom', icon: 'no-such-icon', value: 2 },
        { id: 'fuse', type: 'timer', label: 'Fuse', icon: 'hourglass', value: 90 },
      ],
    });
    const { widgetSettings, widgetValues } = playerSceneToAtlasState(scene, images).state;
    expect(widgetSettings).toMatchObject({ globalVisible: true, position: 'top', scale: 1 });
    expect(widgetSettings.widgets.torches).toEqual({
      id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', visible: true, visibleToPlayers: true, value: 3, order: 0, scope: 'scene',
    });
    expect(widgetSettings.widgets.doom).toMatchObject({ type: 'counter', icon: 'star', order: 1 });
    expect(widgetSettings.widgets.fuse).toMatchObject({ type: 'timer', value: 90, duration: 90, direction: 'down', order: 2 });
    expect(widgetValues).toEqual({ torches: 3, doom: 2 });
  });

  it("opens the initiative order players may see, each entry with its token's art", () => {
    const scene = playerScene({
      initiative: { round: 3, active: true, entries: [{ id: 'e1', tokenId: 't1', initiative: 15, name: 'Anna', hp: { current: 0, max: 9 }, isActive: true }] },
    });
    const state = playerSceneToAtlasState(scene, images).state;
    expect(state.initiativeTrackerOpen).toBe(true);
    expect(state.initiative).toMatchObject({ round: 3, isActive: true, currentIndex: 0, removedTokenIds: [] });
    expect(state.initiative.entries).toEqual([{
      id: 'e1', tokenId: 't1', name: 'Anna', initiative: 15, initiativeModifier: 0, hp: { current: 0, max: 9 },
      imagePath: 'blob:token/asset-1', isActive: true, isDefeated: true, isNPC: true, order: 0,
    }]);
    const closed = playerSceneToAtlasState(playerScene({ initiative: null }), images).state;
    expect(closed.initiativeTrackerOpen).toBe(false);
    expect(closed.initiative.entries).toEqual([]);
  });

  it('places a token where this view shows it instead of where the GM has it', () => {
    const builders = plainBuilders(images, (id) => (id === 't1' ? { x: 500, y: 600 } : null));
    const { tokens } = playerSceneToAtlasState(playerScene(), images, builders).state.objects;
    expect(tokens.t1).toMatchObject({ x: 500, y: 600 });
  });

  it('takes named fields only: keys the network adds never reach the store', () => {
    const base = playerScene();
    const extra = { notePath: 'GM/secret.md', tags: ['boss'], isHidden: true, statblockPath: 'Bestiary/x.md', secret: 1 };
    const scene = playerScene({
      tokens: { t1: { ...playerToken(), ...extra } as never },
      texts: { x1: { ...base.texts.x1!, secret: 1 } as never },
      drawings: { d1: { ...base.drawings.d1!, secret: 1 } as never },
      fog: { f1: { ...base.fog.f1!, secret: 1 } as never },
      widgets: [{ ...base.widgets[0]!, secret: 1 } as never],
      initiative: { ...base.initiative!, entries: [{ ...base.initiative!.entries[0]!, secret: 1 } as never] },
    });
    const text = JSON.stringify(playerSceneToAtlasState(scene, images).state);
    for (const key of ['notePath', 'tags', 'isHidden', 'statblockPath', 'secret']) expect(text).not.toContain(`"${key}"`);
    expect(playerSceneToAtlasState(scene, images).state.objects).toMatchObject({ pins: {}, walls: {}, lights: {}, audios: {} });
  });

  it('shows an empty map without a scene', () => {
    const { state, conditions } = emptyRemoteScene(plainBuilders(images));
    expect(state.background).toBeNull();
    expect(state.objects.tokens).toEqual({});
    expect(state.grid).toMatchObject({ visible: false, size: 70 });
    expect(state.initiativeTrackerOpen).toBe(false);
    expect(conditions).toEqual([]);
  });
});
```

Create `tests/unit/online/obsidian/convertCoverage.test.ts`. Each `sent` field of each coverage table must have a round-trip check here, keyed by the table's own field type. A sent field added later fails both tsc (a missing key in a `satisfies` list) and the test:

```ts
/**
 * Every field the coverage tables mark `sent` comes back out of the converter: Atlas state →
 * the GM's real projection → `playerSceneToAtlasState`. A field added to a table as `sent`
 * without a check here fails.
 */
import { describe, expect, it } from 'vitest';
import {
  DRAWING_FIELD_COVERAGE, FOG_FIELD_COVERAGE, GRID_FIELD_COVERAGE, MEASUREMENT_FIELD_COVERAGE, OBJECT_COVERAGE,
  SCENE_FIELD_COVERAGE, TEXT_FIELD_COVERAGE, TOKEN_FIELD_COVERAGE, type Coverage, type CoverageTable, type KeysOfUnion,
} from '../../../../src/app/online/coverage';
import { playerSceneToAtlasState, type RemoteSceneParts } from '../../../../src/app/online/obsidian/playerSceneToAtlasState';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { projectForPlayers, type ProjectedState } from '../../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../../src/app/online/scene/projectRecords';
import type { PlayerScene } from '../../../../src/app/online/scene/sceneTypes';
import { tokenStress } from '../../../../src/app/pixi/token-renderer/tokenResources';
import type { GridState } from '../../../../src/app/services/MapPersistence';
import type { Character, DrawingStroke, TextElement, Token, TokenEntity } from '../../../../src/app/types';
import type { CollectionGridDefaults } from '../../../../src/app/types/collectionSettingsTypes';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { createDefaultInitiativeState } from '../../../../src/app/types/initiativeTypes';
import type { AnyWidget } from '../../../../src/app/types/widgetTypes';
import { coverageOfFog, fakeAssetIds } from '../sceneFixtures';

const IMAGES: RemoteImages = {
  background: (id) => (id ? `blob:map/${id}` : null),
  token: (id) => (id ? `blob:token/${id}` : null),
};

const hero: Character = {
  id: 'hero', kind: 'character', x: 140, y: 210, imagePath: 'art/hero.png', size: 2, rotation: 45, layer: 3,
  showRing: true, ringColor: '#3366ff', conditions: ['prone', 'frightened'], conditionValues: { frightened: 2 },
  name: 'Anna', hp: { current: 7, max: 10 }, stress: 2, maxStress: 6,
  statblockPath: 'Bestiary/Anna.md', statblockName: 'Anna (statblock)', notePath: 'GM/anna.md', tags: ['pc'],
};
const goblin: Character = { id: 'goblin', kind: 'character', x: 350, y: 70, imagePath: 'art/goblin.png', name: '', statblockPath: 'Bestiary/Goblin.md', statblockName: 'Goblin' };
const imp: Character = { id: 'imp', kind: 'character', x: 560, y: 70, imagePath: 'art/imp.png', name: '', statblockPath: 'Bestiary/Imp.md' };
const crate: Token = { id: 'crate', kind: 'token', x: 420, y: 70, imagePath: 'art/crate.png', showRing: false };
const spy: Character = { id: 'spy', kind: 'character', x: 490, y: 70, imagePath: 'art/spy.png', name: 'Spy', isHidden: true };

const sign: TextElement = {
  id: 'sign', kind: 'text', x: 50, y: 60, text: 'Tavern', fontSize: 24, fontFamily: 'serif', color: '#112233',
  backgroundColor: '#ffffff', padding: 4, borderRadius: 2, opacity: 0.9, width: 120, height: 40, align: 'left',
  bold: true, italic: true, rotation: 10, scale: 1.5,
};
const line: DrawingStroke = {
  id: 'line', kind: 'drawing', timestamp: 5, type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 30, y: 90 }],
  color: '#ff0000', width: 4, opacity: 0.8,
};
const stamp: DrawingStroke = { id: 'stamp', kind: 'drawing', timestamp: 6, type: 'icon', points: [{ x: 200, y: 200 }], color: '#00ff00', width: 40, opacity: 1, icon: 'skull' };
const brush: FogOperation = {
  id: 'brush', kind: 'fog', type: 'brush', timestamp: 1, isErasing: true, offsetX: 10, offsetY: 20, brushRadius: 30,
  points: [{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 120, y: 260 }],
};
const lasso: FogOperation = { id: 'lasso', kind: 'fog', type: 'lasso', timestamp: 2, isErasing: true, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }] };
// Painted far from everything, so it hides nothing the checks look at.
const rect: FogOperation = { id: 'rect', kind: 'fog', type: 'rectangle', timestamp: 3, isErasing: false, x: 2000, y: 2000, width: 100, height: 50 };

const GM_GRID: GridState = {
  enabled: true, visible: true, snapToGrid: false, type: 'hex-vertical', size: 70, offsetX: 5, offsetY: 7, color: '#222222',
  opacity: 0.4, lineType: 'dashed', lineWidth: 2, hexNumbers: 'column-row', hexNumberOpacity: 0.6,
  unitType: 'meters', unitDistance: 1.5, measurementType: 'units', scale: 1, mapScale: 1, autoDetect: false,
};
const COLLECTION: CollectionGridDefaults = {
  unitType: 'yards', unitDistance: 2, measurementMode: 'abstract', abstractRangeBands: [{ name: 'Close', maxSquares: 2 }], diagonalRule: 'alternating',
};
const WIDGETS: Record<string, AnyWidget> = {
  torches: { id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', visible: true, visibleToPlayers: true, value: 0, order: 0 },
  doom: { id: 'doom', type: 'clock', label: 'Doom', icon: 'skull', visible: true, visibleToPlayers: true, value: 0, order: 1, segments: 6 },
  fuse: { id: 'fuse', type: 'timer', label: 'Fuse', icon: 'hourglass', visible: true, visibleToPlayers: true, value: 90, order: 2, duration: 120, direction: 'down' },
  secret: { id: 'secret', type: 'counter', label: 'Secret', icon: 'star', visible: true, visibleToPlayers: false, value: 1, order: 3 },
};

interface Variant { collection?: CollectionGridDefaults | null; grid?: GridState; trackerOpen?: boolean }
interface Trip { back: RemoteSceneParts; sent: PlayerScene }
interface Trips { full: Trip; noCollection: Trip; disabledGrid: Trip; hiddenGrid: Trip; closedTracker: Trip }
type Check = (trips: Trips) => void;
type Checks<K extends PropertyKey> = { readonly [P in K]?: Check };

function trip({ collection = COLLECTION, grid = GM_GRID, trackerOpen = true }: Variant = {}): Trip {
  const fog = { brush, lasso, rect };
  const state: ProjectedState = {
    background: 'atlas-vtt/assets/tavern.png',
    grid,
    objects: {
      tokens: { hero, goblin, imp, crate, spy }, fog, texts: { sign }, drawings: { line, stamp },
      pins: {}, walls: {}, lights: {}, audios: {},
    },
    widgetSettings: { widgets: WIDGETS, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: { torches: 3, doom: 2 },
    initiative: {
      ...createDefaultInitiativeState(), isActive: true, round: 2,
      entries: [{
        id: 'e1', tokenId: 'hero', name: 'Anna', initiative: 17, initiativeModifier: 2, hp: { current: 7, max: 10 },
        imagePath: 'art/hero.png', isActive: true, isDefeated: false, isNPC: false, order: 0,
      }],
    },
    initiativeTrackerOpen: trackerOpen,
  };
  const sent = projectForPlayers(state, {
    sceneId: 'scene-1',
    rules: { showGrid: true, showTokenHP: true, showTokenStress: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
    coverage: coverageOfFog(fog), assets: fakeAssetIds(), mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(),
    collectionGrid: collection,
  });
  return { back: playerSceneToAtlasState(sent, IMAGES), sent };
}

const TRIPS: Trips = {
  full: trip(),
  noCollection: trip({ collection: null }),
  disabledGrid: trip({ grid: { ...GM_GRID, enabled: false } }),
  hiddenGrid: trip({ grid: { ...GM_GRID, visible: false } }),
  closedTracker: trip({ trackerOpen: false }),
};

const tokenOf = (t: Trip, id: string): Record<string, unknown> => t.back.state.objects.tokens[id] as unknown as Record<string, unknown>;
const field = (id: string, key: string, value: unknown): Check => (t) => expect(tokenOf(t.full, id)[key]).toEqual(value);

const TOKEN_CHECKS: Checks<KeysOfUnion<TokenEntity>> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.tokens).sort()).toEqual(['crate', 'goblin', 'hero', 'imp']),
  kind: (t) => {
    expect(tokenOf(t.full, 'hero').kind).toBe('character');
    expect(tokenOf(t.full, 'crate').kind).toBe('token');
  },
  x: field('hero', 'x', 140),
  y: field('hero', 'y', 210),
  imagePath: (t) => expect(tokenOf(t.full, 'hero').imagePath).toBe(IMAGES.token(t.full.sent.tokens.hero?.image ?? null)),
  size: field('hero', 'size', 2),
  rotation: field('hero', 'rotation', 45),
  layer: field('hero', 'layer', 3),
  showRing: (t) => {
    expect(tokenOf(t.full, 'hero').showRing).toBe(true);
    expect(tokenOf(t.full, 'crate').showRing).toBe(false);
  },
  ringColor: field('hero', 'ringColor', '#3366ff'),
  conditions: field('hero', 'conditions', ['prone', 'frightened']),
  conditionValues: field('hero', 'conditionValues', { frightened: 2 }),
  isHidden: (t) => {
    expect(t.full.back.state.objects.tokens).not.toHaveProperty('spy');
    for (const token of Object.values(t.full.back.state.objects.tokens)) expect(token).not.toHaveProperty('isHidden');
  },
  name: field('hero', 'name', 'Anna'),
  statblockPath: (t) => {
    expect(tokenOf(t.full, 'imp').name).toBe('Unknown Creature');
    for (const token of Object.values(t.full.back.state.objects.tokens)) expect(token).not.toHaveProperty('statblockPath');
  },
  statblockName: field('goblin', 'name', 'Goblin'),
  hp: field('hero', 'hp', { current: 7, max: 10 }),
  stress: field('hero', 'stress', tokenStress(hero)),
  maxStress: field('hero', 'maxStress', 6),
};

const TEXT_SAME = [
  'id', 'x', 'y', 'text', 'fontSize', 'fontFamily', 'color', 'backgroundColor', 'padding', 'borderRadius', 'opacity',
  'width', 'height', 'align', 'bold', 'italic', 'rotation', 'scale',
] as const satisfies ReadonlyArray<keyof TextElement>;
const TEXT_CHECKS: Checks<keyof TextElement> = Object.fromEntries(TEXT_SAME.map((key) => [
  key, ((t) => expect(t.full.back.state.objects.texts.sign?.[key]).toEqual(sign[key])) satisfies Check,
]));

const DRAWING_CHECKS: Checks<keyof DrawingStroke> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.drawings).sort()).toEqual(['line', 'stamp']),
  timestamp: (t) => expect(t.full.back.state.objects.drawings.line?.timestamp).toBe(5),
  type: (t) => expect(t.full.back.state.objects.drawings.stamp?.type).toBe('icon'),
  points: (t) => expect(t.full.back.state.objects.drawings.line?.points).toEqual(line.points),
  color: (t) => expect(t.full.back.state.objects.drawings.line?.color).toBe('#ff0000'),
  width: (t) => expect(t.full.back.state.objects.drawings.line?.width).toBe(4),
  opacity: (t) => expect(t.full.back.state.objects.drawings.line?.opacity).toBe(0.8),
  icon: (t) => {
    expect(t.full.back.state.objects.drawings.stamp?.icon).toBe('skull');
    expect(t.full.back.state.objects.drawings.line).not.toHaveProperty('icon');
  },
};

const FOG_CHECKS: Checks<KeysOfUnion<FogOperation>> = {
  id: (t) => expect(Object.keys(t.full.back.state.objects.fog).sort()).toEqual(['brush', 'lasso', 'rect']),
  timestamp: (t) => expect(t.full.back.state.objects.fog.lasso?.timestamp).toBe(2),
  type: (t) => expect(t.full.back.state.objects.fog.rect?.type).toBe('rectangle'),
  isErasing: (t) => {
    expect(t.full.back.state.objects.fog.brush?.isErasing).toBe(true);
    expect(t.full.back.state.objects.fog.rect?.isErasing).toBe(false);
  },
  // The GM applies the drag offset before sending, so the points moved and no offset is left.
  offsetX: (t) => {
    expect(t.full.back.state.objects.fog.brush).toMatchObject({ points: [{ x: 110, y: 120 }, { x: 210, y: 170 }, { x: 130, y: 280 }] });
    expect(t.full.back.state.objects.fog.brush).not.toHaveProperty('offsetX');
  },
  offsetY: (t) => expect(t.full.back.state.objects.fog.brush).not.toHaveProperty('offsetY'),
  points: (t) => expect(t.full.back.state.objects.fog.lasso).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }] }),
  brushRadius: (t) => expect(t.full.back.state.objects.fog.brush).toMatchObject({ brushRadius: 30 }),
  x: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ x: 2000 }),
  y: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ y: 2000 }),
  width: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ width: 100 }),
  height: (t) => expect(t.full.back.state.objects.fog.rect).toMatchObject({ height: 50 }),
};

const gridOf = (t: Trip): GridState | null => t.back.state.grid;
const GRID_CHECKS: Checks<keyof GridState> = {
  enabled: (t) => {
    expect(gridOf(t.full)?.visible).toBe(true);
    expect(gridOf(t.disabledGrid)?.visible).toBe(false);
  },
  visible: (t) => expect(gridOf(t.hiddenGrid)?.visible).toBe(false),
  type: (t) => expect(gridOf(t.full)?.type).toBe('hex-vertical'),
  size: (t) => expect(gridOf(t.full)?.size).toBe(70),
  offsetX: (t) => expect(gridOf(t.full)?.offsetX).toBe(5),
  offsetY: (t) => expect(gridOf(t.full)?.offsetY).toBe(7),
  color: (t) => expect(gridOf(t.full)?.color).toBe('#222222'),
  opacity: (t) => expect(gridOf(t.full)?.opacity).toBe(0.4),
  lineType: (t) => expect(gridOf(t.full)?.lineType).toBe('dashed'),
  lineWidth: (t) => expect(gridOf(t.full)?.lineWidth).toBe(2),
  hexNumbers: (t) => expect(gridOf(t.full)?.hexNumbers).toBe('column-row'),
  hexNumberOpacity: (t) => expect(gridOf(t.full)?.hexNumberOpacity).toBe(0.6),
  snapToGrid: (t) => expect(gridOf(t.full)?.snapToGrid).toBe(false),
  // Without a collection, the map's grid decides the measurement.
  unitType: (t) => {
    expect(t.noCollection.back.measurement.unitType).toBe('meters');
    expect(gridOf(t.noCollection)?.unitType).toBe('meters');
  },
  unitDistance: (t) => expect(t.noCollection.back.measurement.unitDistance).toBe(1.5),
  measurementType: (t) => expect(t.noCollection.back.measurement.mode).toBe('metric'),
};

const MEASUREMENT_CHECKS: Checks<keyof CollectionGridDefaults> = {
  unitType: (t) => expect(t.full.back.measurement.unitType).toBe('yards'),
  unitDistance: (t) => expect(t.full.back.measurement.unitDistance).toBe(2),
  measurementMode: (t) => expect(t.full.back.measurement.mode).toBe('abstract'),
  abstractRangeBands: (t) => expect(t.full.back.measurement.rangeBands).toEqual([{ name: 'Close', maxSquares: 2 }]),
  diagonalRule: (t) => expect(t.full.back.measurement.diagonalRule).toBe('alternating'),
};

const SCENE_CHECKS: Checks<keyof ProjectedState> = {
  background: (t) => {
    expect(t.full.back.state.background).toBe(IMAGES.background(t.full.sent.map.asset));
    expect(t.full.back.state.background).not.toBeNull();
  },
  grid: (t) => expect(gridOf(t.full)).toMatchObject({ enabled: true, visible: true }),
  objects: (t) => expect(Object.keys(t.full.back.state.objects.tokens)).toHaveLength(4),
  widgetSettings: (t) => {
    expect(Object.keys(t.full.back.state.widgetSettings.widgets)).toEqual(['torches', 'doom', 'fuse']);
    expect(t.full.back.state.widgetSettings.widgets.fuse).toMatchObject({ type: 'timer', value: 90 });
  },
  widgetValues: (t) => expect(t.full.back.state.widgetValues).toEqual({ torches: 3, doom: 2 }),
  initiative: (t) => {
    expect(t.full.back.state.initiative).toMatchObject({ round: 2, isActive: true });
    expect(t.full.back.state.initiative.entries).toMatchObject([
      { tokenId: 'hero', initiative: 17, name: 'Anna', hp: { current: 7, max: 10 }, isActive: true, imagePath: tokenOf(t.full, 'hero').imagePath },
    ]);
  },
  initiativeTrackerOpen: (t) => {
    expect(t.full.back.state.initiativeTrackerOpen).toBe(true);
    expect(t.closedTracker.back.state.initiativeTrackerOpen).toBe(false);
  },
};

const OBJECT_CHECKS: Checks<keyof typeof OBJECT_COVERAGE> = {
  tokens: (t) => expect(Object.keys(t.full.back.state.objects.tokens).length).toBeGreaterThan(0),
  fog: (t) => expect(Object.keys(t.full.back.state.objects.fog).length).toBeGreaterThan(0),
  texts: (t) => expect(Object.keys(t.full.back.state.objects.texts).length).toBeGreaterThan(0),
  drawings: (t) => expect(Object.keys(t.full.back.state.objects.drawings).length).toBeGreaterThan(0),
};

function everySentField<K extends PropertyKey>(name: string, table: CoverageTable<K>, checks: Checks<K>): void {
  for (const [key, coverage] of Object.entries(table) as Array<[K, Coverage]>) {
    if (coverage.status !== 'sent') continue;
    const check = checks[key];
    expect(check, `${name}.${String(key)} is sent but has no round trip check`).toBeDefined();
    check?.(TRIPS);
  }
}

describe('the converter covers every sent field', () => {
  it('object kinds', () => everySentField('OBJECT_COVERAGE', OBJECT_COVERAGE, OBJECT_CHECKS));
  it('token fields', () => everySentField('TOKEN_FIELD_COVERAGE', TOKEN_FIELD_COVERAGE, TOKEN_CHECKS));
  it('text fields', () => everySentField('TEXT_FIELD_COVERAGE', TEXT_FIELD_COVERAGE, TEXT_CHECKS));
  it('drawing fields', () => everySentField('DRAWING_FIELD_COVERAGE', DRAWING_FIELD_COVERAGE, DRAWING_CHECKS));
  it('fog fields', () => everySentField('FOG_FIELD_COVERAGE', FOG_FIELD_COVERAGE, FOG_CHECKS));
  it('grid fields', () => everySentField('GRID_FIELD_COVERAGE', GRID_FIELD_COVERAGE, GRID_CHECKS));
  it('measurement fields', () => everySentField('MEASUREMENT_FIELD_COVERAGE', MEASUREMENT_FIELD_COVERAGE, MEASUREMENT_CHECKS));
  it('scene fields', () => everySentField('SCENE_FIELD_COVERAGE', SCENE_FIELD_COVERAGE, SCENE_CHECKS));

  it('keeps GM-only token fields out of the store', () => {
    const back = TRIPS.full.back.state.objects.tokens.hero;
    for (const key of ['notePath', 'tags', 'statblockPath', 'statblockName', 'isHidden', 'difficulty', 'playerId']) expect(back).not.toHaveProperty(key);
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `npx vitest run tests/unit/online/obsidian/playerSceneToAtlasState.test.ts tests/unit/online/obsidian/convertCoverage.test.ts`
Expected: FAIL with "Failed to resolve import ... playerSceneToAtlasState".

- [ ] **Step 8: Export `setOwn`**

In `src/app/online/scene/sceneDiff.ts`, change `function setOwn(` to `export function setOwn(`. Its doc comment stays.

- [ ] **Step 9: Write the record converters**

Create `src/app/online/obsidian/convertTokens.ts`:

```ts
/**
 * The GM's tokens as Atlas records, field by field: only what `PlayerToken` names, so a field
 * the network adds never reaches the store. Condition badges get neutral definitions, as on
 * the join page: players never receive the GM's.
 */
import type { BaseToken, Character, Token, TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { setOwn } from '../scene/sceneDiff';
import type { PlayerCondition, PlayerToken, ScenePoint } from '../scene/sceneTypes';
import { NEUTRAL_BADGE_COLOR } from '../view/layers/tokenUiDrawing';

/** The name of every condition players see: they receive ids and values only. */
export const REMOTE_CONDITION_NAME = 'Condition';

function conditionFields(conditions: readonly PlayerCondition[]): Partial<Pick<BaseToken, 'conditions' | 'conditionValues'>> {
  if (conditions.length === 0) return {};
  const values: Record<string, number> = {};
  for (const condition of conditions) if (condition.value !== null) setOwn(values, condition.id, condition.value);
  return {
    conditions: conditions.map((condition) => condition.id),
    ...(Object.keys(values).length > 0 ? { conditionValues: values } : {}),
  };
}

/**
 * An Atlas token for one the GM sent. `imagePath` is the art's object URL, '' while it has none
 * (Atlas then draws its default token). `position` replaces the GM's while this view shows the
 * token elsewhere: a drag, or a drop the GM has not answered.
 */
export function atlasToken(id: string, token: PlayerToken, imagePath: string, position: ScenePoint | null = null): TokenEntity {
  const base = {
    id,
    x: position?.x ?? token.x,
    y: position?.y ?? token.y,
    size: token.size,
    rotation: token.rotation,
    layer: token.layer,
    imagePath,
    showRing: token.ring !== null,
    ...(token.ring !== null ? { ringColor: token.ring } : {}),
    ...conditionFields(token.conditions),
  };
  if (token.name === null && token.hp === null && token.stress === null) {
    const plain: Token = { ...base, kind: 'token' };
    return plain;
  }
  const character: Character = {
    ...base,
    kind: 'character',
    name: token.name ?? '',
    // The map's nameplate setting stays off: a plate shows only where the GM sent a name.
    ...(token.name !== null ? { showNameplate: true } : {}),
    ...(token.hp !== null ? { hp: { current: token.hp.current, max: token.hp.max } } : {}),
    ...(token.stress !== null
      ? { stress: { current: token.stress.current, max: token.stress.max }, maxStress: token.stress.max }
      : {}),
  };
  return character;
}

/** A neutral definition for each condition id the tokens show, valued where any token sent a value. */
export function neutralConditions(tokens: Readonly<Record<string, PlayerToken>>): ConditionDefinition[] {
  const valued = new Map<string, boolean>();
  for (const token of Object.values(tokens)) {
    for (const condition of token.conditions) valued.set(condition.id, valued.get(condition.id) === true || condition.value !== null);
  }
  return [...valued].map(([id, isValued]) => ({
    id, name: REMOTE_CONDITION_NAME, color: NEUTRAL_BADGE_COLOR, ...(isValued ? { valued: true } : {}),
  }));
}
```

Create `src/app/online/obsidian/convertShapes.ts`:

```ts
/** The GM's fog, texts and drawings as Atlas records, field by field. */
import type { DrawingStroke, TextElement } from '../../types';
import type { FogOperation } from '../../types/fogTypes';
import type { PlayerDrawing, PlayerFogOp, PlayerText, ScenePoint } from '../scene/sceneTypes';

const copyPoints = (points: readonly ScenePoint[]): Array<{ x: number; y: number }> => points.map(({ x, y }) => ({ x, y }));

/** The GM applied the operation's drag offset before sending it, so the record has none. */
export function atlasFog(id: string, op: PlayerFogOp): FogOperation {
  const base = { id, kind: 'fog' as const, timestamp: op.order, isErasing: op.erase };
  switch (op.type) {
    case 'brush':
      return { ...base, type: 'brush', brushRadius: op.radius, points: copyPoints(op.points) };
    case 'lasso':
      return { ...base, type: 'lasso', points: copyPoints(op.points) };
    case 'rectangle':
      return { ...base, type: 'rectangle', x: op.x, y: op.y, width: op.width, height: op.height };
  }
}

export function atlasText(id: string, text: PlayerText): TextElement {
  return {
    id,
    kind: 'text',
    x: text.x,
    y: text.y,
    text: text.text,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    color: text.color,
    ...(text.backgroundColor !== null ? { backgroundColor: text.backgroundColor } : {}),
    padding: text.padding,
    borderRadius: text.borderRadius,
    opacity: text.opacity,
    ...(text.width !== null ? { width: text.width } : {}),
    ...(text.height !== null ? { height: text.height } : {}),
    align: text.align,
    bold: text.bold,
    italic: text.italic,
    rotation: text.rotation,
    scale: text.scale,
  };
}

export function atlasDrawing(id: string, drawing: PlayerDrawing): DrawingStroke {
  return {
    id,
    kind: 'drawing',
    timestamp: drawing.order,
    type: drawing.type,
    points: copyPoints(drawing.points),
    color: drawing.color,
    width: drawing.width,
    opacity: drawing.opacity,
    ...(drawing.icon !== null ? { icon: drawing.icon } : {}),
  };
}
```

Create `src/app/online/obsidian/convertPanels.ts`:

```ts
/**
 * The widget bar and the initiative order as Atlas holds them. Players receive only what the
 * GM shows them, so every widget is visible to players and every entry is shown.
 */
import type { TokenEntity } from '../../types';
import { createDefaultInitiativeState, DEFAULT_INITIATIVE_CONFIG, type InitiativeEntry, type InitiativeState } from '../../types/initiativeTypes';
import { resolveWidgetIcon } from '../../types/widgetIcons';
import type { AnyWidget, CounterWidget, TimerWidget, WidgetSettings } from '../../types/widgetTypes';
import { setOwn } from '../scene/sceneDiff';
import type { PlayerInitiative, PlayerWidget } from '../scene/sceneTypes';

export interface AtlasWidgets {
  widgetSettings: WidgetSettings;
  widgetValues: Record<string, number>;
}

export interface AtlasInitiative {
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;
}

/**
 * The widgets players may see, in the GM's order. Clocks show as counters (their filled count),
 * since players receive no segment count; a timer shows its remaining time, which is also its duration.
 */
export function atlasWidgets(widgets: readonly PlayerWidget[]): AtlasWidgets {
  const records: Record<string, AnyWidget> = {};
  const values: Record<string, number> = {};
  widgets.forEach((widget, order) => {
    const common = {
      id: widget.id, label: widget.label, icon: resolveWidgetIcon(widget.icon), visible: true, visibleToPlayers: true,
      value: widget.value, order, scope: 'scene' as const,
    };
    if (widget.type === 'timer') {
      const timer: TimerWidget = { ...common, type: 'timer', duration: Math.max(1, widget.value), direction: 'down' };
      setOwn(records, widget.id, timer);
      return;
    }
    const counter: CounterWidget = { ...common, type: 'counter' };
    setOwn(records, widget.id, counter);
    setOwn(values, widget.id, widget.value);
  });
  return { widgetSettings: { widgets: records, globalVisible: true, position: 'top', scale: 1 }, widgetValues: values };
}

/** The initiative order players may see; an entry's avatar is its token's art. */
export function atlasInitiative(initiative: PlayerInitiative | null, tokens: Readonly<Record<string, TokenEntity>>): AtlasInitiative {
  if (!initiative) return { initiative: createDefaultInitiativeState(), initiativeTrackerOpen: false };
  const entries = initiative.entries.map((entry, order): InitiativeEntry => ({
    id: entry.id,
    tokenId: entry.tokenId,
    name: entry.name ?? '',
    initiative: entry.initiative,
    initiativeModifier: 0,
    hp: entry.hp ? { current: entry.hp.current, max: entry.hp.max } : { current: 0, max: 0 },
    imagePath: Object.hasOwn(tokens, entry.tokenId) ? tokens[entry.tokenId]?.imagePath ?? '' : '',
    isActive: entry.isActive,
    isDefeated: entry.hp !== null && entry.hp.current <= 0,
    isNPC: true,
    order,
  }));
  return {
    initiative: {
      entries,
      currentIndex: entries.findIndex((entry) => entry.isActive),
      round: initiative.round,
      isActive: initiative.active,
      config: { ...DEFAULT_INITIATIVE_CONFIG },
      removedTokenIds: [],
    },
    initiativeTrackerOpen: true,
  };
}
```

- [ ] **Step 10: Write the converter**

Create `src/app/online/obsidian/playerSceneToAtlasState.ts`:

```ts
/**
 * The presented scene as Atlas's view store holds a map: every field the coverage tables
 * (`online/coverage.ts`) mark `sent`, rebuilt from what players receive. Pure. The online scene
 * view's `RemoteSceneApplier` writes the result into its store with builders that reuse records.
 */
import { DEFAULT_HEX_NUMBER_OPACITY } from '../../grid/hexNumbering';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { GridState } from '../../services/MapPersistence';
import type { ViewAtlasState } from '../../storeFactory';
import type { DrawingStroke, TextElement, TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { FogOperation } from '../../types/fogTypes';
import { DEFAULT_GRID_SIZE } from '../scene/objectBounds';
import { setOwn } from '../scene/sceneDiff';
import {
  withMeasurementDefaults,
  type PlayerDrawing, type PlayerFogOp, type PlayerMeasurement, type PlayerScene, type PlayerText, type PlayerToken, type ScenePoint,
} from '../scene/sceneTypes';
import { atlasInitiative, atlasWidgets } from './convertPanels';
import { atlasDrawing, atlasFog, atlasText } from './convertShapes';
import { atlasToken, neutralConditions } from './convertTokens';
import { atlasMeasurement, type RemoteImages } from './remoteScene';

export type RemoteAtlasState = Pick<
  ViewAtlasState,
  'background' | 'grid' | 'objects' | 'widgetSettings' | 'widgetValues' | 'initiative' | 'initiativeTrackerOpen'
>;

export interface RemoteSceneParts {
  state: RemoteAtlasState;
  /** For `remoteScene.measurement`: the ruler and the measure tool. */
  measurement: MeasurementSettings;
  /** For `remoteScene.conditions`: the badges. */
  conditions: ConditionDefinition[];
}

/** Builds each record kind; the applier passes builders that reuse unchanged records. */
export interface RecordBuilders {
  tokens(tokens: Readonly<Record<string, PlayerToken>>): Record<string, TokenEntity>;
  fog(fog: Readonly<Record<string, PlayerFogOp>>): Record<string, FogOperation>;
  texts(texts: Readonly<Record<string, PlayerText>>): Record<string, TextElement>;
  drawings(drawings: Readonly<Record<string, PlayerDrawing>>): Record<string, DrawingStroke>;
}

/** Converts every record of a kind, keeping ids as own properties. */
export function mapRecords<S, A>(records: Readonly<Record<string, S>>, convert: (id: string, record: S) => A): Record<string, A> {
  const result: Record<string, A> = {};
  for (const [id, record] of Object.entries(records)) setOwn(result, id, convert(id, record));
  return result;
}

/** Builders that convert every record anew; `positionOf` places tokens this view shows elsewhere. */
export function plainBuilders(images: RemoteImages, positionOf: (tokenId: string) => ScenePoint | null = () => null): RecordBuilders {
  return {
    tokens: (tokens) => mapRecords(tokens, (id, token) => atlasToken(id, token, images.token(token.image) ?? '', positionOf(id))),
    fog: (fog) => mapRecords(fog, atlasFog),
    texts: (texts) => mapRecords(texts, atlasText),
    drawings: (drawings) => mapRecords(drawings, atlasDrawing),
  };
}

/** The grid's measurement fields; Atlas's ruler reads the full settings from `remoteScene.measurement`. */
function gridUnits(measurement: PlayerMeasurement): Pick<GridState, 'snapToGrid' | 'measurementType' | 'unitType' | 'unitDistance'> {
  return {
    snapToGrid: measurement.snapToGrid,
    measurementType: measurement.mode === 'metric' ? 'units' : 'abstract',
    ...(measurement.unitType !== 'custom' ? { unitType: measurement.unitType } : {}),
    unitDistance: measurement.unitDistance,
  };
}

/** A grid the GM hides keeps the map's cell size, so tokens keep their size and drops still snap. */
export function atlasGrid(scene: PlayerScene): GridState {
  const units = gridUnits(scene.measurement);
  const grid = scene.grid;
  if (!grid) {
    return { enabled: true, visible: false, type: 'square', size: scene.map.cellSize, offsetX: 0, offsetY: 0, opacity: 0, ...units };
  }
  return {
    enabled: true,
    visible: true,
    type: grid.type,
    size: grid.size,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    ...(grid.color !== null ? { color: grid.color } : {}),
    opacity: grid.opacity,
    lineType: grid.lineType,
    lineWidth: grid.lineWidth,
    ...(grid.hexNumbers !== null
      ? { hexNumbers: grid.hexNumbers, hexNumberOpacity: grid.hexNumberOpacity ?? DEFAULT_HEX_NUMBER_OPACITY }
      : {}),
    ...units,
  };
}

function objectsOf(builders: RecordBuilders, scene: Pick<PlayerScene, 'tokens' | 'fog' | 'texts' | 'drawings'>): ViewAtlasState['objects'] {
  return {
    tokens: builders.tokens(scene.tokens),
    fog: builders.fog(scene.fog),
    pins: {},
    texts: builders.texts(scene.texts),
    drawings: builders.drawings(scene.drawings),
    walls: {},
    lights: {},
    audios: {},
  };
}

export function playerSceneToAtlasState(scene: PlayerScene, images: RemoteImages, builders: RecordBuilders = plainBuilders(images)): RemoteSceneParts {
  const objects = objectsOf(builders, scene);
  return {
    state: {
      background: images.background(scene.map.asset),
      grid: atlasGrid(scene),
      objects,
      ...atlasWidgets(scene.widgets),
      ...atlasInitiative(scene.initiative, objects.tokens),
    },
    measurement: atlasMeasurement(scene.measurement),
    conditions: neutralConditions(scene.tokens),
  };
}

/** The GM shows no scene: an empty map with Atlas's default measurement. */
export function emptyRemoteScene(builders: RecordBuilders): RemoteSceneParts {
  const measurement = withMeasurementDefaults(undefined);
  return {
    state: {
      background: null,
      grid: { enabled: true, visible: false, type: 'square', size: DEFAULT_GRID_SIZE, offsetX: 0, offsetY: 0, opacity: 0, ...gridUnits(measurement) },
      objects: objectsOf(builders, { tokens: {}, fog: {}, texts: {}, drawings: {} }),
      ...atlasWidgets([]),
      ...atlasInitiative(null, {}),
    },
    measurement: atlasMeasurement(measurement),
    conditions: [],
  };
}
```

- [ ] **Step 11: Run the converter tests**

Run: `npx vitest run tests/unit/online/obsidian/playerSceneToAtlasState.test.ts tests/unit/online/obsidian/convertCoverage.test.ts`
Expected: PASS. If a coverage check fails on a value, compare it with `projectForPlayers` (the GM side is the reference) and fix the converter, never the check.

- [ ] **Step 12: Write the failing applier test**

Create `tests/unit/online/obsidian/remoteSceneApplier.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { RemoteSceneApplier } from '../../../../src/app/online/obsidian/RemoteSceneApplier';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { applyPatch } from '../../../../src/app/online/scene/sceneDiff';
import type { ScenePoint } from '../../../../src/app/online/scene/sceneTypes';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { getHistoryStore } from '../../../../src/app/stores/history';
import { playerScene, playerToken } from '../sceneFixtures';

let count = 0;

function setup(positionOf?: (tokenId: string) => ScenePoint | null) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `remote-${count++}`, undefined, false, { remote: true });
  const urls = new Map<string, string>();
  const images: RemoteImages = {
    background: (id) => (id ? urls.get(`map:${id}`) ?? null : null),
    token: (id) => (id ? urls.get(`token:${id}`) ?? null : null),
  };
  const applier = new RemoteSceneApplier({ store, images, ...(positionOf ? { positionOf } : {}) });
  return { store, applier, urls };
}

describe('RemoteSceneApplier', () => {
  it("writes the scene into the store, and the GM's measurement and the badges into its remote part", () => {
    const { store, applier } = setup();
    const scene = playerScene({ tokens: { t1: playerToken({ name: 'A', conditions: [{ id: 'prone', value: null }] }) } });
    applier.apply(scene);
    const state = store.getState();
    expect(applier.current).toBe(scene);
    expect(Object.keys(state.objects.tokens)).toEqual(['t1']);
    expect(state.objects.texts.x1?.text).toBe('Tavern');
    expect(state.initiativeTrackerOpen).toBe(true);
    expect(state.remoteScene?.measurement).toMatchObject({ mode: 'metric', unitDistance: 5 });
    expect(state.remoteScene?.conditions.map((condition) => condition.id)).toEqual(['prone']);
  });

  it('keeps unchanged Atlas records as the same objects across a patch, so renderers redraw only what changed', () => {
    const { store, applier } = setup();
    const scene = playerScene({ tokens: { t1: playerToken(), t2: playerToken({ x: 300 }) } });
    applier.apply(scene);
    const before = store.getState();
    applier.apply(applyPatch(scene, { set: {}, upsert: { tokens: { t2: playerToken({ x: 370 }) } }, remove: {} }));
    const after = store.getState();
    expect(after.objects.tokens.t1).toBe(before.objects.tokens.t1);
    expect(after.objects.tokens.t2?.x).toBe(370);
    expect(after.objects.fog).toBe(before.objects.fog);
    expect(after.objects.pins).toBe(before.objects.pins);
    expect(after.grid).toBe(before.grid);
    expect(after.widgetSettings).toBe(before.widgetSettings);
    expect(after.initiative).toBe(before.initiative);
  });

  it('writes nothing when nothing changed', () => {
    const { store, applier } = setup();
    const scene = playerScene();
    applier.apply(scene);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    applier.apply(scene);
    applier.refresh();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shows an image once it arrives, rebuilding only what shows it', () => {
    const { store, applier, urls } = setup();
    applier.apply(playerScene({ tokens: { t1: playerToken({ image: 'a' }), t2: playerToken({ image: 'b' }) } }));
    const before = store.getState();
    urls.set('token:a', 'blob:app://obsidian.md/token-a');
    urls.set('map:map-asset', 'blob:app://obsidian.md/map');
    applier.refresh();
    const after = store.getState();
    expect(after.objects.tokens.t1?.imagePath).toBe('blob:app://obsidian.md/token-a');
    expect(after.objects.tokens.t2).toBe(before.objects.tokens.t2);
    expect(after.background).toBe('blob:app://obsidian.md/map');
  });

  it("keeps a position this view shows over the GM's until it lets go", () => {
    let shown: ScenePoint | null = { x: 500, y: 600 };
    const { store, applier } = setup((id) => (id === 't1' ? shown : null));
    applier.apply(playerScene());
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 500, y: 600 });
    shown = null;
    applier.refresh();
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 100, y: 100 });
  });

  it('clears the map when the GM shows no scene', () => {
    const { store, applier } = setup();
    applier.apply(playerScene());
    applier.apply(null);
    const state = store.getState();
    expect(applier.current).toBeNull();
    expect(state.objects.tokens).toEqual({});
    expect(state.objects.fog).toEqual({});
    expect(state.background).toBeNull();
    expect(state.initiativeTrackerOpen).toBe(false);
    expect(state.widgetSettings.widgets).toEqual({});
    expect(state.remoteScene?.conditions).toEqual([]);
  });

  it('records no undo step', () => {
    const { store, applier } = setup();
    applier.apply(playerScene());
    applier.apply(playerScene({ tokens: {} }));
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });
});
```

- [ ] **Step 13: Run it to see it fail**

Run: `npx vitest run tests/unit/online/obsidian/remoteSceneApplier.test.ts`
Expected: FAIL with "Failed to resolve import ... RemoteSceneApplier".

- [ ] **Step 14: Write the applier**

Create `src/app/online/obsidian/RemoteSceneApplier.ts`:

```ts
/**
 * Writes the presented scene into the online scene view's store. An Atlas record is rebuilt only
 * when its GM record changed (`PlayerSceneMirror` keeps unchanged ones as the same objects) or
 * its image URL or shown position changed, and a store field is written only when it changed,
 * so Atlas's renderers redraw what a local edit would make them redraw. Writes are untracked:
 * the remote store records no history anyway.
 */
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { runUntracked } from '../../stores/history';
import type { DrawingStroke, TextElement, TokenEntity } from '../../types';
import type { FogOperation } from '../../types/fogTypes';
import { sameValue, setOwn } from '../scene/sceneDiff';
import type { PlayerDrawing, PlayerFogOp, PlayerScene, PlayerText, PlayerToken, ScenePoint } from '../scene/sceneTypes';
import { atlasDrawing, atlasFog, atlasText } from './convertShapes';
import { atlasToken } from './convertTokens';
import { emptyRemoteScene, playerSceneToAtlasState, type RecordBuilders, type RemoteSceneParts } from './playerSceneToAtlasState';
import type { RemoteImages } from './remoteScene';

type RemoteStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>;

interface Entry<S, A> {
  source: S;
  /** What else the record was built from: its image URL and shown position. */
  input: string;
  record: A;
}

/** Atlas records by id, kept while their GM record and inputs stay the same; the same result object while nothing changed. */
class RecordMemo<S, A> {
  private entries = new Map<string, Entry<S, A>>();
  private result: Record<string, A> = {};

  build(records: Readonly<Record<string, S>>, input: (id: string, source: S) => string, convert: (id: string, source: S) => A): Record<string, A> {
    const next = new Map<string, Entry<S, A>>();
    let changed = Object.keys(records).length !== this.entries.size;
    for (const [id, source] of Object.entries(records)) {
      const key = input(id, source);
      const previous = this.entries.get(id);
      if (previous && previous.source === source && previous.input === key) {
        next.set(id, previous);
        continue;
      }
      changed = true;
      next.set(id, { source, input: key, record: convert(id, source) });
    }
    this.entries = next;
    if (changed) {
      const result: Record<string, A> = {};
      for (const [id, entry] of next) setOwn(result, id, entry.record);
      this.result = result;
    }
    return this.result;
  }

  clear(): void {
    this.entries = new Map();
    this.result = {};
  }
}

export interface RemoteSceneApplierOptions {
  store: RemoteStore;
  images: RemoteImages;
  /** Where this view shows a token instead of the GM's position: a drag, or a drop the GM has not answered. */
  positionOf?: (tokenId: string) => ScenePoint | null;
}

const NO_POSITION = (): ScenePoint | null => null;
const NO_INPUT = (): string => '';
const pointKey = (point: ScenePoint | null): string => (point ? `${point.x},${point.y}` : '');
const OBJECT_KINDS = ['tokens', 'fog', 'texts', 'drawings'] as const;

export class RemoteSceneApplier {
  private scene: PlayerScene | null = null;
  private readonly tokens = new RecordMemo<PlayerToken, TokenEntity>();
  private readonly fog = new RecordMemo<PlayerFogOp, FogOperation>();
  private readonly texts = new RecordMemo<PlayerText, TextElement>();
  private readonly drawings = new RecordMemo<PlayerDrawing, DrawingStroke>();
  private readonly builders: RecordBuilders;

  constructor(private readonly options: RemoteSceneApplierOptions) {
    const { images } = options;
    const positionOf = options.positionOf ?? NO_POSITION;
    this.builders = {
      tokens: (tokens) => this.tokens.build(
        tokens,
        (id, token) => `${images.token(token.image) ?? ''}|${pointKey(positionOf(id))}`,
        (id, token) => atlasToken(id, token, images.token(token.image) ?? '', positionOf(id)),
      ),
      fog: (fog) => this.fog.build(fog, NO_INPUT, atlasFog),
      texts: (texts) => this.texts.build(texts, NO_INPUT, atlasText),
      drawings: (drawings) => this.drawings.build(drawings, NO_INPUT, atlasDrawing),
    };
  }

  /** The scene last applied; null while none is shown. */
  get current(): PlayerScene | null {
    return this.scene;
  }

  apply(scene: PlayerScene | null): void {
    this.scene = scene;
    this.write();
  }

  /** Writes the last scene again: an image arrived or went, or a shown position changed. */
  refresh(): void {
    this.write();
  }

  dispose(): void {
    this.scene = null;
    this.tokens.clear();
    this.fog.clear();
    this.texts.clear();
    this.drawings.clear();
  }

  private write(): void {
    const parts = this.scene ? playerSceneToAtlasState(this.scene, this.options.images, this.builders) : emptyRemoteScene(this.builders);
    const { store } = this.options;
    const update = this.changes(store.getState(), parts);
    if (Object.keys(update).length === 0) return;
    runUntracked(store, () => store.setState(update));
  }

  private changes(state: ViewAtlasState, parts: RemoteSceneParts): Partial<ViewAtlasState> {
    const next = parts.state;
    const update: Partial<ViewAtlasState> = {};
    if (state.background !== next.background) update.background = next.background;
    if (!sameValue(state.grid, next.grid)) update.grid = next.grid;
    if (OBJECT_KINDS.some((kind) => state.objects[kind] !== next.objects[kind])) {
      // Pins, walls, lights and sounds stay the store's own empty records.
      update.objects = {
        ...state.objects, tokens: next.objects.tokens, fog: next.objects.fog, texts: next.objects.texts, drawings: next.objects.drawings,
      };
    }
    if (!sameValue(state.widgetSettings, next.widgetSettings)) update.widgetSettings = next.widgetSettings;
    if (!sameValue(state.widgetValues, next.widgetValues)) update.widgetValues = next.widgetValues;
    if (!sameValue(state.initiative, next.initiative)) update.initiative = next.initiative;
    if (state.initiativeTrackerOpen !== next.initiativeTrackerOpen) update.initiativeTrackerOpen = next.initiativeTrackerOpen;
    const remote = state.remoteScene;
    if (remote && (!sameValue(remote.measurement, parts.measurement) || !sameValue(remote.conditions, parts.conditions))) {
      update.remoteScene = { ...remote, measurement: parts.measurement, conditions: parts.conditions };
    }
    return update;
  }
}
```

- [ ] **Step 15: Run the task's tests and the neighbours**

Run: `npx vitest run tests/unit/online/obsidian/ tests/unit/online/coverage.test.ts tests/unit/online/sceneDiff.test.ts tests/unit/online/playerSceneMirror.test.ts tests/unit/collectionWidgets.test.ts tests/unit/mapClipboard.test.ts tests/unit/statblockResourcePersistence.test.ts`
Expected: PASS.

- [ ] **Step 16: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 17: Commit**

```bash
git add src/app/online/obsidian/remoteScene.ts src/app/online/obsidian/convertTokens.ts src/app/online/obsidian/convertShapes.ts src/app/online/obsidian/convertPanels.ts src/app/online/obsidian/playerSceneToAtlasState.ts src/app/online/obsidian/RemoteSceneApplier.ts src/app/online/scene/sceneDiff.ts src/app/storeFactory.ts tests/unit/online/obsidian/remoteStore.test.ts tests/unit/online/obsidian/playerSceneToAtlasState.test.ts tests/unit/online/obsidian/convertCoverage.test.ts tests/unit/online/obsidian/remoteSceneApplier.test.ts
git commit -m "feat(online): remote view store and the player scene converter"
```

---

### Task 2: Joining from Obsidian

**Join online session…** opens a dialog for the link and the name. `OnlineJoinService` runs the shared `PlayerSession` and `AssetLoader` for one joined session at a time and refuses while hosting. It opens the Online scene tab on admission and keeps the scene, control list and dice log, so a tab that attaches later gets them all. It reconnects with the same player key and leaves cleanly. The GM's panel marks Obsidian players. Images become two object URLs each.

**Files:**
- Modify: `src/app/online/PlayerSession.ts` (`clientKind` option)
- Modify: `src/app/online/gmSessionTypes.ts`, `src/app/online/GmSession.ts` (`SessionPlayer.client`)
- Modify: `src/app/online/joinLink.ts` (`parseJoinLink`)
- Modify: `src/app/online/onlineSettings.ts` (`playerName`, `keepImages`)
- Modify: `src/app/settings/onlineSettingsSection.ts` (the keep-images switch)
- Modify: `src/app/online/page/pageScreen.ts` (export `sessionReasonText`)
- Modify: `src/app/online/page/diceLogModel.ts` (extract `mergeDiceLog`)
- Create: `src/app/online/obsidian/objectUrlImages.ts`
- Create: `src/app/online/obsidian/joinedSessionStore.ts`
- Create: `src/app/online/obsidian/onlineSceneTab.ts`
- Create: `src/app/online/obsidian/OnlineJoinService.ts`
- Create: `src/app/online/obsidian/ui/JoinSessionModal.ts`
- Modify: `src/app/online/ui/onlineCopy.ts`, `src/app/online/ui/online-session.scss`
- Modify: `src/app/online/OnlineSessionService.ts` (refuse hosting while joined)
- Modify: `src/app/online/registerOnline.ts`, `main.ts`
- Modify: `src/app/react/components/online/OnlinePlayerList.tsx`, `src/app/react/components/online/OnlinePanel.tsx`, `src/app/react/components/online/online-panel.scss`
- Test: `tests/unit/online/obsidian/objectUrlImages.test.ts`, `tests/unit/online/obsidian/onlineJoinService.test.ts`, `tests/unit/online/obsidian/joinSessionModal.test.ts`, `tests/unit/online/gmSessionClient.test.ts`
- Test (additions): `tests/unit/online/joinLink.test.ts`, `tests/unit/online/onlineSettings.test.ts`, `tests/unit/online/diceLogModel.test.ts` (unchanged, must stay green), `tests/unit/online/onlineSessionService.test.ts`, `tests/unit/onlinePanel.test.tsx`

**Interfaces:**
- Consumes: `PlayerSession`, `PlayerSessionState`, `RECONNECT_GIVE_UP_MS` (`src/app/online/PlayerSession.ts`), `createJoinSession` (`src/app/online/preview/joinSession.ts`), `AssetLoader`/`ImageDecoder`/`DecodedImage`, `AssetCache`, `openIndexedDbImageStore`, `parseJoinFragment`, `normalizePlayerName`, `randomId`, `createPeerClient`, `onlineSessionStore`, `RemoteImages` (Task 1).
- Produces:
  - `PlayerSessionOptions.clientKind?: 'web' | 'obsidian'`.
  - `SessionPlayer.client?: 'obsidian'`.
  - `parseJoinLink(text): JoinTarget | null`.
  - `OnlineSettings.playerName: string` and `OnlineSettings.keepImages: boolean`.
  - `sessionReasonText(reason, fallback)`.
  - `mergeDiceLog(list, entries, replay): { list; newest }`.
  - `decodeToObjectUrls(bytes, mime)`, `urlsOf(image)`, `ImageUrls`.
  - `joinedSessionStore` and `isInSession(state)`.
  - `ONLINE_SCENE_VIEW_TYPE = 'atlas-online-scene'`, `ONLINE_SCENE_TITLE = 'Online scene'`, `openOnlineSceneTab(app)`.
  - `OnlineSceneSink { session; scene; camera; control; moveRefused; diceLog; laser; images; close }`.
  - `OnlineJoinService`:
    - `forApp(app)`;
    - `join(link, name): JoinProblem | null`, `leave()`, `reconnect()`;
    - `attach(sink): (() => void) | null`;
    - `images: RemoteImages`;
    - `sendTokenMove`, `sendDiceRoll`, `sendLaser`;
    - `state`, `rememberedName()`, `playerKeyFor(hostId)`, `dispose()`.
  - `JOIN_PROBLEM_TEXT`, `JoinSessionModal`, `openJoinSessionModal(app)`, `JOIN_SESSION_LABEL`.

- [ ] **Step 1: Write the failing protocol-side tests**

Create `tests/unit/online/gmSessionClient.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmSession, type SessionPlayer } from '../../../src/app/online/GmSession';
import { PlayerSession } from '../../../src/app/online/PlayerSession';
import { decodeControl, encodeControl, type ControlMessage } from '../../../src/app/online/protocol';
import { MemoryNetwork } from '../../../src/app/online/transport/MemoryTransport';

function gm(): { network: MemoryNetwork; session: GmSession; players: () => SessionPlayer[]; requests: SessionPlayer[] } {
  const network = new MemoryNetwork();
  const requests: SessionPlayer[] = [];
  let players: SessionPlayer[] = [];
  const session = new GmSession(network.host('gm'), {
    title: 'Table', onJoinRequest: (player) => requests.push(player), onRequestClosed: () => {}, onPlayersChanged: (list) => { players = list; },
  });
  session.start();
  return { network, session, players: () => players, requests };
}

describe('which app a player joins from', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends kind obsidian from Atlas, and web by default', async () => {
    const { network } = gm();
    const sent: ControlMessage[] = [];
    const transport = {
      connect: async (hostId: string) => {
        const link = await network.client().connect(hostId);
        const send = link.send.bind(link);
        link.send = (channel, data) => {
          const decoded = channel === 'control' ? decodeControl(data) : null;
          if (decoded?.kind === 'message') sent.push(decoded.message);
          send(channel, data);
        };
        return link;
      },
    };
    const atlas = new PlayerSession({ hostId: 'gm', name: 'A', playerKey: 'ka', clientVersion: '0.5.0', clientKind: 'obsidian', transport, onChange: () => {} });
    const web = new PlayerSession({ hostId: 'gm', name: 'B', playerKey: 'kb', clientVersion: '0.1.0', transport, onChange: () => {} });
    atlas.start();
    web.start();
    await vi.advanceTimersByTimeAsync(0);
    const joins = sent.flatMap((message) => (message.type === 'join' ? [[message.name, message.client]] : []));
    expect(joins).toEqual(expect.arrayContaining([['A', { kind: 'obsidian', version: '0.5.0' }], ['B', { kind: 'web', version: '0.1.0' }]]));
    expect(joins).toHaveLength(2);
    atlas.stop();
    web.stop();
  });

  it('marks Obsidian players for the GM and leaves web players unmarked', async () => {
    const { network, players } = gm();
    const atlas = await network.client().connect('gm');
    atlas.send('control', encodeControl({ v: 1, type: 'join', name: 'Anna', playerKey: 'ka', client: { kind: 'obsidian', version: '1' } }));
    const web = await network.client().connect('gm');
    web.send('control', encodeControl({ v: 1, type: 'join', name: 'Ben', playerKey: 'kb', client: { kind: 'web', version: '1' } }));
    expect(players().map((player) => [player.name, player.client])).toEqual([['Anna', 'obsidian'], ['Ben', undefined]]);
    expect(players()[1]).not.toHaveProperty('client');
  });

  it('follows the app of a returning player', async () => {
    const { network, session, players, requests } = gm();
    const first = await network.client().connect('gm');
    first.send('control', encodeControl({ v: 1, type: 'join', name: 'Anna', playerKey: 'ka', client: { kind: 'obsidian', version: '1' } }));
    session.allow(requests[0]!.playerId);
    first.close();
    const again = await network.client().connect('gm');
    again.send('control', encodeControl({ v: 1, type: 'join', name: 'Anna', playerKey: 'ka', client: { kind: 'web', version: '1' } }));
    expect(players()).toEqual([{ playerId: requests[0]!.playerId, name: 'Anna', status: 'admitted' }]);
  });
});
```

Append to `tests/unit/online/joinLink.test.ts` (inside a new `describe`; add `parseJoinLink` to the file's import from `../../../src/app/online/joinLink`):

```ts
describe('parseJoinLink', () => {
  it('reads a whole pasted link or only its fragment, around spaces', () => {
    expect(parseJoinLink('  https://example.org/join/#id=gm-1  ')).toEqual(parseJoinFragment('#id=gm-1'));
    expect(parseJoinLink('#id=gm-1')?.hostId).toBe('gm-1');
  });

  it('refuses text without a fragment or with a broken one', () => {
    expect(parseJoinLink('https://example.org/join/')).toBeNull();
    expect(parseJoinLink('gm-1')).toBeNull();
    expect(parseJoinLink('https://example.org/#nothing=here')).toBeNull();
  });
});
```

In `tests/unit/online/onlineSettings.test.ts`, change the expected object of 'keeps valid stored fields and drops invalid relays' to end with `logEvents: false, playerName: '', keepImages: true,`, and append:

```ts
  it("remembers the player's name and keeps images unless switched off", () => {
    expect(DEFAULT_ONLINE_SETTINGS).toMatchObject({ playerName: '', keepImages: true });
    expect(resolveOnlineSettings({ playerName: 'Anna', keepImages: false })).toMatchObject({ playerName: 'Anna', keepImages: false });
    expect(resolveOnlineSettings({ playerName: 4, keepImages: 'no' })).toMatchObject({ playerName: '', keepImages: true });
  });
```

(inside the existing `describe('online settings', …)`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/online/gmSessionClient.test.ts tests/unit/online/joinLink.test.ts tests/unit/online/onlineSettings.test.ts`
Expected: FAIL. The join message says `web` for both, `client` is never recorded, `parseJoinLink` is not exported, and the settings have no `playerName`.

- [ ] **Step 3: Send and record the client kind**

In `src/app/online/PlayerSession.ts`, add to `PlayerSessionOptions` after `clientVersion: string;`:

```ts
  /** The app that joins: the web page (the default) or Atlas in Obsidian. */
  clientKind?: 'web' | 'obsidian';
```

and in `connect()` replace `client: { kind: 'web', version: this.options.clientVersion },` with:

```ts
      client: { kind: this.options.clientKind ?? 'web', version: this.options.clientVersion },
```

In `src/app/online/gmSessionTypes.ts`, add to `SessionPlayer` after `status: PlayerStatus;`:

```ts
  /** Set for a player who joined from Atlas in Obsidian; absent for the web page. */
  client?: 'obsidian';
```

In `src/app/online/GmSession.ts`, add above `export class GmSession`:

```ts
/** Records which app a player joined from; a returning player may come back from the other one. */
function setClient(player: SessionPlayer, kind: 'web' | 'obsidian'): void {
  if (kind === 'obsidian') player.client = 'obsidian';
  else delete player.client;
}
```

In `join()`, right after `known.link = link;` add `setClient(known.player, message.client.kind);`. Then replace the new entry's `player: { playerId: randomId(), name, status: 'pending' },` with:

```ts
      player: { playerId: randomId(), name, status: 'pending', ...(message.client.kind === 'obsidian' ? { client: 'obsidian' as const } : {}) },
```

`getPlayers` spreads each player, so the GM's store and panel get `client`. `presence` is built field by field and stays unchanged.

- [ ] **Step 4: Parse pasted links and remember the name**

In `src/app/online/joinLink.ts`, append:

```ts
/** The GM and servers of a pasted join link: the whole link or only its `#…` part; null for anything else. */
export function parseJoinLink(text: string): JoinTarget | null {
  const trimmed = text.trim();
  const hash = trimmed.indexOf('#');
  return hash === -1 ? null : parseJoinFragment(trimmed.slice(hash));
}
```

In `src/app/online/onlineSettings.ts`:
1. Add to `interface OnlineSettings` after `logEvents: boolean;`:

```ts
  /** The name this Atlas last joined a session with, offered next time. */
  playerName: string;
  /** Joining from Atlas: keep a session's images on this device (outside the vault) for the next one. */
  keepImages: boolean;
```

2. Add `playerName: '', keepImages: true,` at the end of `DEFAULT_ONLINE_SETTINGS`.
3. In `resolveOnlineSettings`, after `logEvents: source.logEvents === true,` add:

```ts
    playerName: typeof source.playerName === 'string' ? source.playerName.slice(0, 200) : defaults.playerName,
    keepImages: source.keepImages !== false,
```

In `src/app/settings/onlineSettingsSection.ts`, add this row before 'Log online play events':

```ts
      {
        name: 'Keep online images on this device',
        desc: 'When you join a session from Atlas, keep its images outside your vault so the next session loads faster. Switching it off deletes them.',
        aliases: ['cache', 'images', 'join', 'online'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(settings.getOnlineSettings().keepImages)
            .onChange((keepImages) => settings.setOnlineSettings({ keepImages })));
        },
      },
```

- [ ] **Step 5: Run the protocol-side tests**

Run: `npx vitest run tests/unit/online/gmSessionClient.test.ts tests/unit/online/joinLink.test.ts tests/unit/online/onlineSettings.test.ts tests/unit/online/gmSession.test.ts tests/unit/online/playerSession.test.ts tests/unit/online/onlineUi.test.ts`
Expected: PASS.

- [ ] **Step 6: Share the reason texts and the dice log merge**

In `src/app/online/page/pageScreen.ts`, replace

```ts
/** Own keys only: a reason from the network such as `constructor` must not reach the prototype. */
function reasonText(reason: string | null | undefined, fallback: 'denied' | 'unreachable'): string {
```

with

```ts
/** Why a session ended, as the join page says it. Own keys only: a reason from the network such as `constructor` must not reach the prototype. */
export function sessionReasonText(reason: string | null | undefined, fallback: 'denied' | 'unreachable'): string {
```

and rename its two calls in `pageScreen` from `reasonText(` to `sessionReasonText(`.

In `src/app/online/page/diceLogModel.ts`, add above `export class PlayerDiceLog`:

```ts
/**
 * A dice log after `entries` arrived: a replay replaces it; new rolls go first, each once by id,
 * at most 50. `list` is the same array when nothing was new; `newest` is the newest new roll.
 */
export function mergeDiceLog(
  list: readonly DiceLogEntry[],
  entries: readonly DiceLogEntry[],
  replay: boolean,
): { list: readonly DiceLogEntry[]; newest: DiceLogEntry | null } {
  if (replay) return { list: entries.slice(0, DICE_LIMITS.logEntries), newest: null };
  const known = new Set(list.map((entry) => entry.id));
  const fresh = entries.filter((entry) => !known.has(entry.id));
  const newest = fresh[0] ?? null;
  if (!newest) return { list, newest: null };
  return { list: [...fresh, ...list].slice(0, DICE_LIMITS.logEntries), newest };
}
```

and replace the body of `PlayerDiceLog.receive` with:

```ts
    const merged = mergeDiceLog(this.list, entries, replay);
    if (merged.list === this.list) return;
    this.list = merged.list;
    if (merged.newest && !this.open) this.showToast(merged.newest);
    this.options.onChange();
```

Run: `npx vitest run tests/unit/online/diceLogModel.test.ts tests/unit/online/diceLogView.test.ts tests/unit/online/pageScreen.test.ts`
Expected: PASS (behaviour unchanged).

- [ ] **Step 7: Write the failing image decoder test**

Create `tests/unit/online/obsidian/objectUrlImages.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeToObjectUrls, urlsOf } from '../../../../src/app/online/obsidian/objectUrlImages';

const created: string[] = [];
const revoked: string[] = [];
let decodes = true;

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  decodes = true;
  let next = 0;
  // jsdom has no object URLs and no image decoding.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true, writable: true, value: vi.fn(() => { const url = `blob:test/${++next}`; created.push(url); return url; }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn((url: string) => { revoked.push(url); }) });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true, writable: true, value: vi.fn(() => (decodes ? Promise.resolve() : Promise.reject(new Error('bad image')))),
  });
});

afterEach(() => {
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).decode;
});

describe('decodeToObjectUrls', () => {
  it('keeps one URL for the map and another for tokens, and revokes both once on release', async () => {
    const image = await decodeToObjectUrls(new ArrayBuffer(8), 'image/png');
    const urls = urlsOf(image);
    expect(urls).not.toBeNull();
    expect(urls?.background).not.toBe(urls?.token);
    expect(created).toEqual([urls?.background, urls?.token]);
    image?.release();
    image?.release();
    expect(revoked.sort()).toEqual([...created].sort());
  });

  it('refuses bytes that do not decode, and keeps no URL of them', async () => {
    decodes = false;
    expect(await decodeToObjectUrls(new ArrayBuffer(8), 'image/svg+xml')).toBeNull();
    expect(revoked.sort()).toEqual([...created].sort());
  });

  it('finds no URLs on an image another decoder made', () => {
    expect(urlsOf({ image: {} as HTMLImageElement, width: 1, height: 1, release: () => {} })).toBeNull();
    expect(urlsOf(null)).toBeNull();
  });
});
```

- [ ] **Step 8: Run it to see it fail, then write the decoder**

Run: `npx vitest run tests/unit/online/obsidian/objectUrlImages.test.ts`
Expected: FAIL with "Failed to resolve import ... objectUrlImages".

Create `src/app/online/obsidian/objectUrlImages.ts`:

```ts
/**
 * The online scene's image decoder for `AssetLoader`. It checks that the bytes decode as an image,
 * through an `<img>`, which never runs an SVG's scripts. It keeps two object URLs of them: one for
 * the map background and one for token art. Atlas's background cache and token cache each unload a
 * texture by its URL, so a map and a token of the same image never share one. `release` revokes
 * both. The bytes stay in memory; nothing goes to the vault.
 */
import type { AssetMime } from '../assets/assetIds';
import type { DecodedImage } from '../assets/AssetLoader';

export interface ImageUrls {
  background: string;
  token: string;
}

export interface UrlImage extends DecodedImage {
  readonly urls: ImageUrls;
}

export async function decodeToObjectUrls(bytes: ArrayBuffer, mime: AssetMime): Promise<UrlImage | null> {
  const blob = new Blob([bytes], { type: mime });
  const urls: ImageUrls = { background: URL.createObjectURL(blob), token: URL.createObjectURL(blob) };
  const revoke = (): void => {
    URL.revokeObjectURL(urls.background);
    URL.revokeObjectURL(urls.token);
  };
  const image = createEl('img');
  image.decoding = 'async';
  image.src = urls.token;
  try {
    await image.decode();
  } catch {
    revoke();
    return null;
  }
  let released = false;
  return {
    image,
    width: image.naturalWidth || 1,
    height: image.naturalHeight || 1,
    urls,
    release: () => {
      if (released) return;
      released = true;
      revoke();
    },
  };
}

/** The URLs of an image this decoder made; null for none or another decoder's. */
export function urlsOf(image: DecodedImage | null): ImageUrls | null {
  return image !== null && 'urls' in image ? (image as UrlImage).urls : null;
}
```

Run: `npx vitest run tests/unit/online/obsidian/objectUrlImages.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing join service test**

Create `tests/unit/online/obsidian/onlineJoinService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetCache } from '../../../../src/app/online/assets/AssetCache';
import { AssetLoader, type ImageDecoder } from '../../../../src/app/online/assets/AssetLoader';
import { GmSession, type SessionPlayer } from '../../../../src/app/online/GmSession';
import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import { OnlineJoinService, type OnlineSceneSink } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import { RECONNECT_GIVE_UP_MS, type PlayerSessionState } from '../../../../src/app/online/PlayerSession';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import type { ClientTransport, PeerLink } from '../../../../src/app/online/transport/types';
import type { AtlasSettings } from '../../../../src/app/services/SettingsService';
import { nodeHash } from '../assetFixtures';

const LINK = 'https://example.org/join/#id=gm';

function fakeSettings(initial: Partial<OnlineSettings> = {}) {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS, ...initial };
  const listeners = new Set<(settings: AtlasSettings) => void>();
  return {
    getOnlineSettings: (): OnlineSettings => online,
    setOnlineSettings: vi.fn((partial: Partial<OnlineSettings>): void => {
      online = { ...online, ...partial };
      listeners.forEach((listener) => listener({ online } as AtlasSettings));
    }),
    onChange: (listener: (settings: AtlasSettings) => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** A client whose GM can become unreachable, keeping its links. */
function flakyClient(network: MemoryNetwork): { transport: ClientTransport; links: PeerLink[]; setDown(down: boolean): void } {
  let down = false;
  const links: PeerLink[] = [];
  const inner = network.client();
  return {
    links,
    setDown: (value) => { down = value; },
    transport: {
      connect: async (hostId) => {
        if (down) throw Object.assign(new Error('down'), { code: 'unreachable' });
        const link = await inner.connect(hostId);
        links.push(link);
        return link;
      },
    },
  };
}

function recordingSink(): OnlineSceneSink & { calls: string[]; states: PlayerSessionState[]; controls: Array<readonly string[]>; logs: number[] } {
  const calls: string[] = [];
  const states: PlayerSessionState[] = [];
  const controls: Array<readonly string[]> = [];
  const logs: number[] = [];
  return {
    calls, states, controls, logs,
    session: (state) => { calls.push('session'); states.push(state); },
    scene: () => calls.push('scene'),
    camera: () => calls.push('camera'),
    control: (tokenIds) => { calls.push('control'); controls.push(tokenIds); },
    moveRefused: () => calls.push('moveRefused'),
    diceLog: (entries) => { calls.push('diceLog'); logs.push(entries.length); },
    laser: () => calls.push('laser'),
    images: () => calls.push('images'),
    close: () => calls.push('close'),
  };
}

function world(options: { hosting?: boolean } = {}) {
  const network = new MemoryNetwork();
  const requests: SessionPlayer[] = [];
  let players: SessionPlayer[] = [];
  const gm = new GmSession(network.host('gm'), {
    title: 'Table', onJoinRequest: (player) => requests.push(player), onRequestClosed: () => {}, onPlayersChanged: (list) => { players = list; },
  });
  gm.start();
  const settings = fakeSettings({ playerName: 'Anna' });
  const client = flakyClient(network);
  const opened = vi.fn(async (): Promise<void> => undefined);
  const decode: ImageDecoder = async () => ({ image: {} as HTMLImageElement, width: 1, height: 1, release: () => {} });
  const service = new OnlineJoinService({} as App, settings, '0.5.0', {
    createClient: () => client.transport, openStore: async () => null, decode, hash: nodeHash, openSceneTab: opened,
    isHosting: () => options.hosting ?? false,
  });
  const admitLast = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
    gm.allow(requests.at(-1)!.playerId);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { network, gm, requests, players: () => players, settings, client, opened, service, admitLast };
}

describe('OnlineJoinService', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    joinedSessionStore.setState({ session: null });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('joins as an Obsidian player, remembers the name and opens the tab once admitted', async () => {
    const w = world();
    expect(w.service.rememberedName()).toBe('Anna');
    expect(w.service.join(LINK, '  Ben  ')).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(joinedSessionStore.getState().session?.status).toBe('waiting');
    expect(w.players()).toEqual([expect.objectContaining({ name: 'Ben', status: 'pending', client: 'obsidian' })]);
    expect(w.settings.setOnlineSettings).toHaveBeenCalledWith({ playerName: 'Ben' });
    expect(w.opened).not.toHaveBeenCalled();
    await w.admitLast();
    expect(joinedSessionStore.getState().session).toMatchObject({ status: 'admitted', title: 'Table' });
    expect(w.opened).toHaveBeenCalledOnce();
    w.service.dispose();
  });

  it('refuses a broken link, a bad name, joining while hosting and a second join', async () => {
    const w = world();
    expect(w.service.join('https://example.org/join/', 'Ben')).toBe('link');
    expect(w.service.join(LINK, '   ')).toBe('name');
    expect(world({ hosting: true }).service.join(LINK, 'Ben')).toBe('hosting');
    expect(w.service.join(LINK, 'Ben')).toBeNull();
    expect(w.service.join(LINK, 'Ben')).toBe('joined');
    w.service.dispose();
  });

  it('gives a tab that attaches what is known so far, then everything new, until it detaches', async () => {
    const w = world();
    w.service.join(LINK, 'Ben');
    await w.admitLast();
    const playerId = w.service.state?.playerId ?? '';
    w.gm.send(playerId, { v: 1, type: 'token-control', tokenIds: ['t1'] });
    const sink = recordingSink();
    const detach = w.service.attach(sink);
    expect(detach).not.toBeNull();
    expect(sink.calls).toEqual(['session', 'control', 'diceLog', 'scene', 'images']);
    expect(sink.controls).toEqual([['t1']]);
    const entry = { id: 'r1', name: 'GM', formula: 'd20', dice: [{ die: 'd20', value: 11 }], modifier: 0, total: 11, at: 1 };
    w.gm.send(playerId, { v: 1, type: 'dice-log', entries: [entry], replay: true });
    w.gm.send(playerId, { v: 1, type: 'dice-log', entries: [{ ...entry, id: 'r2' }], replay: false });
    expect(sink.logs).toEqual([0, 1, 2]);
    w.gm.send(playerId, { v: 1, type: 'token-move-refused', tokenId: 't1' });
    expect(sink.calls.at(-1)).toBe('moveRefused');
    detach?.();
    w.gm.send(playerId, { v: 1, type: 'token-control', tokenIds: [] });
    expect(sink.controls).toEqual([['t1']]);
    w.service.dispose();
  });

  it('attaches no tab without a joined session', () => {
    expect(world().service.attach(recordingSink())).toBeNull();
  });

  it('leaving says bye, frees the images and closes the tab; a new join then works', async () => {
    const dispose = vi.spyOn(AssetLoader.prototype, 'dispose');
    const w = world();
    w.service.join(LINK, 'Ben');
    await w.admitLast();
    const sink = recordingSink();
    w.service.attach(sink);
    w.service.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.players().map((player) => player.status)).toEqual(['gone']);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sink.calls.at(-1)).toBe('close');
    expect(joinedSessionStore.getState().session).toBeNull();
    expect(w.service.state).toBeNull();
    expect(w.service.join(LINK, 'Ben')).toBeNull();
    w.service.dispose();
  });

  it("replaces a session that ended and closes its tab", async () => {
    const w = world();
    w.service.join(LINK, 'Ben');
    await w.admitLast();
    const sink = recordingSink();
    w.service.attach(sink);
    w.gm.kick(w.service.state?.playerId ?? '');
    await vi.advanceTimersByTimeAsync(0);
    expect(w.service.state).toMatchObject({ status: 'denied', reason: 'kicked' });
    expect(w.service.join(LINK, 'Ben')).toBeNull();
    expect(sink.calls.at(-1)).toBe('close');
    w.service.dispose();
  });

  it('reconnects after the connection was lost, with the same key and without a new approval or a second tab', async () => {
    const w = world();
    w.service.join(LINK, 'Ben');
    await w.admitLast();
    expect(w.requests).toHaveLength(1);
    w.client.setDown(true);
    w.client.links.at(-1)?.close();
    await vi.advanceTimersByTimeAsync(RECONNECT_GIVE_UP_MS + 20_000);
    expect(w.service.state).toMatchObject({ status: 'lost', reason: 'connection-lost' });
    w.client.setDown(false);
    w.service.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.service.state?.status).toBe('admitted');
    expect(w.requests).toHaveLength(1);
    expect(w.opened).toHaveBeenCalledOnce();
    w.service.dispose();
  });

  it('deletes the kept images when keeping is switched off in the settings', async () => {
    const setKeep = vi.spyOn(AssetCache.prototype, 'setKeep');
    const w = world();
    w.service.join(LINK, 'Ben');
    w.settings.setOnlineSettings({ keepImages: false });
    expect(setKeep).toHaveBeenLastCalledWith(false);
    w.service.dispose();
  });

  it('keeps one player key per GM for the life of the plugin', () => {
    const { service } = world();
    expect(service.playerKeyFor('a')).toBe(service.playerKeyFor('a'));
    expect(service.playerKeyFor('a')).not.toBe(service.playerKeyFor('b'));
  });
});
```

Run: `npx vitest run tests/unit/online/obsidian/onlineJoinService.test.ts`
Expected: FAIL with "Failed to resolve import ... joinedSessionStore".

- [ ] **Step 10: Write the store, the tab helper and the service**

Create `src/app/online/obsidian/joinedSessionStore.ts`:

```ts
/** The session this Atlas joined, as the Join dialog follows it; written by `OnlineJoinService`. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PlayerSessionState } from '../PlayerSession';

export interface JoinedSessionState {
  /** The joined session as the player has it; null while Atlas joins none. */
  session: PlayerSessionState | null;
}

export const joinedSessionStore: StoreApi<JoinedSessionState> = createStore<JoinedSessionState>(() => ({ session: null }));

/** Whether a joined session is still on: connecting, waiting or admitted (not denied or lost). */
export function isInSession(state: JoinedSessionState): boolean {
  const status = state.session?.status;
  return status === 'connecting' || status === 'waiting' || status === 'admitted';
}
```

Create `src/app/online/obsidian/onlineSceneTab.ts`:

```ts
import type { App } from 'obsidian';

/** The Online scene view: the presented scene of a session this Atlas joined. */
export const ONLINE_SCENE_VIEW_TYPE = 'atlas-online-scene';
export const ONLINE_SCENE_TITLE = 'Online scene';

/** Opens the Online scene in a new tab, or shows the one already open. */
export async function openOnlineSceneTab(app: App): Promise<void> {
  const open = app.workspace.getLeavesOfType(ONLINE_SCENE_VIEW_TYPE)[0];
  if (open) {
    await app.workspace.revealLeaf(open);
    return;
  }
  const leaf = app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: ONLINE_SCENE_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
```

Create `src/app/online/obsidian/OnlineJoinService.ts`:

```ts
/**
 * Joins an online session from Atlas: one at a time, never while hosting. It runs the web page's
 * `PlayerSession` (identifying as `obsidian`) and `AssetLoader`, opens the Online scene tab on
 * admission, and hands the scene, camera, token control, dice log and lasers to that tab's view
 * while it is attached. Images stay until the session is left, so the tab keeps the last scene
 * after the session ends and Reconnect still has them. Nothing here reads or writes the vault.
 */
import type { App } from 'obsidian';
import type { SettingsService } from '../../services/SettingsService';
import type { DiceSelection } from '../../tools/diceRolling';
import { AssetCache, type ImageStore } from '../assets/AssetCache';
import { AssetLoader, type ImageDecoder } from '../assets/AssetLoader';
import type { Hasher } from '../assets/assetIds';
import { openIndexedDbImageStore } from '../assets/indexedDbImageStore';
import { randomId } from '../ids';
import { parseJoinLink, type JoinTarget } from '../joinLink';
import { onlineSessionStore } from '../onlineSessionStore';
import { mergeDiceLog } from '../page/diceLogModel';
import { INCOMPLETE_LINK_TEXT, NAME_PROBLEM_TEXT } from '../page/pageScreen';
import type { PlayerSession, PlayerSessionState } from '../PlayerSession';
import { createJoinSession } from '../preview/joinSession';
import { normalizePlayerName } from '../protocol';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene, ScenePoint } from '../scene/sceneTypes';
import type { DiceLogEntry, PlayerLaser } from '../tools/toolMessages';
import { createPeerClient } from '../transport/PeerTransport';
import type { ClientTransport } from '../transport/types';
import { isInSession, joinedSessionStore } from './joinedSessionStore';
import { decodeToObjectUrls, urlsOf } from './objectUrlImages';
import { openOnlineSceneTab } from './onlineSceneTab';
import type { RemoteImages } from './remoteScene';

/** What the Online scene view takes from the joined session. */
export interface OnlineSceneSink {
  session(state: PlayerSessionState): void;
  scene(scene: PlayerScene | null): void;
  camera(camera: SceneCamera): void;
  control(tokenIds: readonly string[]): void;
  moveRefused(tokenId: string): void;
  /** The shared dice log, newest first, whole. */
  diceLog(entries: readonly DiceLogEntry[]): void;
  laser(laser: PlayerLaser): void;
  /** Images arrived, failed or went. */
  images(): void;
  /** The session was left from elsewhere (a new join, the plugin unloading): close the tab. */
  close(): void;
}

export type JoinProblem = 'link' | 'name' | 'hosting' | 'joined';

export const JOIN_PROBLEM_TEXT: Record<JoinProblem, string> = {
  link: INCOMPLETE_LINK_TEXT,
  name: NAME_PROBLEM_TEXT,
  hosting: 'Stop hosting your online session before joining another.',
  joined: 'You are already in an online session. Close its tab to leave it first.',
};

export interface OnlineJoinDeps {
  createClient?: (server: JoinTarget['server']) => ClientTransport;
  openStore?: () => Promise<ImageStore | null>;
  decode?: ImageDecoder;
  /** Tests driven by fake timers pass a hash that resolves at once. */
  hash?: Hasher;
  /** Opens the Online scene tab; its view attaches itself. */
  openSceneTab?: () => Promise<void>;
  isHosting?: () => boolean;
}

type JoinSettings = Pick<SettingsService, 'getOnlineSettings' | 'setOnlineSettings' | 'onChange'>;

interface Joined {
  target: JoinTarget;
  name: string;
  playerKey: string;
  loader: AssetLoader;
  session: PlayerSession | null;
  /** The tab was opened for this join: a re-admission after Reconnect opens no second one. */
  opened: boolean;
  scene: PlayerScene | null;
  camera: SceneCamera | null;
  control: readonly string[];
  dice: readonly DiceLogEntry[];
}

export class OnlineJoinService {
  private static readonly instances = new WeakMap<App, OnlineJoinService>();
  static forApp(app: App): OnlineJoinService | undefined {
    return this.instances.get(app);
  }

  private joined: Joined | null = null;
  private sink: OnlineSceneSink | null = null;
  private cache: AssetCache | null = null;
  private readonly keys = new Map<string, string>();
  private readonly createClient: NonNullable<OnlineJoinDeps['createClient']>;
  private readonly openStore: NonNullable<OnlineJoinDeps['openStore']>;
  private readonly decode: ImageDecoder;
  private readonly hash: Hasher | undefined;
  private readonly openSceneTab: () => Promise<void>;
  private readonly isHosting: () => boolean;
  private readonly stopSettings: () => void;

  /** The scene's images by object URL: one URL for the map, another for tokens. */
  readonly images: RemoteImages = {
    background: (assetId) => urlsOf(this.joined?.loader.image(assetId) ?? null)?.background ?? null,
    token: (assetId) => urlsOf(this.joined?.loader.image(assetId) ?? null)?.token ?? null,
  };

  constructor(app: App, private readonly settings: JoinSettings, private readonly clientVersion: string, deps: OnlineJoinDeps = {}) {
    this.createClient = deps.createClient ?? createPeerClient;
    this.openStore = deps.openStore ?? openIndexedDbImageStore;
    this.decode = deps.decode ?? decodeToObjectUrls;
    this.hash = deps.hash;
    this.openSceneTab = deps.openSceneTab ?? ((): Promise<void> => openOnlineSceneTab(app));
    this.isHosting = deps.isHosting ?? ((): boolean => {
      const status = onlineSessionStore.getState().status;
      return status === 'starting' || status === 'hosting';
    });
    // Switching keeping off deletes the stored images at once.
    this.stopSettings = settings.onChange(() => { void this.cache?.setKeep(this.settings.getOnlineSettings().keepImages); });
    OnlineJoinService.instances.set(app, this);
  }

  /** The joined session as the player has it; null while Atlas joins none. */
  get state(): PlayerSessionState | null {
    return this.joined?.session?.state ?? null;
  }

  /** The name to offer in the Join dialog. */
  rememberedName(): string {
    return this.settings.getOnlineSettings().playerName;
  }

  /** Starts joining; null once it started, else what stops it. A session that ended is left first. */
  join(link: string, name: string): JoinProblem | null {
    const target = parseJoinLink(link);
    if (!target) return 'link';
    const cleaned = normalizePlayerName(name);
    if (!cleaned) return 'name';
    if (this.isHosting()) return 'hosting';
    if (isInSession(joinedSessionStore.getState())) return 'joined';
    this.leave();
    this.settings.setOnlineSettings({ playerName: cleaned });
    const loader = new AssetLoader({
      cache: this.imageCache(), decode: this.decode, ...(this.hash ? { hash: this.hash } : {}),
      onChange: () => { if (this.joined?.loader === loader) this.sink?.images(); },
    });
    const joined: Joined = {
      target, name: cleaned, playerKey: this.playerKeyFor(target.hostId), loader, session: null,
      opened: false, scene: null, camera: null, control: [], dice: [],
    };
    this.joined = joined;
    this.startSession(joined);
    return null;
  }

  /** After the connection was lost: joins again with the same key, images and tab. */
  reconnect(): void {
    const joined = this.joined;
    if (!joined || joined.session?.state.status !== 'lost') return;
    this.startSession(joined);
  }

  /** Leaves the session: says bye, frees its images and closes its tab. */
  leave(): void {
    const joined = this.joined;
    if (!joined) return;
    this.joined = null;
    joined.session?.stop();
    joined.loader.dispose();
    joinedSessionStore.setState({ session: null });
    const sink = this.sink;
    this.sink = null;
    sink?.close();
  }

  /** The Online scene view attaches: it gets what is known so far, then every change. Null without a joined session. */
  attach(sink: OnlineSceneSink): (() => void) | null {
    const joined = this.joined;
    if (!joined?.session) return null;
    this.sink = sink;
    sink.session(joined.session.state);
    sink.control(joined.control);
    sink.diceLog(joined.dice);
    sink.scene(joined.scene);
    if (joined.camera) sink.camera(joined.camera);
    sink.images();
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  sendTokenMove(tokenId: string, x: number, y: number): boolean {
    return this.joined?.session?.sendTokenMove(tokenId, x, y) ?? false;
  }

  sendDiceRoll(dice: DiceSelection, modifier: number): boolean {
    return this.joined?.session?.sendDiceRoll(dice, modifier) ?? false;
  }

  sendLaser(points: readonly ScenePoint[], lifted: boolean, dt?: readonly number[], color?: string): boolean {
    return this.joined?.session?.sendLaser(points, lifted, dt, color) ?? false;
  }

  /** The plugin unloads. */
  dispose(): void {
    this.leave();
    this.stopSettings();
  }

  /** One key per GM host for this plugin's lifetime, so the GM recognises a reconnect. Piece 6b replaces it with stable per-table ids. */
  playerKeyFor(hostId: string): string {
    const known = this.keys.get(hostId);
    if (known) return known;
    const key = randomId();
    this.keys.set(hostId, key);
    return key;
  }

  private imageCache(): AssetCache {
    this.cache ??= new AssetCache({ keep: this.settings.getOnlineSettings().keepImages, openStore: this.openStore });
    return this.cache;
  }

  private startSession(joined: Joined): void {
    const current = (): boolean => this.joined === joined && joined.session === session;
    const session: PlayerSession = createJoinSession({
      loader: joined.loader,
      hostId: joined.target.hostId,
      name: joined.name,
      playerKey: joined.playerKey,
      clientVersion: this.clientVersion,
      clientKind: 'obsidian',
      transport: this.createClient(joined.target.server),
      onChange: (state) => { if (current()) this.changed(joined, state); },
      onScene: (scene) => {
        if (!current()) return;
        joined.scene = scene;
        this.sink?.scene(scene);
      },
      onCamera: (camera) => {
        if (!current()) return;
        joined.camera = camera;
        this.sink?.camera(camera);
      },
      onControl: (tokenIds) => {
        if (!current()) return;
        joined.control = tokenIds;
        this.sink?.control(tokenIds);
      },
      onMoveRefused: (tokenId) => { if (current()) this.sink?.moveRefused(tokenId); },
      onDiceLog: (entries, replay) => {
        if (!current()) return;
        const merged = mergeDiceLog(joined.dice, entries, replay).list;
        if (merged === joined.dice) return;
        joined.dice = merged;
        this.sink?.diceLog(merged);
      },
      onLaser: (laser) => { if (current()) this.sink?.laser(laser); },
    });
    joined.session = session;
    session.start();
  }

  private changed(joined: Joined, state: PlayerSessionState): void {
    joinedSessionStore.setState({ session: state });
    this.sink?.session(state);
    if (state.status !== 'admitted' || joined.opened) return;
    joined.opened = true;
    this.openSceneTab().catch((error: unknown) => {
      console.error('[Atlas online] Could not open the online scene:', error);
    });
  }
}
```

In 'gives a tab that attaches what is known so far', `sink.logs` is `[0, 1, 2]`: the empty log on attach, the replay of one entry, then one new roll. This world has no `DiceHost`, so no admission replay arrives.

- [ ] **Step 11: Run the service test**

Run: `npx vitest run tests/unit/online/obsidian/onlineJoinService.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 12: Write the failing dialog test**

Create `tests/unit/online/obsidian/joinSessionModal.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import type { JoinProblem } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { JoinSessionModal } from '../../../../src/app/online/obsidian/ui/JoinSessionModal';
import type { PlayerSessionState } from '../../../../src/app/online/PlayerSession';

const state = (status: PlayerSessionState['status'], reason: string | null = null): PlayerSessionState => ({
  status, playerId: status === 'admitted' ? 'p1' : null, title: 'Table', players: [], reason,
});

function open(result: JoinProblem | null = null) {
  const service = { join: vi.fn((_link: string, _name: string): JoinProblem | null => result), leave: vi.fn() };
  const modal = new JoinSessionModal({} as App, service, 'Anna');
  const close = vi.spyOn(modal, 'close');
  modal.onOpen();
  const [link, name] = Array.from(modal.contentEl.querySelectorAll('input'));
  const button = (text: string): HTMLButtonElement =>
    Array.from(modal.contentEl.querySelectorAll('button')).find((candidate) => candidate.textContent === text)!;
  const type = (input: HTMLInputElement | undefined, value: string): void => {
    input!.value = value;
    input!.dispatchEvent(new Event('input'));
  };
  const status = (): string => modal.contentEl.querySelector('[role="status"]')?.textContent ?? '';
  return { service, modal, close, link, name, button, type, status };
}

afterEach(() => { joinedSessionStore.setState({ session: null }); });

describe('Join online session dialog', () => {
  it('asks for the link and offers the remembered name, in the native Atlas dialog style', () => {
    const { modal, link, name } = open();
    expect(modal.titleEl.textContent).toBe('Join online session');
    expect(modal.modalEl.classList.contains('atlas-native-modal')).toBe(true);
    expect(link?.getAttribute('aria-label')).toBe('Join link');
    expect(name?.value).toBe('Anna');
  });

  it("says what is wrong with the link, the name or the moment, and stays open", () => {
    const { button, status, close } = open('hosting');
    button('Join').click();
    expect(status()).toBe('Stop hosting your online session before joining another.');
    expect(close).not.toHaveBeenCalled();
  });

  it('shows the way in and closes once the GM lets the player in, without leaving', () => {
    const { service, modal, button, type, link, status, close } = open();
    type(link, 'https://example.org/join/#id=gm');
    button('Join').click();
    expect(service.join).toHaveBeenCalledWith('https://example.org/join/#id=gm', 'Anna');
    joinedSessionStore.setState({ session: state('waiting') });
    expect(status()).toBe('Waiting for the GM to let you in…');
    expect(button('Join').disabled).toBe(true);
    joinedSessionStore.setState({ session: state('admitted') });
    expect(close).toHaveBeenCalled();
    modal.onClose();
    expect(service.leave).not.toHaveBeenCalled();
  });

  it("shows the GM's refusal, ends that join and offers Join again", () => {
    const { service, button, status } = open();
    button('Join').click();
    joinedSessionStore.setState({ session: state('denied', 'full') });
    expect(status()).toBe('The session is full.');
    expect(service.leave).toHaveBeenCalledOnce();
    expect(button('Join').disabled).toBe(false);
  });

  it('cancels the join when closed before the GM answers', () => {
    const { service, modal, button } = open();
    button('Join').click();
    joinedSessionStore.setState({ session: state('waiting') });
    modal.onClose();
    expect(service.leave).toHaveBeenCalledOnce();
  });
});
```

Run: `npx vitest run tests/unit/online/obsidian/joinSessionModal.test.ts`
Expected: FAIL with "Failed to resolve import ... JoinSessionModal".

- [ ] **Step 13: Write the dialog and its styles**

In `src/app/online/ui/onlineCopy.ts`, append:

```ts
export const JOIN_SESSION_LABEL = 'Join online session…';
export const OBSIDIAN_PLAYER_LABEL = 'Joined from Obsidian';
```

Create `src/app/online/obsidian/ui/JoinSessionModal.ts`:

```ts
/**
 * "Join online session…": the GM's join link and the player's name, then the session's progress
 * until the GM lets them in (the Online scene tab opens and this closes) or not (the reason
 * shows and Join is offered again). Closing it before admission cancels the join.
 */
import { Modal, Setting, type App } from 'obsidian';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { sessionReasonText } from '../../page/pageScreen';
import type { PlayerSessionState } from '../../PlayerSession';
import { joinedSessionStore } from '../joinedSessionStore';
import { JOIN_PROBLEM_TEXT, OnlineJoinService } from '../OnlineJoinService';

export const JOIN_DIALOG_TITLE = 'Join online session';

type JoinPort = Pick<OnlineJoinService, 'join' | 'leave'>;

export class JoinSessionModal extends Modal {
  private link = '';
  private name: string;
  private joining = false;
  private admitted = false;
  private statusEl: HTMLElement | null = null;
  private joinButton: HTMLButtonElement | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private readonly service: JoinPort, name: string) {
    super(app);
    this.name = name;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-join-modal');
  }

  onOpen(): void {
    this.setTitle(JOIN_DIALOG_TITLE);
    const { contentEl } = this;
    new Setting(contentEl)
      .setName('Join link')
      .setDesc('The link your GM shared. The same link works in a browser.')
      .addText((text) => {
        text.setPlaceholder('Paste the link here').onChange((value) => { this.link = value; });
        text.inputEl.setAttribute('aria-label', 'Join link');
      });
    new Setting(contentEl)
      .setName('Your name')
      .setDesc('How your GM and the other players see you.')
      .addText((text) => {
        text.setValue(this.name).onChange((value) => { this.name = value; });
        text.inputEl.setAttribute('aria-label', 'Your name');
      });
    this.statusEl = contentEl.createEl('p', { cls: 'atlas-join-modal__status', attr: { role: 'status', 'aria-live': 'polite' } });
    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    this.joinButton = buttons.createEl('button', { cls: 'mod-cta', text: 'Join' });
    this.joinButton.addEventListener('click', () => this.submit());
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    this.unsubscribe = joinedSessionStore.subscribe((state) => this.show(state.session));
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    // Closing before the GM let the player in cancels the join.
    if (this.joining && !this.admitted) this.service.leave();
    this.joining = false;
    this.contentEl.empty();
  }

  private submit(): void {
    const problem = this.service.join(this.link, this.name);
    if (problem) {
      this.setStatus(JOIN_PROBLEM_TEXT[problem], true);
      return;
    }
    this.joining = true;
    this.show(joinedSessionStore.getState().session);
  }

  private show(session: PlayerSessionState | null): void {
    if (!this.joining || !session) return;
    switch (session.status) {
      case 'connecting':
        this.setStatus('Connecting…', false);
        this.setBusy(true);
        break;
      case 'waiting':
        this.setStatus('Waiting for the GM to let you in…', false);
        this.setBusy(true);
        break;
      case 'admitted':
        this.admitted = true;
        this.close();
        break;
      case 'denied':
        this.end(sessionReasonText(session.reason, 'denied'));
        break;
      case 'lost':
        this.end(sessionReasonText(session.reason, 'unreachable'));
        break;
    }
  }

  /** The join is over without admission: say why and offer Join again. */
  private end(text: string): void {
    this.joining = false;
    this.service.leave();
    this.setStatus(text, true);
    this.setBusy(false);
  }

  private setStatus(text: string, problem: boolean): void {
    this.statusEl?.setText(text);
    this.statusEl?.toggleClass('atlas-join-modal__status--problem', problem);
  }

  private setBusy(busy: boolean): void {
    if (this.joinButton) this.joinButton.disabled = busy;
  }
}

/** Opens the Join dialog with the last name used. */
export function openJoinSessionModal(app: App): void {
  const service = OnlineJoinService.forApp(app);
  if (service) new JoinSessionModal(app, service, service.rememberedName()).open();
}
```

Append to `src/app/online/ui/online-session.scss`:

```scss
// "Join online session…": status under the fields, a problem in the error colour.
.atlas-join-modal__status {
  @include atlas-help-text;
  min-height: 1lh;
  margin: $spacing-s 0;
}
.atlas-join-modal__status--problem { color: var(--text-error); }
```

Run: `npx vitest run tests/unit/online/obsidian/joinSessionModal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 14: Refuse hosting while joined, register the command, mark Obsidian players**

In `src/app/online/OnlineSessionService.ts`:
1. Import `import { isInSession, joinedSessionStore } from './obsidian/joinedSessionStore';`.
2. Add the text next to the other constants:

```ts
const HOSTING_WHILE_JOINED = 'Leave the online session you joined before hosting one.';
```

3. Add to `interface Deps`:

```ts
  /** Whether this Atlas is in a session it joined; the joined session store unless a test passes its own. */
  isJoined?: () => boolean;
```

4. Add a field `private readonly isJoined: () => boolean;`, set it in the constructor with `this.isJoined = deps.isJoined ?? (() => isInSession(joinedSessionStore.getState()));`.
5. In `start()`, right after `if (this.current || onlineSessionStore.getState().status === 'starting') return;`, add:

```ts
    if (this.isJoined()) {
      onlineSessionStore.setState({ status: 'error', error: HOSTING_WHILE_JOINED });
      return;
    }
```

Append to `tests/unit/online/onlineSessionService.test.ts` (inside `describe('OnlineSessionService', …)`):

```ts
  it('does not host while this Atlas is in a session it joined', async () => {
    const createHost = vi.fn();
    const svc = new OnlineSessionService(app, settings, { createHost, isJoined: () => true });
    await svc.start();
    expect(createHost).not.toHaveBeenCalled();
    expect(onlineSessionStore.getState()).toMatchObject({ status: 'error', error: 'Leave the online session you joined before hosting one.' });
  });
```

In `src/app/online/registerOnline.ts`:
1. Change the signature to `export function registerOnline(plugin: Plugin, service: OnlineSessionService, joins: OnlineJoinService): void {`, and add the imports `import type { OnlineJoinService } from './obsidian/OnlineJoinService';`, `import { openJoinSessionModal } from './obsidian/ui/JoinSessionModal';` and `import { JOIN_SESSION_LABEL } from './ui/onlineCopy';`.
2. After the `online-session` command, add:

```ts
  plugin.addCommand({ id: 'join-online-session', name: JOIN_SESSION_LABEL, callback: () => openJoinSessionModal(plugin.app) });
```

3. After `plugin.register(() => service.stop());`, add `plugin.register(() => joins.dispose());`.

In `main.ts`:
1. Import `import { OnlineJoinService } from './src/app/online/obsidian/OnlineJoinService';`.
2. Right after `this.settingsService = new SettingsService(this.app, storageReady);`, add:

```ts
    // Before the views: a restored Online scene tab looks for it when it opens.
    const onlineJoins = new OnlineJoinService(this.app, this.settingsService, this.manifest.version);
```

3. Change `registerOnline(this, onlineSessions);` to `registerOnline(this, onlineSessions, onlineJoins);`.

In `src/app/react/components/online/OnlinePlayerList.tsx`:
1. Change the lucide import to `import { Gem, X } from 'lucide-react';`, and the copy import to `import { OBSIDIAN_PLAYER_LABEL, REMOVE_PLAYER_LABEL } from '../../../online/ui/onlineCopy';`.
2. Add above `export function OnlinePlayerList`:

```tsx
/** Marks a player who joined from Atlas in Obsidian. */
function ObsidianMark(): React.ReactElement {
  return (
    <LabelTooltip label={OBSIDIAN_PLAYER_LABEL}>
      <span className="atlas-online-panel__client" role="img"><Gem aria-hidden="true" /></span>
    </LabelTooltip>
  );
}
```

3. In both lists, right after `<span className="atlas-online-panel__name">{player.name}</span>`, add `{player.client === 'obsidian' && <ObsidianMark />}`.

In `src/app/react/components/online/online-panel.scss`, after `.atlas-online-panel__note { … }` add:

```scss
.atlas-online-panel__client {
  display: flex;
  flex-shrink: 0;
  color: var(--text-muted);

  svg {
    width: $icon-xs;
    height: $icon-xs;
  }
}
```

and give the footer an even gap: change `.atlas-online-panel__footer { display: flex; justify-content: flex-end; }` to

```scss
.atlas-online-panel__footer {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-s;
}
```

In `src/app/react/components/online/OnlinePanel.tsx`:
1. Import `import { openJoinSessionModal } from '../../../online/obsidian/ui/JoinSessionModal';` and add `JOIN_SESSION_LABEL` to the `onlineCopy` import.
2. Pass the app to the start view: `: <StartView session={session} service={service} app={app} />}`.
3. Change `StartView`'s signature to `function StartView({ session, service, app }: { session: OnlineSessionState; service: OnlineSessionService | undefined; app: App }): React.ReactElement {`, with `import type { App } from 'obsidian';` at the top.
4. In its footer, add before the start button:

```tsx
        <Button variant="outline" disabled={starting} onClick={() => openJoinSessionModal(app)}>
          {JOIN_SESSION_LABEL}
        </Button>
```

In `tests/unit/onlinePanel.test.tsx`:
1. Add `openJoinSessionModal: vi.fn(),` to the `vi.hoisted` object, and include `openJoinSessionModal` in its destructuring.
2. Add `vi.mock('../../src/app/online/obsidian/ui/JoinSessionModal', () => ({ openJoinSessionModal }));` beside the other mocks.
3. Append inside `describe('online panel', …)`:

```tsx
  it('offers to join a session from here while not hosting', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Join online session…' }));
    expect(openJoinSessionModal).toHaveBeenCalledOnce();
  });

  it('marks a player who joined from Obsidian', () => {
    hosting([{ ...anna, client: 'obsidian' }, dan]);
    renderPanel();
    expect(within(screen.getByRole('listitem', { name: 'Anna' })).getByRole('img', { name: 'Joined from Obsidian' })).toBeTruthy();
    expect(within(screen.getByRole('listitem', { name: 'Dan' })).queryByRole('img', { name: 'Joined from Obsidian' })).toBeNull();
  });
```

- [ ] **Step 15: Run the task's tests**

Run: `npx vitest run tests/unit/online/ tests/unit/onlinePanel.test.tsx tests/unit/onlineToolbarItem.test.tsx tests/unit/commandPalette.online.test.tsx`
Expected: PASS.

- [ ] **Step 16: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 17: Commit**

```bash
git add src/app/online/PlayerSession.ts src/app/online/gmSessionTypes.ts src/app/online/GmSession.ts src/app/online/joinLink.ts src/app/online/onlineSettings.ts src/app/settings/onlineSettingsSection.ts src/app/online/page/pageScreen.ts src/app/online/page/diceLogModel.ts src/app/online/obsidian/objectUrlImages.ts src/app/online/obsidian/joinedSessionStore.ts src/app/online/obsidian/onlineSceneTab.ts src/app/online/obsidian/OnlineJoinService.ts src/app/online/obsidian/ui/JoinSessionModal.ts src/app/online/ui/onlineCopy.ts src/app/online/ui/online-session.scss src/app/online/OnlineSessionService.ts src/app/online/registerOnline.ts main.ts src/app/react/components/online/OnlinePlayerList.tsx src/app/react/components/online/OnlinePanel.tsx src/app/react/components/online/online-panel.scss tests/unit/online/gmSessionClient.test.ts tests/unit/online/joinLink.test.ts tests/unit/online/onlineSettings.test.ts tests/unit/online/obsidian/objectUrlImages.test.ts tests/unit/online/obsidian/onlineJoinService.test.ts tests/unit/online/obsidian/joinSessionModal.test.ts tests/unit/online/onlineSessionService.test.ts tests/unit/onlinePanel.test.tsx
git commit -m "feat(online): join a session from Atlas in Obsidian"
```

---

### Task 3: The Online scene view

The `atlas-online-scene` view is an `AtlasView` on a remote store. Its `OnlineSceneClient` is the joined session's sink. It does the following:
- writes scenes into the store;
- puts a placeholder background under them until the image arrives;
- drives the viewport through `ViewportFollower` (follow, break away, Follow GM, Fit map);
- shows the initiative panel, the shared dice log and other people's lasers;
- fills the status bar, with Reconnect.

GM tools are hidden. Blob backgrounds are released at once. A restored tab with no session closes itself. Player actions (drags, sending lasers, rolling) come in Task 4.

**Files:**
- Modify: `src/app/online/view/CameraController.ts` (`movedByPlayer`)
- Create: `src/app/online/obsidian/ViewportFollower.ts`
- Create: `src/app/grid/gridStateOptions.ts`; Modify: `src/app/react/BackgroundSprite.tsx` (use it; blob URLs through the background cache)
- Modify: `src/app/pixi/backgroundTextureCache.ts` (blob URLs: texture parser, unloaded at once)
- Modify: `src/app/MapLoader.ts` (export `placeholderTexture`)
- Create: `src/app/online/obsidian/RemoteMapBackdrop.ts`
- Create: `src/app/online/obsidian/onlineSceneStatus.ts`
- Create: `src/app/online/obsidian/onlineDice.ts`
- Create: `src/app/online/obsidian/OnlineSceneClient.ts`
- Create: `src/app/online/obsidian/OnlineSceneView.ts`
- Create: `src/app/pixi/token-renderer/viewConditionDefinitions.ts`; Modify: `src/app/pixi/TokenRenderer.ts`
- Modify: `src/app/services/PlayerSceneOverlay.ts`, `src/app/services/PlayerInitiativePanel.ts` (a settings source type)
- Modify: `src/app/services/ServiceManager.ts` (no widget sync for a remote view)
- Modify: `src/app/atlas-view.ts` (constructor `remote`, `isRemote`, `onlineControls()`, a resize hook)
- Create: `src/app/react/components/online/OnlineSceneBar.tsx`, `src/app/react/components/online/onlineSceneToolbarItems.tsx`, `src/app/react/components/online/online-scene.scss`
- Modify: `src/app/react/UIRoot.tsx`, `src/app/packages/components/MainToolbar.tsx`, `styles/main.scss`
- Modify: `src/app/plugin/atlasLeaves.ts`, `src/app/plugin/registerCommands.ts`, `src/app/plugin/statusBarVisibility.ts`, `main.ts`
- Test: `tests/unit/online/obsidian/viewportFollower.test.ts`, `remoteMapBackdrop.test.ts`, `onlineSceneStatus.test.ts`, `onlineSceneFixtures.ts`, `onlineSceneClient.test.ts`, `tests/unit/online/obsidian/onlineSceneToolbar.test.tsx`, `tests/unit/viewConditionDefinitions.test.ts`, `tests/unit/activeMapView.test.ts`
- Test (additions): `tests/unit/online/cameraController.test.ts`, `tests/unit/backgroundTextureCache.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `RemoteSceneApplier`, `updateRemoteScene`, `OnlineSceneControls`, `OnlineSceneStatus`, `DEFAULT_TABLE_TITLE`, `createViewAtlasStore(..., { remote })`.
  - Task 2: `OnlineJoinService` (`attach`, `images`, `reconnect`, `sendDiceRoll`, `sendTokenMove`, `sendLaser`), `OnlineSceneSink`, `ONLINE_SCENE_VIEW_TYPE`, `ONLINE_SCENE_TITLE`, `sessionReasonText`.
  - Existing: `CameraController`, `laserColor`, `LaserHub.showRemote`, `PlayerInitiativePanel`, `backgroundTextureCache`.
- Produces:
  - `CameraController.movedByPlayer(camera)`.
  - `ViewportFollower`, `FollowViewport`, `Frames`, `PLAYER_MOVES`.
  - `RemoteMapBackdrop`, `BackdropRenderer`.
  - `onlineSceneStatus(state, hasScene)`, `LOST_CONNECTION_TEXT`.
  - `diceLogResults(entries)`.
  - `OnlineSceneClient` (with `controls`, `attach()`, `resize()`, `dispose()`, and the sink methods) and `OnlineSceneClientOptions`.
  - `OnlineSceneView`.
  - `AtlasView.isRemote`, `AtlasView.onlineControls(): OnlineSceneControls | null`, `AtlasView.onContainerResized()`.
  - `ServiceManagerOptions`, `toGridOptions(grid)`, `placeholderTexture(gridSize)`.
  - `viewConditionDefinitions(state, collections)`, `PlayerSettingsSource`, `activeMapView(app)`.
  - `onlineSceneToolbarItems(...)`, `FOLLOW_GM_LABEL`, `FIT_MAP_LABEL`.

- [ ] **Step 1: Write the failing camera tests**

Append to `tests/unit/online/cameraController.test.ts`, inside its top-level `describe` (the file already builds a `CameraController` with a manual clock; use the same helpers it uses, or this self-contained form):

```ts
  it('stays where the player moved the view, without moving it back, and tells once that it stopped following', () => {
    const onChange = vi.fn();
    const camera = new CameraController({ now: () => 0, onChange });
    camera.setScreen({ width: 800, height: 600 });
    onChange.mockClear();
    camera.movedByPlayer({ centerX: 10, centerY: 20, zoom: 3 });
    expect(camera.isFollowing()).toBe(false);
    expect(camera.current()).toEqual({ centerX: 10, centerY: 20, zoom: 3 });
    expect(onChange).toHaveBeenCalledOnce();
    camera.movedByPlayer({ centerX: 11, centerY: 21, zoom: 3 });
    expect(onChange).toHaveBeenCalledOnce();
    expect(camera.isMoving()).toBe(false);
  });
```

(add `vi` to the file's vitest import if it is missing, and `CameraController` is already imported there).

Create `tests/unit/online/obsidian/viewportFollower.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ViewportFollower, type FollowViewport, type Frames } from '../../../../src/app/online/obsidian/ViewportFollower';
import { GLIDE_MS } from '../../../../src/app/online/view/camera';
import { playerScene } from '../sceneFixtures';

class FakeViewport implements FollowViewport {
  screenWidth = 800;
  screenHeight = 600;
  center = { x: 0, y: 0 };
  scale = { x: 1 };
  private readonly listeners = new Set<(event: { type: string }) => void>();
  readonly setZoom = vi.fn((zoom: number): void => { this.scale.x = zoom; });
  readonly moveCenter = vi.fn((x: number, y: number): void => { this.center = { x, y }; });
  on(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.add(listener); }
  off(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.delete(listener); }
  /** pixi-viewport's `moved` event after one of its plugins moved it. */
  moved(type: string): void { for (const listener of [...this.listeners]) listener({ type }); }
  get listenerCount(): number { return this.listeners.size; }
}

function manualFrames(): Frames & { run(): void; pending(): number } {
  let queue: Array<() => void> = [];
  return {
    request: (draw) => { queue.push(draw); return queue.length; },
    cancel: () => { queue = []; },
    run: () => { const due = queue; queue = []; due.forEach((draw) => draw()); },
    pending: () => queue.length,
  };
}

function setup() {
  const viewport = new FakeViewport();
  const frames = manualFrames();
  let now = 0;
  const onFollowingChange = vi.fn();
  const follower = new ViewportFollower({ viewport, onFollowingChange, now: () => now, frames });
  const settle = (): void => {
    now += GLIDE_MS + 1;
    frames.run();
    frames.run();
  };
  return { viewport, frames, follower, onFollowingChange, settle };
}

const GM_CAMERA = { sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 };

describe('ViewportFollower', () => {
  it('fits a new scene, then glides to each GM camera while following', () => {
    const { viewport, follower, settle } = setup();
    follower.setScene(playerScene());
    settle();
    expect(viewport.center).toEqual({ x: 500, y: 400 });
    follower.setGmCamera(GM_CAMERA);
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    expect(viewport.scale.x).toBe(2);
  });

  it("breaks away on the player's own drag, wheel, pinch or glide-out, and stays there", () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    settle();
    for (const type of ['drag', 'wheel', 'pinch', 'decelerate']) {
      onFollowingChange.mockClear();
      follower.followGm();
      settle();
      viewport.center = { x: 321, y: 123 };
      const moves = viewport.moveCenter.mock.calls.length;
      viewport.moved(type);
      expect(onFollowingChange).toHaveBeenLastCalledWith(false);
      follower.setGmCamera(GM_CAMERA);
      settle();
      expect(viewport.moveCenter.mock.calls.length).toBe(moves);
      expect(viewport.center).toEqual({ x: 321, y: 123 });
    }
  });

  it("keeps following through moves that are not the player's", () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    settle();
    viewport.moved('animate');
    viewport.moved('follow');
    expect(onFollowingChange).not.toHaveBeenCalled();
  });

  it('comes back with Follow GM, and fits the map with Fit map while staying away', () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    follower.setGmCamera(GM_CAMERA);
    settle();
    viewport.moved('drag');
    follower.followGm();
    expect(onFollowingChange).toHaveBeenLastCalledWith(true);
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    follower.fitMap();
    expect(onFollowingChange).toHaveBeenLastCalledWith(false);
    settle();
    expect(viewport.center).toEqual({ x: 500, y: 400 });
  });

  it('puts the camera back after something else moved the viewport', () => {
    const { viewport, follower, settle } = setup();
    follower.setScene(playerScene());
    follower.setGmCamera(GM_CAMERA);
    settle();
    viewport.center = { x: 500, y: 400 };
    follower.reapply();
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
  });

  it('stops listening and drawing once disposed', () => {
    const { viewport, frames, follower } = setup();
    follower.setScene(playerScene());
    follower.dispose();
    expect(viewport.listenerCount).toBe(0);
    expect(frames.pending()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/online/cameraController.test.ts tests/unit/online/obsidian/viewportFollower.test.ts`
Expected: FAIL. `movedByPlayer` is not a function, and `ViewportFollower` does not resolve.

- [ ] **Step 3: Add `movedByPlayer` and write the follower**

In `src/app/online/view/CameraController.ts`, add after `fitMap()`:

```ts
  /**
   * The player moved the view themselves (Atlas's viewport: its drag, wheel or pinch): the
   * camera is where they put it and stops following. Nothing to draw, so only the change of
   * following is told.
   */
  movedByPlayer(camera: Camera): void {
    this.glide = null;
    this.camera = camera;
    if (!this.following) return;
    this.following = false;
    this.options.onChange();
  }
```

Create `src/app/online/obsidian/ViewportFollower.ts`:

```ts
/**
 * Moves Atlas's pixi-viewport the way the join page moves its canvas. The shared
 * `CameraController` decides: follow the GM's camera, gliding there; or stay where the player
 * panned or zoomed; or fit the map. The viewport's own drag, wheel and pinch plugins move it, and
 * their `moved` events tell the controller the player broke away. Moves made here (`setZoom`, then
 * `moveCenter`) emit no `moved` event. Nothing is drawn after a break-away, so a drag in progress
 * is never reset under the player.
 */
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene } from '../scene/sceneTypes';
import type { Camera } from '../view/camera';
import { CameraController } from '../view/CameraController';

/** The `moved` events pixi-viewport emits for the player's own moves. */
export const PLAYER_MOVES: ReadonlySet<string> = new Set(['drag', 'wheel', 'pinch', 'decelerate']);

/** The part of pixi-viewport's `Viewport` the follower uses. */
export interface FollowViewport {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly center: { x: number; y: number };
  readonly scale: { x: number };
  setZoom(scale: number): unknown;
  moveCenter(x: number, y: number): unknown;
  on(event: 'moved', listener: (event: { type: string }) => void): unknown;
  off(event: 'moved', listener: (event: { type: string }) => void): unknown;
}

export interface Frames {
  request(draw: () => void): number;
  cancel(handle: number): void;
}

export const ANIMATION_FRAMES: Frames = {
  request: (draw) => window.requestAnimationFrame(() => draw()),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

export interface ViewportFollowerOptions {
  viewport: FollowViewport;
  /** Following started or stopped: Follow GM and Fit map show while it does not. */
  onFollowingChange(following: boolean): void;
  /** Tests pass their own clock and frames. */
  now?: () => number;
  frames?: Frames;
}

export class ViewportFollower {
  private readonly camera: CameraController;
  private readonly frames: Frames;
  private frame: number | null = null;
  private following = true;
  private disposed = false;

  constructor(private readonly options: ViewportFollowerOptions) {
    this.frames = options.frames ?? ANIMATION_FRAMES;
    this.camera = new CameraController({ now: options.now ?? ((): number => performance.now()), onChange: () => this.changed() });
    options.viewport.on('moved', this.onMoved);
    this.resize();
  }

  setScene(scene: PlayerScene | null): void {
    this.camera.setScene(scene);
  }

  setGmCamera(camera: SceneCamera | null): void {
    this.camera.setGmCamera(camera);
  }

  /** The view changed size: a follower refits, a player who broke away keeps their centre. */
  resize(): void {
    const { screenWidth: width, screenHeight: height } = this.options.viewport;
    this.camera.setScreen({ width, height });
  }

  followGm(): void {
    this.camera.followGm();
  }

  fitMap(): void {
    this.camera.fitMap();
  }

  /** Something else moved the viewport (the map image loading re-centres it): put the camera back. */
  reapply(): void {
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.options.viewport.off('moved', this.onMoved);
    if (this.frame !== null) this.frames.cancel(this.frame);
    this.frame = null;
  }

  private readonly onMoved = (event: { type: string }): void => {
    if (this.disposed || !PLAYER_MOVES.has(event.type)) return;
    const { viewport } = this.options;
    this.camera.movedByPlayer({ centerX: viewport.center.x, centerY: viewport.center.y, zoom: viewport.scale.x });
  };

  private changed(): void {
    const following = this.camera.isFollowing();
    if (following !== this.following) {
      this.following = following;
      this.options.onFollowingChange(following);
    }
    // A break-away leaves the viewport where the player put it.
    if (following || this.camera.isMoving()) this.schedule();
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.frames.request(() => {
      this.frame = null;
      this.draw();
    });
  }

  private draw(): void {
    if (this.disposed) return;
    this.apply(this.camera.current());
    if (this.camera.isMoving()) this.schedule();
  }

  private apply(camera: Camera): void {
    // setZoom first: moveCenter places the centre with the scale it finds.
    this.options.viewport.setZoom(camera.zoom);
    this.options.viewport.moveCenter(camera.centerX, camera.centerY);
  }
}
```

- [ ] **Step 4: Run the camera tests**

Run: `npx vitest run tests/unit/online/cameraController.test.ts tests/unit/online/obsidian/viewportFollower.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing background tests**

Append to `tests/unit/backgroundTextureCache.test.ts`, inside `describe('backgroundTextureCache', …)`:

```ts
  it('loads an object URL with the texture parser and unloads it as soon as nobody shows it', async () => {
    const cache = await loadCache();
    // A vault background in use would keep a released one idle.
    await cache.acquire('a');
    await cache.acquire('blob:app://obsidian.md/1');
    expect(assets.load).toHaveBeenLastCalledWith({ src: 'blob:app://obsidian.md/1', parser: 'texture' });
    cache.release('blob:app://obsidian.md/1');
    expect(assets.unload).toHaveBeenCalledWith('blob:app://obsidian.md/1');
    expect(assets.unload).not.toHaveBeenCalledWith('a');
  });
```

Create `tests/unit/online/obsidian/remoteMapBackdrop.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Sprite } from 'pixi.js';
import { toGridOptions } from '../../../../src/app/grid/gridStateOptions';
import { RemoteMapBackdrop, type BackdropRenderer } from '../../../../src/app/online/obsidian/RemoteMapBackdrop';
import type { GridState } from '../../../../src/app/services/MapPersistence';
import { playerScene } from '../sceneFixtures';

const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };

function setup() {
  let grid: unknown = null;
  const renderer: BackdropRenderer = {
    setBackgroundSprite: vi.fn(),
    initGrid: vi.fn(() => { grid = {}; }),
    getGridSystem: () => grid,
  };
  const sprites: Array<{ width: number; height: number; cellSize: number }> = [];
  const createSprite = (width: number, height: number, cellSize: number): Sprite => {
    const sprite = { width, height, cellSize, destroyed: false };
    sprites.push(sprite);
    return sprite as unknown as Sprite;
  };
  return { renderer, sprites, backdrop: new RemoteMapBackdrop(renderer, createSprite) };
}

describe('RemoteMapBackdrop', () => {
  it('puts a placeholder of the map size under a scene without its image, and starts the grid once', () => {
    const { renderer, sprites, backdrop } = setup();
    backdrop.show(playerScene(), null, GRID);
    expect(sprites).toEqual([{ width: 1000, height: 800, cellSize: 70, destroyed: false }]);
    expect(renderer.setBackgroundSprite).toHaveBeenCalledWith(sprites[0]);
    expect(renderer.initGrid).toHaveBeenCalledWith(toGridOptions(GRID), sprites[0]);
    backdrop.show(playerScene(), null, GRID);
    expect(sprites).toHaveLength(1);
    expect(renderer.initGrid).toHaveBeenCalledOnce();
  });

  it('leaves the background to the map image once it shows, and puts a placeholder back when it goes', () => {
    const { renderer, sprites, backdrop } = setup();
    backdrop.show(playerScene(), null, GRID);
    backdrop.show(playerScene(), 'blob:app://obsidian.md/map', GRID);
    expect(renderer.setBackgroundSprite).toHaveBeenCalledOnce();
    backdrop.show(playerScene(), null, GRID);
    expect(sprites).toHaveLength(2);
  });

  it('sizes a scene without a map size, or no scene, to twenty cells', () => {
    const { sprites, backdrop } = setup();
    backdrop.show(playerScene({ map: { asset: null, width: 0, height: 0, cellSize: 50 } }), null, GRID);
    backdrop.show(null, null, GRID);
    expect(sprites.map(({ width, height }) => [width, height])).toEqual([[1000, 1000], [1400, 1400]]);
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run tests/unit/backgroundTextureCache.test.ts tests/unit/online/obsidian/remoteMapBackdrop.test.ts`
Expected: FAIL. The cache loads the blob URL by string and keeps it idle, and `gridStateOptions` / `RemoteMapBackdrop` do not resolve.

- [ ] **Step 7: Release blob backgrounds, share the grid options and the placeholder**

In `src/app/pixi/backgroundTextureCache.ts`:
1. Above the class, add:

```ts
/** The online scene's maps arrive as object URLs: PIXI cannot tell their format from the URL, and they are never shown again once released. */
const isObjectUrl = (url: string): boolean => url.startsWith('blob:');
```

2. In `release`, replace `if (entry.refs === 0) this.trim();` with:

```ts
    if (entry.refs > 0) return;
    // An object URL is revoked by its owner once released; keeping its texture idle only holds memory.
    if (isObjectUrl(url)) this.evict(url);
    else this.trim();
```

3. In `load`, replace `texture: loadAsset<Texture>(url),` with:

```ts
    const entry: CacheEntry = {
      texture: loadAsset<Texture>(isObjectUrl(url) ? { src: url, parser: 'texture' } : url),
      refs: 0, bytes: 0, lastUsed: 0,
    };
```

(replacing the whole `const entry` line).

Create `src/app/grid/gridStateOptions.ts`, moving `toGridOptions` out of `BackgroundSprite.tsx` unchanged:

```ts
import type { GridState } from '../services/MapPersistence';
import type { GridOptions } from './GridSystem';
import { parseGridColor } from './gridContrastColor';
import { hexNumberStyleOfGrid } from './hexNumbering';

/** The store keeps the grid colour as a CSS hex string and its alpha as `opacity`; the GridSystem wants a number and `alpha`. */
export function toGridOptions(grid: GridState): GridOptions {
  return {
    size: grid.size,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    color: parseGridColor(grid.color),
    alpha: grid.opacity,
    enabled: grid.enabled,
    ...(grid.type !== undefined ? { type: grid.type } : {}),
    ...(grid.lineType !== undefined ? { lineType: grid.lineType } : {}),
    ...(grid.lineWidth !== undefined ? { lineWidth: grid.lineWidth } : {}),
    ...(grid.scale !== undefined ? { scale: grid.scale } : {}),
    ...(grid.mapScale !== undefined ? { mapScale: grid.mapScale } : {}),
    hexNumbers: hexNumberStyleOfGrid(grid),
  };
}
```

In `src/app/react/BackgroundSprite.tsx`:
1. Delete the local `toGridOptions` function and its doc comment. Delete the imports of `parseGridColor`, `hexNumberStyleOfGrid`, `GridState` and `toError`, and add `import { toGridOptions } from '../grid/gridStateOptions';`.
2. Replace the whole first `useEffect` (the one that loads the texture, with `cachedUrl` and `blobUrl`) with:

```tsx
  useEffect(() => {
    if (!imagePath) return;
    let isCancelled = false;
    // Every background goes through the shared cache, which releases what nobody shows.
    let cachedUrl: string | null = null;

    const loadTexture = async (): Promise<void> => {
      try {
        // The online scene's maps arrive as object URLs; vault images load by their resource URL.
        let url = imagePath;
        if (!imagePath.startsWith('blob:')) {
          const imgFile = app.vault.getAbstractFileByPath(imagePath);
          if (!imgFile) {
            console.error(`[BackgroundSprite] Image file not found: ${imagePath}`);
            return;
          }
          url = app.vault.adapter.getResourcePath(imgFile.path);
        }
        cachedUrl = url;
        const loadedTexture = await backgroundTextureCache.acquire(url);
        if (!isCancelled) {
          setTexture(loadedTexture);
          setSize({ width: loadedTexture.width, height: loadedTexture.height });
        }
      } catch (error) {
        console.error(`[BackgroundSprite] Failed to load texture: ${imagePath}`, error);
        cachedUrl = null;
      }
    };

    void loadTexture();

    return () => {
      isCancelled = true;
      if (cachedUrl) backgroundTextureCache.release(cachedUrl);
    };
  }, [imagePath, app.vault]);
```

In `src/app/MapLoader.ts`, replace `function createPlaceholderTexture(mapData: MapFile): Texture {` and its first line `const gridSize = mapData.grid?.size || 70;` with:

```ts
export function placeholderTexture(gridSize: number = 70): Texture {
```

(keep the rest of the body, which already reads `gridSize`), update its doc comment to `/** Transparent 20x20-cell texture for maps without a background image; shared per grid size, never unloaded. */`, and change both calls `createPlaceholderTexture(mapData)` to `placeholderTexture(mapData.grid?.size || 70)`.

Create `src/app/online/obsidian/RemoteMapBackdrop.ts`:

```ts
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
```

- [ ] **Step 8: Run the background tests**

Run: `npx vitest run tests/unit/backgroundTextureCache.test.ts tests/unit/online/obsidian/remoteMapBackdrop.test.ts tests/unit/mapService.failedLoad.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing status, dice and client tests**

Create `tests/unit/online/obsidian/onlineSceneStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { onlineSceneStatus } from '../../../../src/app/online/obsidian/onlineSceneStatus';
import type { PlayerSessionState } from '../../../../src/app/online/PlayerSession';

const state = (status: PlayerSessionState['status'], reason: string | null = null, title: string | null = 'Table'): PlayerSessionState => ({
  status, playerId: 'p1', title, players: [], reason,
});

describe('onlineSceneStatus', () => {
  it('names the session and its connection', () => {
    expect(onlineSceneStatus(state('admitted'), true)).toEqual({ title: 'Table', connection: 'Connected', tone: 'connected', message: null, reconnect: false });
    expect(onlineSceneStatus(state('admitted'), false).message).toBe('Waiting for the GM to show a scene.');
    expect(onlineSceneStatus(state('connecting', null, null), false)).toMatchObject({ title: 'the table', connection: 'Connecting…', tone: 'pending' });
    expect(onlineSceneStatus(state('connecting'), true).connection).toBe('Reconnecting…');
    expect(onlineSceneStatus(state('waiting'), false)).toMatchObject({ connection: 'Waiting for the GM', message: 'Waiting for the GM to let you in…' });
    expect(onlineSceneStatus(null, false)).toMatchObject({ title: 'the table', connection: 'Connecting…' });
  });

  it("says why the session ended in the join page's words, and offers Reconnect after a lost connection", () => {
    expect(onlineSceneStatus(state('lost', 'ended'), true)).toEqual({ title: 'Table', connection: 'Disconnected', tone: 'ended', message: 'The session ended.', reconnect: false });
    expect(onlineSceneStatus(state('lost', 'connection-lost'), true)).toMatchObject({ message: 'Lost the connection to your GM.', reconnect: true });
    expect(onlineSceneStatus(state('lost', 'unreachable'), false)).toMatchObject({ reconnect: true });
    expect(onlineSceneStatus(state('denied', 'kicked'), true)).toMatchObject({ message: 'The GM removed you from the session.', reconnect: false });
    expect(onlineSceneStatus(state('denied', 'version'), true).message).toBe("This page is out of date for your GM's Atlas. Ask them for a new link.");
    expect(onlineSceneStatus(state('lost', 'replaced'), true).message).toBe('You joined from another tab.');
  });
});
```

Create `tests/unit/online/obsidian/onlineSceneFixtures.ts`, the Online scene client's test world (Task 4 and the end-to-end test reuse it):

```ts
/**
 * An Online scene client on a real remote store, with a fake session service (or a real one),
 * a fake viewport, manual animation frames and a manual clock, and a real laser hub.
 */
import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import type { OnlineSceneSink } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { OnlineSceneClient, type OnlineSceneService } from '../../../../src/app/online/obsidian/OnlineSceneClient';
import type { FollowViewport, Frames } from '../../../../src/app/online/obsidian/ViewportFollower';
import type { PlayerSessionState } from '../../../../src/app/online/PlayerSession';
import { GLIDE_MS } from '../../../../src/app/online/view/camera';
import { LaserHub } from '../../../../src/app/pixi/laser/LaserHub';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';

export class FakeViewport implements FollowViewport {
  screenWidth = 800;
  screenHeight = 600;
  center = { x: 0, y: 0 };
  scale = { x: 1 };
  readonly listeners = new Set<(event: { type: string }) => void>();
  setZoom(zoom: number): void { this.scale.x = zoom; }
  moveCenter(x: number, y: number): void { this.center = { x, y }; }
  on(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.add(listener); }
  off(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.delete(listener); }
  /** pixi-viewport's `moved` event after one of its plugins moved it. */
  moved(type: string): void { for (const listener of [...this.listeners]) listener({ type }); }
}

export const admitted = (players: string[] = []): PlayerSessionState => ({
  status: 'admitted', playerId: 'me', title: 'Table', reason: null,
  players: players.map((playerId) => ({ playerId, name: playerId, connected: true })),
});

let count = 0;

export interface OnlineSceneSetupOptions {
  /** A real service; the fake one records what the client sends. */
  service?: OnlineSceneService;
  /** The fake service finds no joined session. */
  noSession?: boolean;
  /** Attach right away (the default); the end-to-end test attaches on admission. */
  attach?: boolean;
}

export function onlineSceneSetup(options: OnlineSceneSetupOptions = {}) {
  const vault = createInMemoryApp();
  const store = createViewAtlasStore(vault.app, `online-${count++}`, undefined, false, { remote: true });
  let sink: OnlineSceneSink | null = null;
  const detach = vi.fn();
  const fake = {
    attach: vi.fn((given: OnlineSceneSink) => {
      if (options.noSession) return null;
      sink = given;
      return detach;
    }),
    images: { background: (): string | null => null, token: (): string | null => null },
    reconnect: vi.fn(),
    sendDiceRoll: vi.fn((): boolean => true),
    sendTokenMove: vi.fn((): boolean => true),
    sendLaser: vi.fn((): boolean => true),
  };
  const service: OnlineSceneService = options.service ?? fake;
  let queue: Array<() => void> = [];
  const frames: Frames = { request: (draw) => { queue.push(draw); return queue.length; }, cancel: () => { queue = []; } };
  let now = 0;
  const viewport = new FakeViewport();
  const backdrop = { show: vi.fn(), dispose: vi.fn() };
  const initiative = { mount: vi.fn(), present: vi.fn(), hold: vi.fn(), destroy: vi.fn() };
  const eventBus = new EventEmitter();
  const hub = new LaserHub();
  const showRemote = vi.spyOn(hub, 'showRemote');
  const closeTab = vi.fn();
  const parent = document.createElement('div');
  const client = new OnlineSceneClient({
    store, service, viewport, backdrop, initiative, parent, eventBus, laserHub: hub, closeTab, frames, now: () => now,
  });
  const attached = options.attach === false ? false : client.attach();
  const runFrames = (): void => { const due = queue; queue = []; due.forEach((draw) => draw()); };
  const settle = (): void => { now += GLIDE_MS + 1; runFrames(); runFrames(); };
  return {
    vault, store, fake, client, attached, viewport, backdrop, initiative, eventBus, hub, showRemote, closeTab, detach, runFrames, settle,
    sink: (): OnlineSceneSink => {
      if (!sink) throw new Error('The client did not attach to the fake service');
      return sink;
    },
    pendingFrames: (): number => queue.length,
  };
}
```

Create `tests/unit/online/obsidian/onlineSceneClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { laserColor } from '../../../../src/app/online/tools/laserColors';
import { playerScene } from '../sceneFixtures';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

const setup = onlineSceneSetup;

afterEach(() => { vi.restoreAllMocks(); });

describe('OnlineSceneClient', () => {
  it('shows the scene in the store, the session in the status bar, and the initiative panel', () => {
    const t = setup();
    expect(t.attached).toBe(true);
    expect(t.initiative.mount).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(t.initiative.present).toHaveBeenCalledWith(t.store);
    t.sink().session(admitted());
    expect(t.store.getState().remoteScene?.status).toMatchObject({ title: 'Table', connection: 'Connected', message: 'Waiting for the GM to show a scene.' });
    const scene = playerScene();
    t.sink().scene(scene);
    expect(Object.keys(t.store.getState().objects.tokens)).toEqual(['t1']);
    expect(t.store.getState().remoteScene?.status.message).toBeNull();
    expect(t.backdrop.show).toHaveBeenLastCalledWith(scene, null, t.store.getState().grid);
  });

  it('keeps only the tokens the GM gives this player as movable', () => {
    const t = setup();
    t.sink().control(['t1']);
    expect(t.store.getState().remoteScene?.movableTokenIds).toEqual(['t1']);
  });

  it('follows the GM and offers Follow GM once the player breaks away', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.sink().camera({ sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 });
    t.settle();
    expect(t.viewport.center).toEqual({ x: 200, y: 100 });
    t.viewport.moved('drag');
    expect(t.store.getState().remoteScene?.following).toBe(false);
    t.client.controls.followGm();
    expect(t.store.getState().remoteScene?.following).toBe(true);
    t.client.controls.fitMap();
    expect(t.store.getState().remoteScene?.following).toBe(false);
  });

  it('puts the camera back when the map image moved the viewport', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.sink().camera({ sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 });
    t.settle();
    t.viewport.center = { x: 500, y: 400 };
    t.eventBus.emit('background-sprite-updated', { x: 0, y: 0, width: 1000, height: 800 });
    t.settle();
    expect(t.viewport.center).toEqual({ x: 200, y: 100 });
  });

  it('redraws arriving images at most once a frame', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.settle();
    t.sink().images();
    t.sink().images();
    t.sink().images();
    expect(t.pendingFrames()).toBe(1);
  });

  it("shows the shared dice log in Atlas's dice log, newest first, under each roller's name", () => {
    const t = setup();
    t.sink().diceLog([
      { id: 'r2', name: 'Anna', formula: '2d6+1', dice: [{ die: 'd6', value: 4 }, { die: 'd6', value: 2 }], modifier: 1, total: 7, at: 2000 },
      { id: 'r1', name: 'GM', formula: 'd20', dice: [{ die: 'd20', value: 11 }], modifier: 0, total: 11, at: 1000 },
    ]);
    expect(t.store.getState().diceLog).toEqual([
      { id: 'r2', timestamp: 2000, formula: '2d6+1', rolls: [{ die: 'd6', value: 4, max: 6 }, { die: 'd6', value: 2, max: 6 }], modifiers: 1, total: 7, rolledBy: 'Anna' },
      { id: 'r1', timestamp: 1000, formula: 'd20', rolls: [{ die: 'd20', value: 11, max: 20 }], modifiers: 0, total: 11, rolledBy: 'GM' },
    ]);
  });

  it("draws other people's lasers on this scene in their colours, and nobody's for another scene", () => {
    const t = setup();
    t.sink().session(admitted(['p1', 'p2']));
    t.sink().scene(playerScene());
    t.sink().laser({ from: 'p2', sceneId: 'scene-1', points: [{ x: 1, y: 2 }], lifted: false, dt: [0] });
    t.sink().laser({ from: 'gm', sceneId: 'scene-1', points: [], lifted: true, color: '#ffffff' });
    t.sink().laser({ from: 'p1', sceneId: 'other', points: [{ x: 1, y: 2 }], lifted: false });
    expect(t.showRemote.mock.calls).toEqual([
      [{ from: 'p2', color: laserColor('p2', ['p1', 'p2']), points: [{ x: 1, y: 2 }], lifted: false, dt: [0] }],
      [{ from: 'gm', color: '#ffffff', points: [], lifted: true }],
    ]);
  });

  it('shows the end of the session, keeps the scene, and offers Reconnect after a lost connection', () => {
    const t = setup();
    t.sink().session(admitted());
    t.sink().scene(playerScene());
    t.sink().session({ ...admitted(), status: 'lost', reason: 'connection-lost' });
    expect(t.store.getState().remoteScene?.status).toMatchObject({ tone: 'ended', message: 'Lost the connection to your GM.', reconnect: true });
    expect(Object.keys(t.store.getState().objects.tokens)).toEqual(['t1']);
    t.client.controls.reconnect();
    expect(t.fake.reconnect).toHaveBeenCalledOnce();
  });

  it('rolls through the session', () => {
    const t = setup();
    expect(t.client.controls.rollDice({ d20: 1 }, 2)).toBe(true);
    expect(t.fake.sendDiceRoll).toHaveBeenCalledWith({ d20: 1 }, 2);
  });

  it('closes its tab when the session is left from elsewhere', () => {
    const t = setup();
    t.sink().close();
    expect(t.closeTab).toHaveBeenCalledOnce();
  });

  it('says it could not attach without a joined session', () => {
    expect(setup({ noSession: true }).attached).toBe(false);
  });

  it('dispose lets go of the session, the camera, the panel and the events', () => {
    const t = setup();
    t.sink().scene(playerScene());
    t.client.dispose();
    expect(t.detach).toHaveBeenCalledOnce();
    expect(t.initiative.destroy).toHaveBeenCalledOnce();
    expect(t.backdrop.dispose).toHaveBeenCalledOnce();
    expect(t.viewport.listeners.size).toBe(0);
    expect(t.eventBus.listenerCount('background-sprite-updated')).toBe(0);
    expect(t.pendingFrames()).toBe(0);
  });
});
```

Run: `npx vitest run tests/unit/online/obsidian/onlineSceneStatus.test.ts tests/unit/online/obsidian/onlineSceneClient.test.ts`
Expected: FAIL with "Failed to resolve import ... onlineSceneStatus".

- [ ] **Step 10: Write the status, the dice log conversion and the client**

Create `src/app/online/obsidian/onlineSceneStatus.ts`:

```ts
/**
 * The Online scene's status bar from the session state: the GM's session title, the connection,
 * and why the session waits or ended, in the join page's words. Reconnect is offered when the
 * connection was lost or never made.
 */
import { sessionReasonText } from '../page/pageScreen';
import type { PlayerSessionState } from '../PlayerSession';
import { DEFAULT_TABLE_TITLE, type OnlineSceneStatus } from './remoteScene';

export const LOST_CONNECTION_TEXT = 'Lost the connection to your GM.';
export const NO_SCENE_TEXT = 'Waiting for the GM to show a scene.';
export const WAITING_TEXT = 'Waiting for the GM to let you in…';

export function onlineSceneStatus(state: PlayerSessionState | null, hasScene: boolean): OnlineSceneStatus {
  const title = state?.title ?? DEFAULT_TABLE_TITLE;
  switch (state?.status ?? 'connecting') {
    case 'admitted':
      return { title, connection: 'Connected', tone: 'connected', message: hasScene ? null : NO_SCENE_TEXT, reconnect: false };
    case 'connecting':
      return { title, connection: hasScene ? 'Reconnecting…' : 'Connecting…', tone: 'pending', message: null, reconnect: false };
    case 'waiting':
      return { title, connection: 'Waiting for the GM', tone: 'pending', message: WAITING_TEXT, reconnect: false };
    case 'denied':
      return { title, connection: 'Disconnected', tone: 'ended', message: sessionReasonText(state?.reason, 'denied'), reconnect: false };
    case 'lost': {
      const reason = state?.reason ?? 'unreachable';
      return {
        title,
        connection: 'Disconnected',
        tone: 'ended',
        message: reason === 'connection-lost' ? LOST_CONNECTION_TEXT : sessionReasonText(reason, 'unreachable'),
        reconnect: reason === 'connection-lost' || reason === 'unreachable',
      };
    }
  }
}
```

Create `src/app/online/obsidian/onlineDice.ts`:

```ts
/**
 * The shared dice log in Atlas's dice log panel: each entry as one of Atlas's rolls, under the
 * roller's name. These rolls live only in the online scene's store, which is never saved, and
 * never go through Atlas's document-wide dice event, which every open map would record.
 */
import type { DiceRollResult } from '../../tools/diceRolling';
import type { DiceLogEntry } from '../tools/toolMessages';

export function diceLogResults(entries: readonly DiceLogEntry[]): DiceRollResult[] {
  return entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.at,
    formula: entry.formula,
    rolls: entry.dice.map(({ die, value }) => ({ die, value, max: Number(die.slice(1)) })),
    modifiers: entry.modifier,
    total: entry.total,
    rolledBy: entry.name,
  }));
}
```

Create `src/app/online/obsidian/OnlineSceneClient.ts`:

```ts
/**
 * The Online scene view's wiring, without PIXI: the joined session's sink. It feeds the remote
 * store (`RemoteSceneApplier`), the camera (`ViewportFollower`), the placeholder background, the
 * initiative panel and the status bar, draws other people's lasers through Atlas's laser hub, and
 * answers the view's controls.
 */
import type { EventEmitter } from 'events';
import type { LaserHub } from '../../pixi/laser/LaserHub';
import type { PlayerOverlay } from '../../services/PlayerSceneOverlay';
import type { ViewAtlasStore } from '../../storeFactory';
import type { PlayerSessionState } from '../PlayerSession';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene } from '../scene/sceneTypes';
import { laserColor } from '../tools/laserColors';
import type { DiceLogEntry, PlayerLaser } from '../tools/toolMessages';
import { diceLogResults } from './onlineDice';
import type { OnlineJoinService, OnlineSceneSink } from './OnlineJoinService';
import { onlineSceneStatus } from './onlineSceneStatus';
import { updateRemoteScene, type OnlineSceneControls } from './remoteScene';
import type { RemoteMapBackdrop } from './RemoteMapBackdrop';
import { RemoteSceneApplier } from './RemoteSceneApplier';
import { ANIMATION_FRAMES, ViewportFollower, type FollowViewport, type Frames } from './ViewportFollower';

export type OnlineSceneService = Pick<OnlineJoinService, 'attach' | 'images' | 'reconnect' | 'sendDiceRoll' | 'sendTokenMove' | 'sendLaser'>;

export interface OnlineSceneClientOptions {
  store: ViewAtlasStore;
  service: OnlineSceneService;
  viewport: FollowViewport;
  backdrop: Pick<RemoteMapBackdrop, 'show' | 'dispose'>;
  /** Atlas's read-only initiative panel, mounted into `parent`. */
  initiative: PlayerOverlay;
  parent: HTMLElement;
  /** The view's event bus: `background-sprite-updated` tells the map image moved the viewport. */
  eventBus: EventEmitter;
  laserHub: Pick<LaserHub, 'showRemote'>;
  /** The session was left from elsewhere: close the tab. */
  closeTab(): void;
  /** Tests pass their own frames and clock. */
  frames?: Frames;
  now?: () => number;
}

export class OnlineSceneClient implements OnlineSceneSink {
  readonly controls: OnlineSceneControls;
  private readonly applier: RemoteSceneApplier;
  private readonly follower: ViewportFollower;
  private readonly frames: Frames;
  private state: PlayerSessionState | null = null;
  private shown: PlayerScene | null = null;
  private detachSession: (() => void) | null = null;
  private imagesFrame: number | null = null;
  private disposed = false;

  constructor(private readonly options: OnlineSceneClientOptions) {
    const { store } = options;
    this.frames = options.frames ?? ANIMATION_FRAMES;
    this.applier = new RemoteSceneApplier({ store, images: options.service.images });
    this.follower = new ViewportFollower({
      viewport: options.viewport,
      onFollowingChange: (following) => updateRemoteScene(store, { following }),
      frames: this.frames,
      ...(options.now ? { now: options.now } : {}),
    });
    this.controls = {
      followGm: () => this.follower.followGm(),
      fitMap: () => this.follower.fitMap(),
      reconnect: () => options.service.reconnect(),
      rollDice: (dice, modifier) => options.service.sendDiceRoll(dice, modifier),
    };
    options.initiative.mount(options.parent);
    options.initiative.present(store);
    options.eventBus.on('background-sprite-updated', this.onBackgroundMoved);
  }

  /** Attaches to the joined session; false when there is none. */
  attach(): boolean {
    this.detachSession = this.options.service.attach(this);
    return this.detachSession !== null;
  }

  session(state: PlayerSessionState): void {
    this.state = state;
    this.showStatus();
  }

  scene(scene: PlayerScene | null): void {
    this.shown = scene;
    this.applier.apply(scene);
    this.follower.setScene(scene);
    this.showBackdrop();
    this.showStatus();
  }

  camera(camera: SceneCamera): void {
    this.follower.setGmCamera(camera);
  }

  control(tokenIds: readonly string[]): void {
    updateRemoteScene(this.options.store, { movableTokenIds: [...tokenIds] });
  }

  moveRefused(_tokenId: string): void {
    // This view sends no token moves yet, so the GM refuses none.
  }

  diceLog(entries: readonly DiceLogEntry[]): void {
    this.options.store.setState({ diceLog: diceLogResults(entries) });
  }

  /** Someone else's laser: drawn when it is on the scene this view shows, in its sender's or its place's colour. */
  laser(laser: PlayerLaser): void {
    if (laser.sceneId !== this.shown?.sceneId) return;
    const order = this.state?.players.map((player) => player.playerId) ?? [];
    this.options.laserHub.showRemote({
      from: laser.from,
      color: laser.color ?? laserColor(laser.from, order),
      points: laser.points,
      lifted: laser.lifted,
      ...(laser.dt ? { dt: laser.dt } : {}),
    });
  }

  /** Images arrive chunk by chunk: the store follows at most once a frame. */
  images(): void {
    if (this.disposed || this.imagesFrame !== null) return;
    this.imagesFrame = this.frames.request(() => {
      this.imagesFrame = null;
      if (this.disposed) return;
      this.applier.refresh();
      this.showBackdrop();
    });
  }

  close(): void {
    this.options.closeTab();
  }

  resize(): void {
    this.follower.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachSession?.();
    this.detachSession = null;
    if (this.imagesFrame !== null) this.frames.cancel(this.imagesFrame);
    this.imagesFrame = null;
    this.options.eventBus.off('background-sprite-updated', this.onBackgroundMoved);
    this.follower.dispose();
    this.applier.dispose();
    this.options.backdrop.dispose();
    this.options.initiative.destroy();
  }

  private readonly onBackgroundMoved = (): void => {
    this.follower.reapply();
  };

  private showBackdrop(): void {
    const { background, grid } = this.options.store.getState();
    this.options.backdrop.show(this.shown, background, grid);
  }

  private showStatus(): void {
    updateRemoteScene(this.options.store, { status: onlineSceneStatus(this.state, this.shown !== null) });
  }
}
```

`moveRefused` is empty on purpose: this task sends no token moves, so nothing can be refused. Task 4 replaces it with `RemoteTokenMoves.refused`.

- [ ] **Step 11: Run the client tests**

Run: `npx vitest run tests/unit/online/obsidian/onlineSceneStatus.test.ts tests/unit/online/obsidian/onlineSceneClient.test.ts`
Expected: PASS.

- [ ] **Step 12: Write the failing UI gating tests**

Create `tests/unit/viewConditionDefinitions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { viewConditionDefinitions } from '../../src/app/pixi/token-renderer/viewConditionDefinitions';
import { initialRemoteScene } from '../../src/app/online/obsidian/remoteScene';

const prone = { id: 'prone', name: 'Prone', color: '#ff0000' };
const collections = {
  getCollectionForMap: vi.fn((path: string) => (path.startsWith('atlas-vtt/collections/c/') ? 'c' : null)),
  getCollectionSettings: vi.fn(() => ({ conditions: [prone] })),
};

describe('viewConditionDefinitions', () => {
  it("reads a map's conditions from its collection, as before", () => {
    expect(viewConditionDefinitions({ mapPath: 'atlas-vtt/collections/c/scenes/a.atlasmap', remoteScene: null }, collections as never)).toEqual([prone]);
    expect(viewConditionDefinitions({ mapPath: 'elsewhere.atlasmap', remoteScene: null }, collections as never)).toEqual([]);
    expect(viewConditionDefinitions({ mapPath: null, remoteScene: null }, collections as never)).toEqual([]);
  });

  it("shows the online scene's neutral badges and never reads a collection for it", () => {
    collections.getCollectionForMap.mockClear();
    const neutral = { id: 'x', name: 'Condition', color: '#5b5f6a' };
    const remoteScene = { ...initialRemoteScene(), conditions: [neutral] };
    expect(viewConditionDefinitions({ mapPath: null, remoteScene }, collections as never)).toEqual([neutral]);
    expect(collections.getCollectionForMap).not.toHaveBeenCalled();
  });
});
```

Create `tests/unit/activeMapView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { activeMapView } from '../../src/app/plugin/atlasLeaves';

const appWith = (view: unknown): never => ({ workspace: { getActiveViewOfType: () => view } }) as never;

describe('activeMapView', () => {
  it('is the active map view, and never the online scene', () => {
    const map = { isRemote: false };
    expect(activeMapView(appWith(map))).toBe(map);
    expect(activeMapView(appWith({ isRemote: true }))).toBeNull();
    expect(activeMapView(appWith(null))).toBeNull();
  });
});
```

Create `tests/unit/online/obsidian/onlineSceneToolbar.test.tsx`. It reuses the mocks of `tests/unit/mainToolbar.text-tool.test.tsx` with a store whose `remoteScene` can be set:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../../../src/app/online/obsidian/remoteScene';

const controls = { followGm: vi.fn(), fitMap: vi.fn(), reconnect: vi.fn(), rollDice: vi.fn(() => true) };
const storeState: Record<string, unknown> = {
  activeTool: 'move', setActiveTool: vi.fn(), selectionMode: 'box', setSelectionMode: vi.fn(), isGMView: true, setGMView: vi.fn(),
  isCommandPaletteOpen: false, setCommandPaletteOpen: vi.fn(), isAssetManagerOpen: false, assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false, setDiceTrayOpen: vi.fn(), initiativeTrackerOpen: false, lootRoller: { open: false }, setLootRollerOpen: vi.fn(),
  isOnlinePanelOpen: false, setOnlinePanelOpen: vi.fn(), setInitiativeTrackerOpen: vi.fn(), objects: { tokens: {} },
  setSelection: vi.fn(), openAssetManager: vi.fn(), closeAssetManager: vi.fn(), remoteScene: null,
};

vi.mock('../../../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => ({ getState: () => storeState }),
}));
vi.mock('../../../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: {
      getViewType: () => 'atlas-online-scene',
      onlineControls: () => controls,
      serviceManager: { getEventBus: () => null, getToolController: () => null, getNotePreviewUIManager: () => null },
    },
  }),
}));
vi.mock('../../../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: () => {},
}));
vi.mock('../../../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
vi.mock('../../../../src/app/packages/components/primitives/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LabelTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../../src/app/packages/components/primitives/ToolButton', () => ({
  ToolButton: ({ label, onClick }: { label: string; onClick?: () => void }) => <button type="button" onClick={onClick}>{label}</button>,
}));
vi.mock('../../../../src/app/packages/components/primitives/DropdownMenu', () => ({ DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownMenuItem', () => ({ DropdownMenuItem: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownToggleRow', () => ({ DropdownToggleRow: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownSliderRow', () => ({ DropdownSliderRow: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/DropdownModeSelector', () => ({ DropdownModeSelector: () => null }));
vi.mock('../../../../src/app/packages/components/primitives/Toggle', () => ({ Toggle: () => <div>GM view switch</div> }));
vi.mock('../../../../src/app/react/components/CommandPalette', () => ({ CommandPalette: () => <div>palette</div> }));
vi.mock('../../../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => <div>asset manager</div> }));
vi.mock('../../../../src/app/react/components/dice/DiceDropdownMenu', () => ({ DiceDropdownMenu: () => null }));

import { MainToolbar } from '../../../../src/app/packages/components/MainToolbar';

const GM_ONLY = ['Fog Tool', 'Draw Tool', 'Text Tool', 'Note Pin Tool', 'Online session', 'Loot Roller', 'Asset Manager', 'Command Palette'];

afterEach(() => {
  cleanup();
  storeState.remoteScene = null;
  vi.clearAllMocks();
});

describe('the online scene toolbar', () => {
  it("keeps the player's tools only, and the palette and asset manager away", () => {
    storeState.remoteScene = initialRemoteScene();
    render(<MainToolbar viewId="online" />);
    for (const label of ['Move/Select', 'Measure Line', 'Roll Dice']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    for (const label of GM_ONLY) expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(screen.queryByText('GM view switch')).toBeNull();
    expect(screen.queryByText('palette')).toBeNull();
    expect(screen.queryByText('asset manager')).toBeNull();
  });

  it('shows Follow GM and Fit map only while the player has broken away', () => {
    storeState.remoteScene = initialRemoteScene();
    const { rerender } = render(<MainToolbar viewId="online" />);
    expect(screen.queryByRole('button', { name: 'Follow GM' })).toBeNull();
    storeState.remoteScene = { ...initialRemoteScene(), following: false };
    rerender(<MainToolbar viewId="online" />);
    fireEvent.click(screen.getByRole('button', { name: 'Follow GM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
    expect(controls.followGm).toHaveBeenCalledOnce();
    expect(controls.fitMap).toHaveBeenCalledOnce();
  });

  it('GM toolbar: a map view keeps every tool and no Follow GM', () => {
    render(<MainToolbar viewId="map" />);
    for (const label of GM_ONLY) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow GM' })).toBeNull();
    expect(screen.getByText('GM view switch')).toBeTruthy();
  });
});
```

Run: `npx vitest run tests/unit/viewConditionDefinitions.test.ts tests/unit/activeMapView.test.ts tests/unit/online/obsidian/onlineSceneToolbar.test.tsx`
Expected: FAIL with "Failed to resolve import ... viewConditionDefinitions".

- [ ] **Step 13: Gate the GM UI and add the online controls**

Create `src/app/pixi/token-renderer/viewConditionDefinitions.ts`:

```ts
import type { AssetService } from '../../services/AssetService';
import type { ViewAtlasState } from '../../storeFactory';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

/**
 * The condition definitions a view's badges read: a map's collection's, or the online scene's
 * neutral ones (players never receive the GM's definitions).
 */
export function viewConditionDefinitions(
  state: Pick<ViewAtlasState, 'mapPath' | 'remoteScene'>,
  collections: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
): ConditionDefinition[] {
  if (state.remoteScene) return [...state.remoteScene.conditions];
  const collectionId = state.mapPath ? collections.getCollectionForMap(state.mapPath) : null;
  return collectionId ? collections.getCollectionSettings(collectionId).conditions : [];
}
```

In `src/app/pixi/TokenRenderer.ts`, replace the body of `conditionDefsProvider`:

```ts
    const conditionDefsProvider = (): ConditionDefinition[] => viewConditionDefinitions(this.store.getState(), this.assetService);
```

and import `viewConditionDefinitions` from `./token-renderer/viewConditionDefinitions`.

In `src/app/services/PlayerSceneOverlay.ts`, add after the `PlayerSettings` type:

```ts
/** Where an overlay reads the player view settings: Atlas's settings, or the online scene's show-what-arrives source. */
export type PlayerSettingsSource = Pick<SettingsService, 'getLocalPlayerViewSettings' | 'onChange'>;
```

and change the constructor parameter `settings: SettingsService` to `settings: PlayerSettingsSource`. In `src/app/services/PlayerInitiativePanel.ts`, change `constructor(private readonly app: App, settings: SettingsService)` to `constructor(private readonly app: App, settings: PlayerSettingsSource)`, import `PlayerSettingsSource` beside `PlayerSceneOverlay`, and remove the now unused `SettingsService` import.

In `src/app/services/ServiceManager.ts`:
1. Add above the class:

```ts
export interface ServiceManagerOptions {
  /** The online scene view's: its widgets are another Atlas's and never sync with this vault's collections. */
  remote?: boolean;
}
```

2. Change the constructor to `constructor(private app: App, private store: ViewAtlasStore, private plugin?: AtlasVTTPlugin, viewId?: string, options: ServiceManagerOptions = {}) {`.
3. Change `if (plugin) {` (the widget sync block) to `if (plugin && !options.remote) {`.

In `src/app/atlas-view.ts`:
1. Add `import type { OnlineSceneControls } from './online/obsidian/remoteScene';`.
2. Change the constructor signature to `constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin, isPlayerView: boolean = false, remote: boolean = false) {`, the store line to `this.store = createViewAtlasStore(this.app, this.viewId, this.plugin, isPlayerView, { remote });`, and the service line to `this._serviceManager = new ServiceManager(this.app, this.store, this.plugin, this.viewId, { remote });`.
3. Add after `get isClosed()`:

```ts
  /** True for the online scene view, which shows another Atlas's scene and never one of this vault's maps. */
  get isRemote(): boolean {
    return this.store.getState().remoteScene !== null;
  }

  /** What the online scene's UI asks of its view; null for a map view. */
  public onlineControls(): OnlineSceneControls | null {
    return null;
  }
```

4. Change `private setupWindowResizeDetection(): void {` to `protected setupWindowResizeDetection(): void {`. Inside its observer, after `rendererService.resize(currentWidth, currentHeight);`, add `this.onContainerResized();`, and add after the method:

```ts
  /** The view's container changed size, after the renderer resized. */
  protected onContainerResized(): void {
    // Map views have nothing more to follow; the online scene refits its camera.
  }
```

Create `src/app/react/components/online/onlineSceneToolbarItems.tsx`:

```tsx
import React from 'react';
import { LocateFixed, Maximize } from 'lucide-react';
import { ToolButton } from '../../../packages/components/primitives/ToolButton';
import type { ResponsiveToolbarItem } from '../../../packages/components/toolbar/toolbarTypes';
import type { OnlineSceneControls } from '../../../online/obsidian/remoteScene';

export const FOLLOW_GM_LABEL = 'Follow GM';
export const FIT_MAP_LABEL = 'Fit map';

interface OnlineSceneToolbarOptions {
  /** From `PRIORITY` in MainToolbar.tsx. */
  priority: { follow: number; fit: number };
  fitShortcut: string;
  controls: Pick<OnlineSceneControls, 'followGm' | 'fitMap'> | null;
}

/** Follow GM and Fit map, shown while the player has broken away from the GM's camera. */
export function onlineSceneToolbarItems({ priority, fitShortcut, controls }: OnlineSceneToolbarOptions): ResponsiveToolbarItem[] {
  const followGm = (): void => controls?.followGm();
  const fitMap = (): void => controls?.fitMap();
  return [
    {
      id: 'follow',
      priority: priority.follow,
      pinned: false,
      element: <ToolButton icon={LocateFixed} label={FOLLOW_GM_LABEL} isActive={false} onClick={followGm} />,
      menuEntry: { icon: LocateFixed, label: FOLLOW_GM_LABEL, isActive: false, onSelect: followGm },
    },
    {
      id: 'fit',
      priority: priority.fit,
      pinned: false,
      element: <ToolButton icon={Maximize} label={FIT_MAP_LABEL} shortcut={fitShortcut} isActive={false} onClick={fitMap} />,
      menuEntry: { icon: Maximize, label: FIT_MAP_LABEL, shortcut: fitShortcut, isActive: false, onSelect: fitMap },
    },
  ];
}
```

In `src/app/packages/components/MainToolbar.tsx`:
1. Import `import { onlineSceneToolbarItems } from "../../react/components/online/onlineSceneToolbarItems"`.
2. Add to `PRIORITY` (keep the object sorted by value): `follow: 95,` after `move: 100,` and `fit: 92,` after it.
3. After `const isActualPlayerView = view?.getViewType?.() === 'atlas-vtt-player'`, add:

```tsx
  // The online scene view: another Atlas's scene, with the player's tools only
  const remote = useAtlasStore(state => Boolean(state.remoteScene))
  const following = useAtlasStore(state => state.remoteScene?.following ?? true)
```

4. Change `useToolbarHotkeys(viewId, isActualPlayerView, {` to `useToolbarHotkeys(viewId, isActualPlayerView || remote, {`.
5. Change `const dm = !isActualPlayerView` to `const dm = !isActualPlayerView && !remote`.
6. In `items`, right after the `measure` group item, add:

```tsx
    ...(remote && !following
      ? onlineSceneToolbarItems({ priority: { follow: PRIORITY.follow, fit: PRIORITY.fit }, fitShortcut: hotkeyLabel('fitMap'), controls: view?.onlineControls() ?? null })
      : []),
```

7. Wrap `<CommandPalette … />` as `{!remote && (<CommandPalette … />)}` and `<AssetManager … />` as `{!remote && (<AssetManager … />)}`, keeping their props.

Create `src/app/react/components/online/OnlineSceneBar.tsx`:

```tsx
import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';

/** The online scene's slim status bar: the GM's session, the connection, a refusal, and Reconnect. */
export function OnlineSceneBar(): React.ReactElement | null {
  const status = useAtlasStore((state) => state.remoteScene?.status ?? null);
  const notice = useAtlasStore((state) => state.remoteScene?.notice ?? null);
  const { view } = useAtlasUI();
  if (!status) return null;
  return (
    <div className="atlas-online-scene-bar" role="status" aria-live="polite">
      <span className={`atlas-online-scene-bar__dot atlas-online-scene-bar__dot--${status.tone}`} aria-hidden="true" />
      <span className="atlas-online-scene-bar__title">{status.title}</span>
      <span className="atlas-online-scene-bar__connection">{status.connection}</span>
      {status.message && <span className="atlas-online-scene-bar__message">{status.message}</span>}
      {notice && <span className="atlas-online-scene-bar__notice">{notice}</span>}
      {status.reconnect && (
        <Button variant="default" size="sm" className="atlas-online-scene-bar__action" onClick={() => view?.onlineControls()?.reconnect()}>
          Reconnect
        </Button>
      )}
    </div>
  );
}
```

Create `src/app/react/components/online/online-scene.scss`:

```scss
// ═══════════════════════════════════════════════════════════════════════════
// The online scene's status bar, at the start of the top row. Imported inside
// the `.atlas-vtt-plugin` scope of styles/main.scss.
// ═══════════════════════════════════════════════════════════════════════════

@use '../../../../../styles/tokens' as *;
@use '../../../../../styles/mixins' as *;
@use 'online-marks' as *;

$online-scene-bar-inset: $spacing-xs;

.atlas-online-scene-bar {
  @include atlas-elevated-surface;
  // Shorter than the radius allows, so the bar renders as a capsule.
  @include atlas-panel-radius($radius-2xl);
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $spacing-s;
  padding: $online-scene-bar-inset $spacing-s;
  min-height: $button-height-s + 2 * $online-scene-bar-inset;
  pointer-events: auto;
  color: var(--text-normal);
  font-size: $font-ui-small;
}

.atlas-online-scene-bar__dot {
  width: $online-mark-size;
  height: $online-mark-size;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--text-faint);

  &--connected { background: var(--color-green); }
  &--pending { background: var(--color-yellow); }
  &--ended { background: var(--color-red); }
}

.atlas-online-scene-bar__title {
  @include atlas-truncate;
  font-weight: $font-weight-medium;
}

.atlas-online-scene-bar__connection,
.atlas-online-scene-bar__message {
  color: var(--text-muted);
  white-space: nowrap;
}

.atlas-online-scene-bar__notice {
  color: var(--text-error);
  white-space: nowrap;
}

// The button sits at the capsule's end, so its corner follows the bar's.
.atlas-online-scene-bar__action {
  border-radius: atlas-panel-inset-radius-value($online-scene-bar-inset, $button-height-s * 0.5);
}
```

The bar's padding differs inline and block on purpose: its height follows the 24 px button with a 4 px inset like the scene tab bar, and its text needs the 8 px gap from the capsule's rounded ends.

In `styles/main.scss`, add `@import '../src/app/react/components/online/online-scene.scss';` after the `online-toolbar-marks.scss` import.

In `src/app/react/UIRoot.tsx`:
1. Import `import { OnlineSceneBar } from './components/online/OnlineSceneBar';`.
2. After `const isPlayerView = …`, add `const remote = useAtlasStore(state => Boolean(state.remoteScene));`.
3. In the `fitMap` hotkey branch, right after `e.preventDefault();`, add:

```tsx
        // The online scene fits through its camera, which then stops following the GM.
        const onlineControls = view?.onlineControls() ?? null;
        if (onlineControls) {
          onlineControls.fitMap();
          return;
        }
```

4. Inside `<div className="atlas-top-bar-row">`, before the `ResponsiveWidgetBar`, add `{remote && <OnlineSceneBar />}`.

In `src/app/plugin/atlasLeaves.ts`, append:

```ts
/** The active view of one of this vault's maps; null for none, or for the online scene, which shows another Atlas's. */
export function activeMapView(app: App): AtlasView | null {
  const view = app.workspace.getActiveViewOfType(AtlasView);
  return view && !view.isRemote ? view : null;
}
```

(import `type App` from `obsidian` there if it is not imported yet).

In `src/app/plugin/registerCommands.ts`, in the `toggle-initiative-tracker`, `toggle-loot-roller` and `clean-up-missing-assets` commands, replace `const view = app.workspace.getActiveViewOfType(AtlasView);` with `const view = activeMapView(app);`, importing `activeMapView` from `./atlasLeaves`. Leave `toggle-dice-log` as it is: the online scene has a dice log.

In `src/app/plugin/statusBarVisibility.ts`, import `ONLINE_SCENE_VIEW_TYPE` from `../online/obsidian/onlineSceneTab` and add it to `FULL_BLEED_VIEW_TYPES`.

- [ ] **Step 14: Write the view and register it**

Create `src/app/online/obsidian/OnlineSceneView.ts`:

```ts
/**
 * The Online scene tab: an Atlas map view of a session this Atlas joined, drawn by Atlas's own
 * renderer from a remote store, the way `PlayerView` is a map view with a player store. It never
 * opens a file. Closing it leaves the session. A tab Obsidian restores at startup has no session
 * and closes itself once the layout is ready.
 */
import type { WorkspaceLeaf } from 'obsidian';
import { Sprite } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type AtlasVTTPlugin from '../../../../main';
import { AtlasView } from '../../atlas-view';
import { placeholderTexture } from '../../MapLoader';
import { PlayerInitiativePanel } from '../../services/PlayerInitiativePanel';
import type { PlayerSettingsSource } from '../../services/PlayerSceneOverlay';
import { OnlineJoinService } from './OnlineJoinService';
import { OnlineSceneClient } from './OnlineSceneClient';
import { ONLINE_SCENE_TITLE, ONLINE_SCENE_VIEW_TYPE } from './onlineSceneTab';
import type { OnlineSceneControls } from './remoteScene';
import { RemoteMapBackdrop } from './RemoteMapBackdrop';
import type { FollowViewport } from './ViewportFollower';

/** The GM's player view rules were applied before sending: show everything that arrives. */
const SHOW_WHAT_ARRIVES: PlayerSettingsSource = {
  getLocalPlayerViewSettings: () => ({
    showToolbar: true, showTokenHP: true, showTokenStress: true, showTokenNameplates: true, showNotePreviews: false,
    showGrid: true, showWidgets: true, showInitiative: true, showDiceRolls: false, showCommandPalette: false,
  }),
  onChange: () => () => undefined,
};

function followViewport(viewport: Viewport): FollowViewport {
  return {
    get screenWidth(): number { return viewport.screenWidth; },
    get screenHeight(): number { return viewport.screenHeight; },
    get center(): { x: number; y: number } { return viewport.center; },
    get scale(): { x: number } { return viewport.scale; },
    setZoom: (scale) => viewport.setZoom(scale),
    moveCenter: (x, y) => viewport.moveCenter(x, y),
    on: (event, listener) => viewport.on(event, listener),
    off: (event, listener) => viewport.off(event, listener),
  };
}

/** Atlas's transparent placeholder at the map's size. */
function placeholderSprite(width: number, height: number, cellSize: number): Sprite {
  const sprite = new Sprite(placeholderTexture(cellSize));
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

export class OnlineSceneView extends AtlasView {
  private client: OnlineSceneClient | null = null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin) {
    super(leaf, plugin, true, true);
  }

  getViewType(): string {
    return ONLINE_SCENE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return ONLINE_SCENE_TITLE;
  }

  getIcon(): string {
    return 'network';
  }

  /** A session never survives a restart, so the workspace keeps nothing of it. */
  getState(): { mapFilePath: null } {
    return { mapFilePath: null };
  }

  async setState(): Promise<void> {
    // Nothing to restore: `onOpen` attaches to the session this Atlas joined.
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    if (this.isClosed) return;
    this.containerEl.addClass('atlas-online-scene');
    this.app.workspace.onLayoutReady(() => this.attachSession());
  }

  async onClose(): Promise<void> {
    this.client?.dispose();
    this.client = null;
    // Closing the tab leaves the session.
    OnlineJoinService.forApp(this.app)?.leave();
    await super.onClose();
  }

  public onlineControls(): OnlineSceneControls | null {
    return this.client?.controls ?? null;
  }

  protected onContainerResized(): void {
    this.client?.resize();
  }

  private attachSession(): void {
    if (this.isClosed || this.client) return;
    const service = OnlineJoinService.forApp(this.app);
    const viewport = this.serviceManager.getRendererService().getViewport();
    const renderer = this.renderer;
    if (!service || !viewport || !renderer) {
      this.leaf.detach();
      return;
    }
    const client = new OnlineSceneClient({
      store: this.atlasStore,
      service,
      viewport: followViewport(viewport),
      backdrop: new RemoteMapBackdrop(renderer, placeholderSprite),
      initiative: new PlayerInitiativePanel(this.app, SHOW_WHAT_ARRIVES),
      parent: this.containerEl,
      eventBus: this.serviceManager.getEventBus(),
      laserHub: renderer.getLaserHub(),
      closeTab: () => this.leaf.detach(),
    });
    if (!client.attach()) {
      client.dispose();
      this.leaf.detach();
      return;
    }
    this.client = client;
  }
}
```

In `main.ts`, import `OnlineSceneView` from `./src/app/online/obsidian/OnlineSceneView` and `ONLINE_SCENE_VIEW_TYPE` from `./src/app/online/obsidian/onlineSceneTab`. In `registerAtlasViews`, after the `PLAYER_VIEW_TYPE` line, add:

```ts
    this.registerView(ONLINE_SCENE_VIEW_TYPE, (leaf) => new OnlineSceneView(leaf, this));
```

- [ ] **Step 15: Run the task's tests and the neighbours**

Run: `npx vitest run tests/unit/online/ tests/unit/viewConditionDefinitions.test.ts tests/unit/activeMapView.test.ts tests/unit/backgroundTextureCache.test.ts tests/unit/mainToolbar.text-tool.test.tsx tests/unit/atlasView.closeTab.test.ts tests/unit/atlasView.onClose.test.ts tests/unit/atlasView.sceneFilesOnly.test.ts tests/unit/notePreviewUIManager.pinnedPreviews.test.ts tests/integration/pixi/TokenRenderer.test.ts`
Expected: PASS.

- [ ] **Step 16: Run the full check and build**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:ci`
Expected: no errors; all tests pass; the build writes `dist/` (never run `npm run build`).

- [ ] **Step 17: Commit**

```bash
git add src/app/online/view/CameraController.ts src/app/online/obsidian/ViewportFollower.ts src/app/grid/gridStateOptions.ts src/app/react/BackgroundSprite.tsx src/app/pixi/backgroundTextureCache.ts src/app/MapLoader.ts src/app/online/obsidian/RemoteMapBackdrop.ts src/app/online/obsidian/onlineSceneStatus.ts src/app/online/obsidian/onlineDice.ts src/app/online/obsidian/OnlineSceneClient.ts src/app/online/obsidian/OnlineSceneView.ts src/app/pixi/token-renderer/viewConditionDefinitions.ts src/app/pixi/TokenRenderer.ts src/app/services/PlayerSceneOverlay.ts src/app/services/PlayerInitiativePanel.ts src/app/services/ServiceManager.ts src/app/atlas-view.ts src/app/react/components/online/OnlineSceneBar.tsx src/app/react/components/online/onlineSceneToolbarItems.tsx src/app/react/components/online/online-scene.scss src/app/react/UIRoot.tsx src/app/packages/components/MainToolbar.tsx styles/main.scss src/app/plugin/atlasLeaves.ts src/app/plugin/registerCommands.ts src/app/plugin/statusBarVisibility.ts main.ts tests/unit/online/cameraController.test.ts tests/unit/online/obsidian/viewportFollower.test.ts tests/unit/online/obsidian/remoteMapBackdrop.test.ts tests/unit/online/obsidian/onlineSceneStatus.test.ts tests/unit/online/obsidian/onlineSceneFixtures.ts tests/unit/online/obsidian/onlineSceneClient.test.ts tests/unit/online/obsidian/onlineSceneToolbar.test.tsx tests/unit/viewConditionDefinitions.test.ts tests/unit/activeMapView.test.ts tests/unit/backgroundTextureCache.test.ts
git commit -m "feat(online): the Online scene view drawn by Atlas's renderer"
```

---

### Task 4: Player tools in the Online scene

The player uses Atlas's own tools:
- **Drag:** Atlas's token drag and drag ruler, only for the tokens the GM gave them and only while admitted. Each drop goes out once as a `token-move` and waits for the GM's answer; a refusal snaps back with "Move not allowed.".
- **Measure:** the ruler and the measure tool use the GM's measurement settings.
- **Laser:** Atlas's laser is sent in the player's laser colour.
- **Dice:** the dice tray and the dice log's "Roll again" send `dice-roll`. The log shows only the shared log, and nothing dispatches Atlas's document-wide dice event.

**Files:**
- Create: `src/app/online/obsidian/remoteTokenMoves.ts`
- Modify: `src/app/pixi/token-renderer/InteractionController.ts` (the drag gate, one token at a time, the drop event)
- Modify: `src/app/services/mapMeasurementSettings.ts` (the online scene's measurement)
- Create: `src/app/online/obsidian/OnlineLaserLink.ts`
- Modify: `src/app/online/obsidian/onlineDice.ts` (`rollOfResult`, `traySelection`)
- Modify: `src/app/online/obsidian/OnlineSceneClient.ts`, `src/app/online/obsidian/OnlineSceneView.ts`
- Modify: `src/app/react/components/dice/DiceDropdownMenu.tsx`, `src/app/react/components/dice-log/DiceRollLog.tsx`, `src/app/react/components/dice-log/useDiceHistory.ts`, `src/app/packages/components/MainToolbar.tsx`
- Modify: `tests/unit/online/obsidian/onlineSceneFixtures.ts` (the laser colour)
- Test: `tests/unit/online/obsidian/onlinePlayerDrag.test.ts`, `tests/unit/online/obsidian/onlinePlayerTools.test.ts`, `tests/unit/online/obsidian/onlineLaserLink.test.ts`, `tests/unit/online/obsidian/onlineDiceUi.test.tsx`, `tests/unit/mapMeasurementSettings.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `RemoteSceneApplier({ positionOf })`, `updateRemoteScene`, `RemoteSceneState.movableTokenIds` / `.status.tone` / `.measurement`.
  - Task 3: `OnlineSceneClient`, `onlineSceneSetup`, `diceLogResults`.
  - Existing: `CONFIRM_TIMEOUT_MS`, `REFUSED_NOTICE_MS`, `MOVE_REFUSED_TEXT` (`src/app/online/view/TokenMoves.ts`), `LaserBatcher`, `LaserHub.onLocal`, `isLaserColor`, `isDieType`, `isDiceModifier`, `DICE_LIMITS`.
- Produces:
  - `ONLINE_TOKEN_DROPPED = 'online-token-dropped'`, `TokenDrop`, `mayMoveAsOnlinePlayer(state, tokenId)`.
  - `RemoteTokenMoves` (`positionOf`, `setScene`, `drop`, `refused`, `dispose`).
  - `OnlineLaserLink`.
  - `rollOfResult(result)`, `traySelection(selection)`.
  - `OnlineSceneClientOptions.laserColor(): string`.
  - `DiceDropdownMenuProps.onRoll?` and `.showToasts?`, `useDiceHistory(getDiceTool, storeActions?, options?: { listen?: boolean })`.

- [ ] **Step 1: Write the failing drag tests**

Create `tests/unit/online/obsidian/onlinePlayerDrag.test.ts`:

```ts
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene, type RemoteSceneState } from '../../../../src/app/online/obsidian/remoteScene';
import { mayMoveAsOnlinePlayer, ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { InteractionController } from '../../../../src/app/pixi/token-renderer/InteractionController';

const connected = (movable: string[]): RemoteSceneState => ({
  ...initialRemoteScene(), movableTokenIds: movable, status: { ...initialRemoteScene().status, tone: 'connected' },
});

function makeController(options: { player: boolean; remoteScene: RemoteSceneState | null; selectedIds?: string[] }) {
  const setSelection = vi.fn();
  const viewport = {
    on: vi.fn(), off: vi.fn(),
    toWorld: vi.fn((point: { x: number; y: number }) => point),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  } as any;
  const state = {
    activeTool: 'move', selectedIds: options.selectedIds ?? [], setSelection, setIsDragging: vi.fn(),
    setTokenPositions: vi.fn(), moveToken: vi.fn(), grid: { snapToGrid: false },
    objects: { tokens: { a: { id: 'a', x: 35, y: 35 }, b: { id: 'b', x: 105, y: 35 } } },
    remoteScene: options.remoteScene,
  };
  const store = { getState: () => state } as any;
  const eventBus = new EventEmitter();
  const controller = new InteractionController(viewport, store, {} as any, eventBus, {} as any, options.player);
  const sprites: Record<string, { position: { x: number; y: number; set: ReturnType<typeof vi.fn> } }> = {
    a: { position: { x: 35, y: 35, set: vi.fn() } },
    b: { position: { x: 105, y: 35, set: vi.fn() } },
  };
  controller.setTokenSpriteProvider((id) => (sprites[id] ?? null) as any);
  const drops: unknown[] = [];
  eventBus.on(ONLINE_TOKEN_DROPPED, (drop) => drops.push(drop));
  const press = (tokenId: string, extra: Record<string, unknown> = {}): void => controller.handleViewportTokenPointerDown(tokenId, {
    button: 0, shiftKey: false, altKey: false, global: { x: sprites[tokenId]!.position.x, y: sprites[tokenId]!.position.y }, stopPropagation: vi.fn(), ...extra,
  } as any);
  const dragTo = (x: number, y: number): void => {
    const onMove = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    const onUp = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointerup')[1];
    onMove({ global: { x, y } });
    onUp({ global: { x, y } });
  };
  return { controller, viewport, setSelection, drops, press, dragTo, state };
}

describe('mayMoveAsOnlinePlayer', () => {
  it('allows a token the GM gave this player, only while admitted, and never outside the online scene', () => {
    expect(mayMoveAsOnlinePlayer({ remoteScene: connected(['a']) }, 'a')).toBe(true);
    expect(mayMoveAsOnlinePlayer({ remoteScene: connected(['a']) }, 'b')).toBe(false);
    expect(mayMoveAsOnlinePlayer({ remoteScene: { ...connected(['a']), status: { ...connected([]).status, tone: 'pending' } } }, 'a')).toBe(false);
    expect(mayMoveAsOnlinePlayer({ remoteScene: null }, 'a')).toBe(false);
  });
});

describe('dragging in the online scene', () => {
  it('drags only a token the GM gave this player', () => {
    const t = makeController({ player: true, remoteScene: connected(['a']) });
    t.press('b');
    expect(t.viewport.plugins.pause).not.toHaveBeenCalled();
    t.press('a');
    expect(t.viewport.plugins.pause).toHaveBeenCalledWith('drag');
    expect(t.controller.isDraggingTokens()).toBe(true);
  });

  it('drags one token at a time: no Shift groups, no Alt copies', () => {
    const t = makeController({ player: true, remoteScene: connected(['a', 'b']), selectedIds: ['a', 'b'] });
    t.press('a', { shiftKey: true, altKey: true });
    expect(t.setSelection).toHaveBeenCalledWith(['a']);
    t.dragTo(175, 105);
    expect(t.drops).toEqual([{ id: 'a', x: 175, y: 105 }]);
  });

  it('sends each drop to the view once, where it was dropped', () => {
    const t = makeController({ player: true, remoteScene: connected(['a']) });
    t.press('a');
    t.dragTo(245, 175);
    expect(t.drops).toEqual([{ id: 'a', x: 245, y: 175 }]);
  });

  it('drags nothing while not admitted, and nothing in the local player window', () => {
    const waiting = makeController({ player: true, remoteScene: { ...connected(['a']), status: { ...connected([]).status, tone: 'ended' } } });
    waiting.press('a');
    expect(waiting.viewport.plugins.pause).not.toHaveBeenCalled();
    const local = makeController({ player: true, remoteScene: null });
    local.press('a');
    expect(local.viewport.plugins.pause).not.toHaveBeenCalled();
  });

  it('GM view: keeps group drags and sends no drop', () => {
    const t = makeController({ player: false, remoteScene: null, selectedIds: ['a', 'b'] });
    t.press('b');
    expect(t.setSelection).not.toHaveBeenCalled();
    t.dragTo(175, 105);
    expect(t.state.setTokenPositions).toHaveBeenLastCalledWith([{ id: 'a', x: 105, y: 105 }, { id: 'b', x: 175, y: 105 }]);
    expect(t.drops).toEqual([]);
  });
});
```

Create `tests/unit/mapMeasurementSettings.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { initialRemoteScene } from '../../src/app/online/obsidian/remoteScene';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';

const assets = {
  getCollectionForMap: vi.fn(() => 'c'),
  getCollectionSettings: vi.fn(() => ({ gridDefaults: { unitType: 'meters', unitDistance: 2, measurementMode: 'metric' } })),
};

describe('mapMeasurementSettings', () => {
  it("reads a map's collection, as before", () => {
    expect(mapMeasurementSettings(assets as never, { mapPath: 'a.atlasmap', grid: null, remoteScene: null })).toMatchObject({ unitType: 'meters', unitDistance: 2 });
  });

  it("measures the online scene with the GM's settings and reads no collection", () => {
    assets.getCollectionForMap.mockClear();
    const measurement = { mode: 'abstract' as const, unitType: 'feet' as const, unitDistance: 5, diagonalRule: 'euclidean' as const, rangeBands: [] };
    expect(mapMeasurementSettings(assets as never, { mapPath: null, grid: null, remoteScene: { ...initialRemoteScene(), measurement } })).toBe(measurement);
    expect(assets.getCollectionForMap).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/online/obsidian/onlinePlayerDrag.test.ts tests/unit/mapMeasurementSettings.test.ts`
Expected: FAIL with "Failed to resolve import ... remoteTokenMoves", and the measurement ignores `remoteScene`.

- [ ] **Step 3: Gate drags, send drops, measure like the GM**

Create `src/app/online/obsidian/remoteTokenMoves.ts`:

```ts
/**
 * The player's side of moving their own tokens in the Online scene, with Atlas's drag. It says
 * which tokens may be dragged, and holds a dropped token where it was dropped until the GM
 * answers. The answer is an update of that token, a refusal, or `CONFIRM_TIMEOUT_MS` passing.
 * After a refusal it shows "Move not allowed." for `REFUSED_NOTICE_MS`. The rules are the web
 * page's (`online/view/TokenMoves.ts`); Atlas's `InteractionController` does the hit test, the
 * drag and the ruler, and its store is the drag's preview.
 */
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { PlayerScene, PlayerToken, ScenePoint } from '../scene/sceneTypes';
import { CONFIRM_TIMEOUT_MS, MOVE_REFUSED_TEXT, REFUSED_NOTICE_MS } from '../view/TokenMoves';
import { updateRemoteScene } from './remoteScene';

/** What Atlas's `InteractionController` emits on the view's event bus when an online player drops a token. */
export const ONLINE_TOKEN_DROPPED = 'online-token-dropped';

export interface TokenDrop {
  id: string;
  x: number;
  y: number;
}

/** Whether this view lets the player drag `tokenId`: the online scene, admitted, a token the GM gave them. */
export function mayMoveAsOnlinePlayer(state: Pick<ViewAtlasState, 'remoteScene'>, tokenId: string): boolean {
  const remote = state.remoteScene;
  return remote !== null && remote.status.tone === 'connected' && remote.movableTokenIds.includes(tokenId);
}

interface Pending {
  position: ScenePoint;
  /** The token's record at the drop: a different record is the GM's answer. */
  token: PlayerToken | null;
  timer: number;
}

function tokenOf(scene: PlayerScene, tokenId: string): PlayerToken | null {
  return Object.hasOwn(scene.tokens, tokenId) ? scene.tokens[tokenId] ?? null : null;
}

export interface RemoteTokenMovesOptions {
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>;
  /** Sends one drop; false when it could not go. */
  send(tokenId: string, x: number, y: number): boolean;
  /** A position this view shows changed: write the scene again. */
  onChange(): void;
}

export class RemoteTokenMoves {
  private scene: PlayerScene | null = null;
  private readonly pending = new Map<string, Pending>();
  private noticeTimer: number | null = null;

  constructor(private readonly options: RemoteTokenMovesOptions) {}

  /** Where the view shows `tokenId` instead of the GM's position; null for the GM's. */
  positionOf(tokenId: string): ScenePoint | null {
    const state = this.options.store.getState();
    // Mid-drag, the token is where Atlas's drag put it in the store.
    if (state.isDragging && state.selectedIds.includes(tokenId)) {
      const token = state.objects.tokens[tokenId];
      if (token) return { x: token.x, y: token.y };
    }
    return this.pending.get(tokenId)?.position ?? null;
  }

  /** Call before the scene is written: an update of a dropped token is the GM's answer, a new scene drops every hold. */
  setScene(scene: PlayerScene | null): void {
    const previous = this.scene?.sceneId ?? null;
    this.scene = scene;
    if (!scene || scene.sceneId !== previous) {
      this.clearPending();
      return;
    }
    for (const [tokenId, entry] of [...this.pending]) if (tokenOf(scene, tokenId) !== entry.token) this.settle(tokenId);
  }

  /** Atlas dropped a token the player dragged: one `token-move`, and the token waits there for the GM. */
  drop({ id, x, y }: TokenDrop): void {
    const scene = this.scene;
    if (scene && mayMoveAsOnlinePlayer(this.options.store.getState(), id)) {
      this.settle(id);
      // Registered before sending: a refusal delivered at once must find it to settle.
      const timer = window.setTimeout(() => {
        this.settle(id);
        this.options.onChange();
      }, CONFIRM_TIMEOUT_MS);
      this.pending.set(id, { position: { x, y }, token: tokenOf(scene, id), timer });
      if (!this.options.send(id, x, y)) this.settle(id);
    }
    // A drop that did not go goes back to where the scene has the token.
    this.options.onChange();
  }

  /** The GM refused the move: the token goes back, and the notice shows for a while. */
  refused(tokenId: string): void {
    this.settle(tokenId);
    updateRemoteScene(this.options.store, { notice: MOVE_REFUSED_TEXT });
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null;
      updateRemoteScene(this.options.store, { notice: null });
    }, REFUSED_NOTICE_MS);
    this.options.onChange();
  }

  dispose(): void {
    this.clearPending();
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  private settle(tokenId: string): void {
    const entry = this.pending.get(tokenId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.pending.delete(tokenId);
  }

  private clearPending(): void {
    for (const tokenId of [...this.pending.keys()]) this.settle(tokenId);
  }
}
```

In `src/app/pixi/token-renderer/InteractionController.ts`:
1. Import `import { mayMoveAsOnlinePlayer, ONLINE_TOKEN_DROPPED } from '../../online/obsidian/remoteTokenMoves';`.
2. In `handleViewportTokenPointerDown`, replace

```ts
    if (this.isPlayerView) {
      return;
    }

    this.prepareInteraction(token, e);
```

with

```ts
    if (this.isPlayerView) {
      // An online player drags the tokens the GM gave them, one at a time; the local player window drags none.
      if (mayMoveAsOnlinePlayer(this.store.getState(), tokenId)) this.prepareInteraction(token, e, { single: true });
      return;
    }

    this.prepareInteraction(token, e);
```

3. Change `private prepareInteraction(token: TokenEntity, e: FederatedPointerEvent): void {` to:

```ts
  /** `single`: the online scene drags only the pressed token: no Shift groups, no Alt copies. */
  private prepareInteraction(token: TokenEntity, e: FederatedPointerEvent, options: { single?: boolean } = {}): void {
    const single = options.single === true;
```

and in its body:
   - change `if (e.shiftKey && isTokenSelected) {` to `if (!single && e.shiftKey && isTokenSelected) {`;
   - change `this.dragState.copyOnDrag = e.altKey;` to `this.dragState.copyOnDrag = !single && e.altKey;`;
   - change `if (e.shiftKey) {` (the group branch) to `if (!single && e.shiftKey) {`;
   - change `} else if (isTokenSelected && selectedIds.length > 1) {` to `} else if (!single && isTokenSelected && selectedIds.length > 1) {`.

4. In `onPointerUp`, right after the `if (tokenUpdates.length === 1) { … } else if (tokenUpdates.length > 1) { … }` block that writes the final positions, add:

```ts
      // The online scene sends each drop to the GM, who decides where the token stays.
      if (this.isPlayerView) for (const update of tokenUpdates) this.eventBus.emit(ONLINE_TOKEN_DROPPED, update);
```

In `src/app/services/mapMeasurementSettings.ts`, replace `mapMeasurementSettings` with:

```ts
/** Measurement settings for the map in `state`: its collection's, or, in the online scene, the GM's. */
export function mapMeasurementSettings(
  assetService: AssetService,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid' | 'remoteScene'>,
): MeasurementSettings {
  if (state.remoteScene) return state.remoteScene.measurement;
  return resolveMeasurementSettings(collectionGridDefaultsFor(assetService, state.mapPath) ?? undefined, state.grid);
}
```

Both callers (`TokenRenderer` for the drag ruler, `PixiRendererOrchestrator` for the measure tool) pass the whole store state, so they need no change.

- [ ] **Step 4: Run the drag tests**

Run: `npx vitest run tests/unit/online/obsidian/onlinePlayerDrag.test.ts tests/unit/mapMeasurementSettings.test.ts tests/unit/interactionController.shiftSelect.test.ts tests/unit/tokenContextMenuHide.test.ts tests/unit/online/controlledByContextMenu.test.ts`
Expected: PASS. The last three are the GM view's own tests and must stay green.

- [ ] **Step 5: Write the failing tool tests**

In `tests/unit/online/obsidian/onlineSceneFixtures.ts`, import `import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';`, add `laserColor?: string` to `OnlineSceneSetupOptions`, and pass the colour to the client by adding `laserColor: () => options.laserColor ?? LASER_PALETTE[0]!,` to its options object.

Create `tests/unit/online/obsidian/onlinePlayerTools.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { applyPatch } from '../../../../src/app/online/scene/sceneDiff';
import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';
import { CONFIRM_TIMEOUT_MS, REFUSED_NOTICE_MS } from '../../../../src/app/online/view/TokenMoves';
import { playerScene, playerToken } from '../sceneFixtures';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

/** An admitted player with t1 on the scene and theirs to move. */
function ready(options: Parameters<typeof onlineSceneSetup>[0] = {}) {
  const t = onlineSceneSetup(options);
  const scene = playerScene({ tokens: { t1: playerToken({ name: 'Hero' }), t2: playerToken({ x: 300 }) } });
  t.sink().session(admitted());
  t.sink().control(['t1']);
  t.sink().scene(scene);
  const token = (): { x: number; y: number } | undefined => t.store.getState().objects.tokens.t1;
  return { ...t, scene, token };
}

describe('player tools in the online scene', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one token-move per drop and keeps the token there until the GM answers', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    expect(t.fake.sendTokenMove).toHaveBeenCalledOnce();
    expect(t.fake.sendTokenMove).toHaveBeenCalledWith('t1', 210, 140);
    expect(t.token()).toMatchObject({ x: 210, y: 140 });
    // A patch about another token is no answer.
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t2: playerToken({ x: 370 }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 210, y: 140 });
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS);
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
  });

  it("takes the GM's answer: the token where the GM's scene puts it", () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t1: playerToken({ name: 'Hero', x: 245, y: 175 }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 245, y: 175 });
  });

  it('snaps a refused move back and says so for three seconds', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.sink().moveRefused('t1');
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
    expect(t.store.getState().remoteScene?.notice).toBe('Move not allowed.');
    vi.advanceTimersByTime(REFUSED_NOTICE_MS);
    expect(t.store.getState().remoteScene?.notice).toBeNull();
  });

  it('sends nothing for a token the GM did not give, nor once the session is over', () => {
    const t = ready();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't2', x: 210, y: 140 });
    t.sink().session({ ...admitted(), status: 'lost', reason: 'ended' });
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    expect(t.fake.sendTokenMove).not.toHaveBeenCalled();
    expect(t.token()).toMatchObject({ x: 100, y: 100 });
  });

  it("keeps a dragged token under the pointer through the GM's patches", () => {
    const t = ready();
    t.store.setState({ isDragging: true, selectedIds: ['t1'] });
    t.store.getState().setTokenPositions([{ id: 't1', x: 400, y: 400 }]);
    t.sink().scene(applyPatch(t.scene, { set: {}, upsert: { tokens: { t1: playerToken({ name: 'Hero', hp: { current: 1, max: 9 } }) } }, remove: {} }));
    expect(t.token()).toMatchObject({ x: 400, y: 400 });
  });

  it("sends the player's laser in their Atlas colour", () => {
    const t = ready({ laserColor: LASER_PALETTE[2] });
    t.hub.emitLocal({ kind: 'point', x: 12, y: 34 });
    expect(t.fake.sendLaser).toHaveBeenLastCalledWith([{ x: 12, y: 34 }], false, [0], LASER_PALETTE[2]);
  });

  it('stops sending drops and lasers once disposed', () => {
    const t = ready();
    t.client.dispose();
    t.eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 't1', x: 210, y: 140 });
    t.hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(t.fake.sendTokenMove).not.toHaveBeenCalled();
    expect(t.fake.sendLaser).not.toHaveBeenCalled();
    expect(t.eventBus.listenerCount(ONLINE_TOKEN_DROPPED)).toBe(0);
  });
});
```

Create `tests/unit/online/obsidian/onlineLaserLink.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineLaserLink } from '../../../../src/app/online/obsidian/OnlineLaserLink';
import { LASER_INTERVAL_MS } from '../../../../src/app/online/tools/LaserBatcher';
import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';
import { LaserHub } from '../../../../src/app/pixi/laser/LaserHub';

describe('OnlineLaserLink', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("sends Atlas's laser in batches and lets it go, in the player's colour", () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    const link = new OnlineLaserLink({ hub, send, color: () => LASER_PALETTE[1]!, clock: () => 0 });
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).toHaveBeenLastCalledWith([{ x: 1, y: 1 }], false, [0], LASER_PALETTE[1]);
    hub.emitLocal({ kind: 'lift' });
    vi.advanceTimersByTime(LASER_INTERVAL_MS + 1);
    expect(send).toHaveBeenLastCalledWith([], true, [], LASER_PALETTE[1]);
    link.dispose();
  });

  it('sends no colour that is not #rrggbb, so the GM gives one', () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    const link = new OnlineLaserLink({ hub, send, color: () => 'rebeccapurple', clock: () => 0 });
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).toHaveBeenLastCalledWith([{ x: 1, y: 1 }], false, [0], undefined);
    link.dispose();
  });

  it('stops listening once disposed', () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    new OnlineLaserLink({ hub, send, color: () => LASER_PALETTE[0]! }).dispose();
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
```

Create `tests/unit/online/obsidian/onlineDiceUi.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const { ui } = vi.hoisted(() => ({ ui: { view: null as unknown } }));
vi.mock('../../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));
vi.mock('../../../../src/app/react/components/dice/DiceToastContainer', () => ({ DiceToastContainer: () => <div>toasts</div> }));

import { diceLogResults, rollOfResult, traySelection } from '../../../../src/app/online/obsidian/onlineDice';
import { initialRemoteScene } from '../../../../src/app/online/obsidian/remoteScene';
import { DiceDropdownMenu } from '../../../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceRollLog } from '../../../../src/app/react/components/dice-log/DiceRollLog';
import { ViewStoreProvider } from '../../../../src/app/react/ViewStoreContext';
import { DICE_ROLLED_EVENT, rollFormula, type DiceRollResult } from '../../../../src/app/tools/diceRolling';
import { admitted, onlineSceneSetup } from './onlineSceneFixtures';

const ENTRY = { id: 'r1', name: 'Anna', formula: '2d6+1', dice: [{ die: 'd6', value: 4 }, { die: 'd6', value: 2 }], modifier: 1, total: 7, at: 1000 };

afterEach(() => {
  cleanup();
  ui.view = null;
});

describe('rolling again and from the tray', () => {
  it("rolls a logged roll's dice and modifier again, when the tray can", () => {
    expect(rollOfResult(diceLogResults([ENTRY])[0]!)).toEqual({ dice: { d6: 2 }, modifier: 1 });
    expect(rollOfResult({ ...diceLogResults([ENTRY])[0]!, rolls: [{ die: 'd7', value: 1, max: 7 }] })).toBeNull();
    const many: DiceRollResult = { ...diceLogResults([ENTRY])[0]!, rolls: Array.from({ length: 21 }, () => ({ die: 'd6', value: 1, max: 6 })) };
    expect(rollOfResult(many)).toBeNull();
    expect(traySelection({ d6: 2, d20: 0, x: 3 })).toEqual({ d6: 2 });
  });

  it('sends the picked dice instead of rolling them, and shows no toasts', () => {
    const rollDice = vi.fn();
    const onRoll = vi.fn();
    render(<DiceDropdownMenu diceTool={{ rollDice } as never} isOpen onToggle={() => {}} onRoll={onRoll} showToasts={false} />);
    fireEvent.click(document.querySelectorAll('.atlas-dice-btn')[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Roll/ }));
    expect(onRoll).toHaveBeenCalledWith({ d6: 1 });
    expect(rollDice).not.toHaveBeenCalled();
    expect(screen.queryByText('toasts')).toBeNull();
  });
});

describe("the online scene's dice log", () => {
  function renderLog() {
    const controls = { followGm: vi.fn(), fitMap: vi.fn(), reconnect: vi.fn(), rollDice: vi.fn(() => true) };
    ui.view = { onlineControls: () => controls };
    const store = create(() => ({
      diceLog: diceLogResults([ENTRY]), addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn(), remoteScene: initialRemoteScene(),
    }));
    render(<ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => {}} /></ViewStoreProvider>);
    return { controls, store };
  }

  it('shows the shared log, rolls an entry again through the GM, and offers no clearing', () => {
    const { controls } = renderLog();
    expect(screen.getByText('2d6+1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    expect(controls.rollDice).toHaveBeenCalledWith({ d6: 2 }, 1);
  });

  it("does not take the player's own rolls from their other maps", () => {
    const { store } = renderLog();
    document.dispatchEvent(new CustomEvent(DICE_ROLLED_EVENT, { detail: rollFormula('d4') }));
    expect(screen.queryByText('d4')).toBeNull();
    expect(store.getState().addDiceLogEntry).not.toHaveBeenCalled();
  });

  it("dispatches no dice event: the player's own maps never record the shared log", () => {
    const heard = vi.fn();
    document.addEventListener(DICE_ROLLED_EVENT, heard);
    const t = onlineSceneSetup();
    t.sink().session(admitted());
    t.sink().diceLog([ENTRY]);
    t.client.controls.rollDice({ d20: 1 }, 0);
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    document.removeEventListener(DICE_ROLLED_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/unit/online/obsidian/onlinePlayerTools.test.ts tests/unit/online/obsidian/onlineLaserLink.test.ts tests/unit/online/obsidian/onlineDiceUi.test.tsx`
Expected: FAIL. `OnlineLaserLink` and `rollOfResult` do not resolve, drops are not sent, and the dice tray still rolls with `diceTool`.

- [ ] **Step 6: Write the laser link and the dice helpers**

Create `src/app/online/obsidian/OnlineLaserLink.ts`:

```ts
/**
 * Sends the player's own laser. Atlas's laser in the online scene emits its points on the view's
 * `LaserHub`, and the shared `LaserBatcher` sends them in the join page's batches, in the
 * player's Atlas laser colour. A colour that is not `#rrggbb` is left out; the GM then gives
 * one, and relays only Atlas's swatches anyway.
 */
import type { LaserHub } from '../../pixi/laser/LaserHub';
import type { ScenePoint } from '../scene/sceneTypes';
import { LaserBatcher } from '../tools/LaserBatcher';
import { isLaserColor } from '../tools/toolMessages';

export interface OnlineLaserLinkOptions {
  hub: Pick<LaserHub, 'onLocal'>;
  send(points: ScenePoint[], lifted: boolean, dt: number[], color?: string): boolean;
  /** The player's Atlas laser colour, read for every batch. */
  color(): string;
  /** Tests pass their own clock. */
  clock?: () => number;
}

export class OnlineLaserLink {
  private readonly batcher: LaserBatcher;
  private readonly stopListening: () => void;

  constructor(options: OnlineLaserLinkOptions) {
    this.batcher = new LaserBatcher((points, lifted, dt) => {
      const color = options.color();
      options.send(points, lifted, dt, isLaserColor(color) ? color : undefined);
    }, options.clock);
    this.stopListening = options.hub.onLocal((event) => {
      if (event.kind === 'point') this.batcher.point({ x: event.x, y: event.y });
      else this.batcher.lift();
    });
  }

  dispose(): void {
    this.stopListening();
    this.batcher.dispose();
  }
}
```

Append to `src/app/online/obsidian/onlineDice.ts` (and add `isDieType, type DiceSelection` to its import from `../../tools/diceRolling`, plus `import { DICE_LIMITS, isDiceModifier } from '../tools/toolMessages';` beside the type import):

```ts
/** The dice and modifier a logged roll used, to send it again; null when the tray cannot roll it (another die, too many dice). */
export function rollOfResult(result: DiceRollResult): { dice: DiceSelection; modifier: number } | null {
  const dice: DiceSelection = {};
  for (const roll of result.rolls) {
    if (!isDieType(roll.die)) return null;
    dice[roll.die] = (dice[roll.die] ?? 0) + 1;
  }
  const count = result.rolls.length;
  if (count === 0 || count > DICE_LIMITS.dicePerRoll || !isDiceModifier(result.modifiers)) return null;
  return { dice, modifier: result.modifiers };
}

/** The tray's picks as a roll's dice: Atlas's tray dice with a count above zero. */
export function traySelection(selection: Readonly<Record<string, number>>): DiceSelection {
  const dice: DiceSelection = {};
  for (const [die, count] of Object.entries(selection)) if (isDieType(die) && count > 0) dice[die] = count;
  return dice;
}
```

- [ ] **Step 7: Wire drops, refusals and the laser into the client**

In `src/app/online/obsidian/OnlineSceneClient.ts`:
1. Add the imports:

```ts
import { OnlineLaserLink } from './OnlineLaserLink';
import { ONLINE_TOKEN_DROPPED, RemoteTokenMoves, type TokenDrop } from './remoteTokenMoves';
```

2. Change `laserHub: Pick<LaserHub, 'showRemote'>;` to `laserHub: Pick<LaserHub, 'showRemote' | 'onLocal'>;`, and add to `OnlineSceneClientOptions`:

```ts
  /** The player's Atlas laser colour, read for every batch sent. */
  laserColor(): string;
```

3. Add the fields `private readonly moves: RemoteTokenMoves;` and `private readonly laserLink: OnlineLaserLink;`.
4. In the constructor, replace `this.applier = new RemoteSceneApplier({ store, images: options.service.images });` with:

```ts
    this.moves = new RemoteTokenMoves({
      store,
      send: (tokenId, x, y) => options.service.sendTokenMove(tokenId, x, y),
      onChange: () => this.applier.refresh(),
    });
    this.applier = new RemoteSceneApplier({ store, images: options.service.images, positionOf: (tokenId) => this.moves.positionOf(tokenId) });
    this.laserLink = new OnlineLaserLink({
      hub: options.laserHub,
      send: (points, lifted, dt, color) => options.service.sendLaser(points, lifted, dt, color),
      color: options.laserColor,
    });
```

and after `options.eventBus.on('background-sprite-updated', this.onBackgroundMoved);` add `options.eventBus.on(ONLINE_TOKEN_DROPPED, this.onDrop);`.
5. In `scene()`, add `this.moves.setScene(scene);` before `this.applier.apply(scene);`.
6. Replace the whole `moveRefused` method (its comment included) with:

```ts
  moveRefused(tokenId: string): void {
    this.moves.refused(tokenId);
  }
```

7. In `dispose()`, after `this.options.eventBus.off('background-sprite-updated', this.onBackgroundMoved);` add:

```ts
    this.options.eventBus.off(ONLINE_TOKEN_DROPPED, this.onDrop);
    this.laserLink.dispose();
    this.moves.dispose();
```

8. Add beside `onBackgroundMoved`:

```ts
  private readonly onDrop = (drop: TokenDrop): void => {
    if (!this.disposed) this.moves.drop(drop);
  };
```

9. Update the class doc comment's last line to: `initiative panel and the status bar, sends the player's token drops and laser, draws other people's lasers through Atlas's laser hub, and answers the view's controls.`

In `src/app/online/obsidian/OnlineSceneView.ts`, add to the `OnlineSceneClient` options in `attachSession`:

```ts
      laserColor: () => this.serviceManager.getSettingsService().getLaserPointerSettings().color,
```

- [ ] **Step 8: Send rolls from Atlas's dice tray and dice log**

In `src/app/react/components/dice/DiceDropdownMenu.tsx`:
1. Add to `DiceDropdownMenuProps`:

```ts
  /** Rolls the picks elsewhere instead of with `diceTool`: the online scene sends them to the GM. */
  onRoll?: (selection: Readonly<Record<string, number>>) => void;
  /** Atlas's dice toasts follow the document-wide dice event; the online scene shows none. */
  showToasts?: boolean;
```

2. Destructure them: `export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef, onRoll, showToasts = true }: DiceDropdownMenuProps): React.ReactElement {`.
3. In `handleRoll`, replace `diceTool.rollDice(formula);` with `if (onRoll) onRoll(selection);` on one line and `else diceTool.rollDice(formula);` on the next, and add `onRoll` to its dependency list.
4. Replace `<DiceToastContainer />` with `{showToasts && <DiceToastContainer />}`.

In `src/app/packages/components/MainToolbar.tsx`:
1. Import `import { traySelection } from "../../online/obsidian/onlineDice"`.
2. Give the dice tray its online behaviour:

```tsx
          {diceTool && (
            <DiceDropdownMenu
              diceTool={diceTool}
              isOpen={isDiceTrayOpen}
              onToggle={toggleDiceTray}
              triggerRef={diceButtonRef}
              {...(remote ? { onRoll: (selection: Readonly<Record<string, number>>) => { view?.onlineControls()?.rollDice(traySelection(selection), 0) }, showToasts: false } : {})}
            />
          )}
```

In `src/app/react/components/dice-log/useDiceHistory.ts`:
1. Add a third parameter: `options: { listen?: boolean } = {},` after `storeActions?`, with the doc line `@param options.listen - false: show only the store's log (the online scene's shared log), never the document-wide dice event`. Add `const listen = options.listen !== false;` at the top of the body.
2. In the effect that listens for rolls, add `if (!listen) return;` as its first statement, and change its dependency list from `[storeActions]` to `[storeActions, listen]`.

In `src/app/react/components/dice-log/DiceRollLog.tsx`:
1. Import `import { rollOfResult } from '../../../online/obsidian/onlineDice';` and `import type { DiceRollResult } from '../../../tools/diceRolling';`.
2. After the store bindings, add `const remote = useAtlasStore(state => Boolean(state.remoteScene));`.
3. Change `useDiceHistory(getDiceTool, storeActions)` to `useDiceHistory(getDiceTool, storeActions, { listen: !remote })`.
4. Add after it:

```tsx
  // The online scene's log is the GM's shared log: rolling again asks the GM to roll.
  const repeat = useCallback((result: DiceRollResult): void => {
    if (!remote) {
      repeatRoll(result.formula, result.source);
      return;
    }
    const roll = rollOfResult(result);
    if (roll) view?.onlineControls()?.rollDice(roll.dice, roll.modifier);
  }, [remote, repeatRoll, view]);
```

5. Change `{history.length > 0 && (` (the clear button) to `{history.length > 0 && !remote && (`.
6. Change `onRepeat={() => repeatRoll(result.formula, result.source)}` to `onRepeat={() => repeat(result)}`.

- [ ] **Step 9: Run the tool tests**

Run: `npx vitest run tests/unit/online/obsidian/ tests/unit/mainToolbar.text-tool.test.tsx tests/unit/playerWindowDiceRolls.test.tsx`
Expected: PASS.

- [ ] **Step 10: Run the full check and build**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:ci`
Expected: no errors; all tests pass; the build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/app/online/obsidian/remoteTokenMoves.ts src/app/pixi/token-renderer/InteractionController.ts src/app/services/mapMeasurementSettings.ts src/app/online/obsidian/OnlineLaserLink.ts src/app/online/obsidian/onlineDice.ts src/app/online/obsidian/OnlineSceneClient.ts src/app/online/obsidian/OnlineSceneView.ts src/app/react/components/dice/DiceDropdownMenu.tsx src/app/react/components/dice-log/DiceRollLog.tsx src/app/react/components/dice-log/useDiceHistory.ts src/app/packages/components/MainToolbar.tsx tests/unit/online/obsidian/onlineSceneFixtures.ts tests/unit/online/obsidian/onlinePlayerDrag.test.ts tests/unit/online/obsidian/onlinePlayerTools.test.ts tests/unit/online/obsidian/onlineLaserLink.test.ts tests/unit/online/obsidian/onlineDiceUi.test.tsx tests/unit/mapMeasurementSettings.test.ts
git commit -m "feat(online): Atlas's tools for players in the Online scene"
```

---

### Task 5: End to end, documentation, full checks and the manual test

An end-to-end test runs the real GM side (session, scene broadcaster, token control, dice host, laser relay) over `MemoryTransport` against the real join service, client and remote store. An Obsidian player joins, receives the scene, moves a token, rolls dice and points a laser both ways, and the player's vault is never written. The guide for adding online features gains an "Obsidian players" section, and the README, the privacy notes and the changelog describe joining from Atlas. Every check runs. The user runs the manual test with two vaults on two machines.

Step 6 needs the user: only two Obsidian installs with the plugin loaded can run it. The implementer asks the controller to have the user run it and report.

**Files:**
- Test: `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts`
- Modify: `docs/online-play-features.md` (a new section 10), `README.md` (the "Online play (preview)" section), `PRIVACY.md` (the "Online play" and "Files outside the vault" sections), `changelog/Unreleased.md`

**Interfaces:**
- Consumes: everything Tasks 1–4 produce; `toolsWorld` (`tests/unit/online/toolsFixtures.ts`), `onlineSceneSetup` (Task 3), `nodeHash` (`tests/unit/online/assetFixtures.ts`).
- Produces: no code.

- [ ] **Step 1: Write the end-to-end test**

Create `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts`:

```ts
/**
 * An Obsidian player against the real GM side over `MemoryTransport`: the join service, the
 * Online scene client and its remote store, with the GM's session, scene broadcaster, token
 * control, dice host and laser relay (`toolsWorld`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { ImageDecoder } from '../../../../src/app/online/assets/AssetLoader';
import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import { OnlineJoinService } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { ONLINE_TOKEN_DROPPED } from '../../../../src/app/online/obsidian/remoteTokenMoves';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import { DICE_ROLLED_EVENT } from '../../../../src/app/tools/diceRolling';
import { nodeHash } from '../assetFixtures';
import { toolsWorld } from '../toolsFixtures';
import { onlineSceneSetup } from './onlineSceneFixtures';

type View = ReturnType<typeof onlineSceneSetup>;

function settings() {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS };
  return {
    getOnlineSettings: (): OnlineSettings => online,
    setOnlineSettings: (partial: Partial<OnlineSettings>): void => { online = { ...online, ...partial }; },
    onChange: (): (() => void) => () => {},
  };
}

/** The GM presents the tavern; Anna joins from Atlas, is let in, and her Online scene tab attaches. */
async function joinFromObsidian() {
  const w = toolsWorld();
  w.present();
  const opened: { view: View | null } = { view: null };
  const decode: ImageDecoder = async () => null;
  const service: OnlineJoinService = new OnlineJoinService({} as App, settings(), '0.5.0', {
    createClient: () => w.network.client(), openStore: async () => null, decode, hash: nodeHash, isHosting: () => false,
    openSceneTab: async () => {
      opened.view = onlineSceneSetup({ service, attach: false });
      opened.view.client.attach();
    },
  });
  expect(service.join('https://example.org/join/#id=gm', 'Anna')).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  const pending = w.gm.getPlayers().find((player) => player.status === 'pending');
  expect(pending).toMatchObject({ name: 'Anna', client: 'obsidian' });
  w.gm.allow(pending!.playerId);
  await vi.advanceTimersByTimeAsync(0);
  await w.tick();
  const view = (): View => {
    if (!opened.view) throw new Error('The Online scene tab did not open');
    return opened.view;
  };
  return { w, service, view, playerId: (): string => service.state?.playerId ?? '' };
}

describe('an Obsidian player end to end', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    joinedSessionStore.setState({ session: null });
    vi.useRealTimers();
  });

  it('joins, opens the tab, and sees the presented scene with nothing the GM hides', async () => {
    const { w, service, view } = await joinFromObsidian();
    const state = view().store.getState();
    expect(Object.keys(state.objects.tokens).sort()).toEqual(['ally', 'hero']);
    expect(state.objects.tokens.hero).toMatchObject({ kind: 'character', name: 'Hero', x: 140, y: 140, showNameplate: true });
    expect(Object.keys(state.objects.fog)).toEqual(['f1']);
    expect(JSON.stringify(state.objects)).not.toContain('art/');
    expect(state.remoteScene?.status).toMatchObject({ title: 'Vault', connection: 'Connected', message: null });
    service.dispose();
    w.finish();
  });

  it("moves a token the GM gave: one drop, the GM snaps it, and the player sees the GM's answer", async () => {
    const { w, service, view, playerId } = await joinFromObsidian();
    w.control.set('hero', playerId(), true);
    await w.tick();
    expect(view().store.getState().remoteScene?.movableTokenIds).toEqual(['hero']);
    view().eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 'hero', x: 300, y: 150 });
    await w.tick();
    expect(w.token('hero')).toMatchObject({ x: 315, y: 175 });
    expect(view().store.getState().objects.tokens.hero).toMatchObject({ x: 315, y: 175 });
    service.dispose();
    w.finish();
  });

  it("rolls through the GM, into the GM's dice log and the player's", async () => {
    const { w, service, view } = await joinFromObsidian();
    expect(view().client.controls.rollDice({ d20: 1 }, 2)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.feed.published.at(-1)).toMatchObject({ formula: 'd20+2', rolledBy: 'Anna', total: 13 });
    expect(view().store.getState().diceLog[0]).toMatchObject({ formula: 'd20+2', total: 13, rolledBy: 'Anna' });
    service.dispose();
    w.finish();
  });

  it("points Atlas's laser at the GM and sees the GM's", async () => {
    const { w, service, view, playerId } = await joinFromObsidian();
    view().hub.emitLocal({ kind: 'point', x: 40, y: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.shown.at(-1)).toMatchObject({ from: playerId(), points: [{ x: 40, y: 50 }], lifted: false });
    w.hub.emitLocal({ kind: 'point', x: 70, y: 80 });
    await vi.advanceTimersByTimeAsync(0);
    expect(view().showRemote).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'gm', points: [{ x: 70, y: 80 }] }));
    service.dispose();
    w.finish();
  });

  it("never writes the player's vault, dispatches no dice event, and leaves cleanly", async () => {
    const heard = vi.fn();
    document.addEventListener(DICE_ROLLED_EVENT, heard);
    const { w, service, view, playerId } = await joinFromObsidian();
    w.control.set('hero', playerId(), true);
    await w.tick();
    view().eventBus.emit(ONLINE_TOKEN_DROPPED, { id: 'hero', x: 300, y: 150 });
    view().client.controls.rollDice({ d6: 2 }, 0);
    view().hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    await w.tick();
    service.leave();
    await vi.advanceTimersByTimeAsync(0);
    document.removeEventListener(DICE_ROLLED_EVENT, heard);
    const { vault } = view();
    expect([...vault.files.keys()]).toEqual([]);
    expect([...vault.folders]).toEqual(['atlas-vtt']);
    for (const spy of [vault.app.vault.create, vault.app.vault.process, vault.app.vault.read, vault.app.vault.adapter.write, vault.app.vault.adapter.read]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(heard).not.toHaveBeenCalled();
    expect(view().closeTab).toHaveBeenCalledOnce();
    expect(w.gm.getPlayers().map((player) => player.status)).toEqual(['gone']);
    service.dispose();
    w.finish();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts`
Expected: PASS (5 tests). These are integration tests over code Tasks 1–4 already tested. A failure is a real seam bug: fix it in the module that owns it, with a unit test there, never in this test.

- [ ] **Step 3: Update the guide**

Append to `docs/online-play-features.md`:

````markdown
## 10. Obsidian players

Players can also join from Atlas in Obsidian (`src/app/online/obsidian/`). Their **Online scene** tab is an `AtlasView` on a remote store (`createViewAtlasStore(..., { remote: true })`), which never saves and keeps no undo history. It draws the scene with Atlas's own renderers, and the web page's shared modules feed it: `PlayerSession`, `PlayerSceneMirror`, `AssetLoader`, `CameraController` and `LaserBatcher`.

- **The converter.** `playerSceneToAtlasState` rebuilds Atlas records from what players receive, field by field (`convertTokens.ts`, `convertShapes.ts`, `convertPanels.ts`). A field recorded as `sent` in step 1 needs a mapping there, and a round-trip check in `tests/unit/online/obsidian/convertCoverage.test.ts`, which fails for a sent field without one. Never spread a received record into the store.
- **Writing the store.** `RemoteSceneApplier` keeps every Atlas record whose received record did not change, so Atlas's renderers redraw only what changed. It writes with `setState`, never with the store's actions: `setTokens` drops tokens with `blob:` images.
- **What the view adds.** The view store's `remoteScene` holds what Atlas's records cannot:
  - the tokens the player may drag;
  - the GM's measurement;
  - neutral condition badges;
  - the status bar;
  - whether the camera follows the GM.

  It is null in every other view. UI that differs in the online scene reads `Boolean(state.remoteScene)`, and reaches the view's actions through `AtlasView.onlineControls()`.
- **Images.** Each image is shown by two object URLs, one for the map and one for tokens (`objectUrlImages.ts`). Atlas's background cache and token cache each unload by URL, so they must never share one. A blob background is unloaded as soon as nobody shows it.
- **Tools.** The player's tools are Atlas's own:
  - `InteractionController` drags only the tokens `mayMoveAsOnlinePlayer` allows, one at a time, and emits `ONLINE_TOKEN_DROPPED`. `RemoteTokenMoves` sends the drop and holds the token until the GM answers.
  - The laser goes through the view's `LaserHub` and `OnlineLaserLink`.
  - The dice tray and the dice log's "Roll again" send `dice-roll` through `onlineControls().rollDice`.
  - A new tool for Obsidian players follows the same pattern: Atlas's tool, gated on `remoteScene`, sending through the join service.
- **Never the vault.** Nothing in the online scene reads or writes the vault or the settings. Only the Join dialog writes `online.playerName`, and the settings tab writes `online.keepImages`. Nothing in the online scene dispatches `atlas-dice-rolled`: every open map view records that event and saves it into its map file. `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts` checks both over `MemoryTransport`.
````

- [ ] **Step 4: Tell players and the GM**

In `README.md`, after the paragraph that starts "Players also have Atlas's table tools on the join page.", add:

```markdown
Players who use Obsidian with Atlas can join from Atlas instead of a browser: they run **Join online session…** (also on the online panel while they are not hosting), paste the same join link and enter a name. Once you let them in, an **Online scene** tab shows the presented scene drawn by Atlas, with Atlas's own tools: their tokens move with the drag ruler, and they get Measure, Laser and the dice tray, with the shared dice log in Atlas's dice log. They follow your view by default, and come back with **Follow GM** or see the whole map with **Fit map**. Closing the tab leaves the session. The session is never written into their vault. Atlas keeps the images outside the vault for the next session, unless they switch off **Keep online images on this device** in **Settings → Online play**. Your online panel marks players who joined from Obsidian with a gem. An Atlas joins one session at a time and does not host while it is in one.
```

In `PRIVACY.md`, after the paragraph that starts "With **Keep images on this device** on", add:

```markdown
When you join a session from Atlas (**Join online session…**), Atlas connects to the signaling and relay servers the join link names, the STUN server, and directly to the GM, only while the Online scene tab is open. The GM receives the name you enter, that you joined from Atlas, and the same things a web player sends. Nothing you receive is written into your vault: the scene is kept in memory only. With **Keep online images on this device** on (the default), the images are kept in Obsidian's browser storage on this device, outside the vault and shared by all vaults on the device, up to 500 MB. Switching it off deletes them. Atlas remembers the last name you joined with in its settings.
```

and in its "Files outside the vault" section, replace `Atlas VTT does not read or write files outside your vault.` with:

```markdown
Atlas VTT does not read or write files outside your vault. Images kept for online play when you join from Atlas are in Obsidian's browser storage, not in files (see [Online play](#online-play)).
```

In `changelog/Unreleased.md`, add to the end of the **Online Play (preview)** list under `## New`:

```markdown
- Play from Obsidian: players with Atlas run **Join online session…**, paste your join link and enter a name. Once you let them in, an **Online scene** tab shows the presented scene drawn by Atlas, with Atlas's own tools: drag their tokens with the drag ruler, measure, point the laser and roll from the dice tray into the shared dice log. They follow your view, with **Follow GM** and **Fit map**, and see why a session ended, with **Reconnect** after a lost connection. Nothing goes into their vault. Your online panel marks players who joined from Obsidian.
```

- [ ] **Step 5: Run every check and both builds**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:ci && npm run build:online`
Expected: no type errors, no lint errors or warnings, all tests pass, and both builds succeed. Never run `npm run build`: its `postbuild` copies into the user's vault.

Then check the bundle holds the new view and command:

Run: `grep -c "atlas-online-scene" dist/main.js && grep -c "Join online session" dist/main.js`
Expected: both counts are at least 1.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts docs/online-play-features.md README.md PRIVACY.md changelog/Unreleased.md
git commit -m "test(online): an Obsidian player end to end; docs for joining from Atlas"
```

- [ ] **Step 7: Manual test with two vaults on two machines (the user)**

The controller asks the user to install the branch's build (`npm run build:ci`, then copy `dist/` the way they normally load a test build) on two machines, each with its own vault, and to report each numbered result.

1. **GM machine:** open a scene with a map image, two character tokens and some fog, run **Online session…**, and **Start online session**, then **Copy link**.
2. **Player machine:** in the online panel (toolbar network button) check **Join online session…** is beside **Start online session**. Run **Join online session…** from the command palette. Paste the link, enter a name and press **Join**. The dialog shows "Waiting for the GM to let you in…".
3. **GM:** the join request appears. **Allow** it. The online panel lists the player with a gem mark whose tooltip reads "Joined from Obsidian".
4. **Player:** the dialog closes and an **Online scene** tab opens. Before the GM presents, the status bar shows "Waiting for the GM to show a scene."
5. **GM:** **Present to players**. **Player:** the map appears drawn by Atlas, with the grid, fog, tokens with rings, names and bars as the GM's player view settings allow, and the widget bar and initiative panel if open. No hidden token appears. The toolbar has only Move/Laser, Measure and Dice. There is no context menu on tokens. The status bar shows the GM's vault name and "Connected".
6. **GM:** pan and zoom. **Player:** the view glides with the GM's. Drag or scroll the player's map: **Follow GM** and **Fit map** appear in the toolbar. **Fit map** shows the whole map, Shift+1 does the same, and **Follow GM** returns to the GM's view and the buttons go.
7. **GM:** give the player a token under **Controlled by**. **Player:**
   - Drag it with the drag ruler showing the GM's units; Space adds a waypoint.
   - Release it: the token snaps where the GM's Atlas puts it, and the GM's view shows the move as one undo step.
   - Try to drag a token not given to the player: nothing moves.
   - **GM** removes control mid-drag; the player releases. The token goes back.
8. **Player:** Measure a line, a circle and a cone; the GM sees nothing. Point the laser: the GM sees it in the player's colour (a swatch) or their join-order colour. **GM** points the laser: the player sees it with Atlas's beam.
9. **Player:** roll 2d6 from the dice tray. The GM's dice log shows it under the player's name. The player's dice log (Enter) shows it, and the GM's own rolls appear there too; **Roll again** sends the same roll again; there is no clear button. The player's own map views (open one of their maps in another tab beforehand) show none of these rolls, and their map file is unchanged after closing it.
10. **Player:** check the vault in the file explorer: no new files or folders. Close the Online scene tab. The GM's panel shows the player disconnected. Join again with the same link: the GM must approve again only if the GM removed them; a reconnect within the session is let in without approval.
11. **GM:** **Stop online session**. **Player:** the tab keeps the last scene and the status bar says "The session ended.", with no Reconnect.
12. **Player:** join again, then disconnect the player's network for more than five minutes. The status bar shows "Reconnecting…" and then "Lost the connection to your GM." with **Reconnect**. Reconnect the network and press **Reconnect**: the player is back in without a new approval.
13. **Player:** start an online session of their own while joined: the panel shows "Leave the online session you joined before hosting one." **GM:** while hosting, run **Join online session…** with any link: the dialog shows "Stop hosting your online session before joining another."
14. **Player:** quit and reopen Obsidian with the Online scene tab open. The tab closes itself after the restart.
15. **Player:** switch off **Keep online images on this device** in **Settings → Online play**, join again, and check the images download again.

Wait for the user's report. Fix anything that fails in the task that owns the code, with a test, before the branch is finished.

---

## Self-review

**Spec coverage.**

| Spec | Where |
| --- | --- |
| Join online session…, command palette and the network button when not hosting | Task 2, Steps 13–14 (command, panel button) |
| Link parsed with `joinLink`, `PlayerSession` with `client: 'obsidian'` | Task 2, Steps 3–4, 10 |
| Name remembered in settings | Task 2, Steps 4, 10 |
| One session at a time; refused while hosting | Task 2, Steps 10, 14 |
| GM panel marks Obsidian players | Task 2, Steps 3, 14 |
| View type `atlas-online-scene`, new tab on admission, closing leaves | Task 2, Step 10 (`openOnlineSceneTab`); Task 3, Step 14 |
| Store via `storeFactory`, remote: no file, persistence, history, autosave, snapshots, vault-sync, collection or widget sync | Task 1, Steps 1–5; Task 3, Step 13 (`ServiceManager`) |
| Pure converter covering every sent field; patches become store updates | Task 1, Steps 6–14 |
| Images from `AssetLoader` with memory and IndexedDB per "keep images"; textures from decoded images; nothing to the vault | Task 2, Steps 4, 7–10; Task 3, Steps 5–8 |
| Camera follows the GM, breaks away, Follow GM and Fit map in toolbar style | Task 3, Steps 1–4, 12–13 |
| Read-only: GM tools hidden, context menus only what players may do | Task 3, Steps 12–13; Task 4, Step 3 |
| Slim status bar; session ended keeps the last scene | Task 3, Steps 9–10, 13 |
| Move with drag ruler for controlled tokens, one `token-move`, refusals snap back with "Move not allowed." | Task 4, Steps 1–7 |
| Measure private | Task 4, Step 3 (GM's measurement; nothing sent) |
| Laser in the player's colour, sent and received, Atlas's beam | Task 3, Step 10 (received); Task 4, Steps 5–7 (sent) |
| Dice tray to `dice-roll`, shared log in Atlas's dice log | Task 3, Step 10; Task 4, Steps 5–8 |
| Reconnect as the web page; give up after five minutes; **Reconnect** | Task 2, Step 10; Task 3, Steps 9–10 |
| Denied, kicked, full, version: the web texts | Task 2, Step 6 (`sessionReasonText`); Task 3, Step 10 |
| Tests: converter, remote store, dialog and links, one session, refuse while hosting, follow and break away, read-only tool set, end to end, manual | Tasks 1–5 |

**Placeholders.** No step says "TBD", "handle errors" or "similar to". `OnlineSceneClient.moveRefused` is empty for one task on purpose; its comment and Task 4 Step 7 replace it.

**Type consistency.** The same names are used across tasks:
- `RemoteSceneState` and its fields `movableTokenIds`, `measurement`, `conditions`, `status`, `following`, `notice`; `OnlineSceneStatus.tone` takes `connected`, `pending` or `ended`.
- `OnlineSceneControls` has `followGm`, `fitMap`, `reconnect` and `rollDice`.
- `OnlineSceneSink` has `session`, `scene`, `camera`, `control`, `moveRefused`, `diceLog`, `laser`, `images` and `close`.
- `OnlineSceneService` picks `attach`, `images`, `reconnect`, `sendDiceRoll`, `sendTokenMove` and `sendLaser` from `OnlineJoinService`.
- `ONLINE_TOKEN_DROPPED` carries `TokenDrop { id, x, y }`.
- `RemoteSceneApplier` takes `{ store, images, positionOf }`.
- The store option is `createViewAtlasStore(app, viewId, plugin, isPlayerView, { remote })`, the view constructor is `AtlasView(leaf, plugin, isPlayerView, remote)`, and the service manager takes `ServiceManager(app, store, plugin, viewId, { remote })`.

**Review Focus.** Each of its five lines has a named test in its owning task, listed there.
