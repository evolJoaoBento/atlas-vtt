# Adding a map feature to online play

Online players see the presented scene through a projection on the GM's side and a layer on the join page. Every Atlas map object and field must be decided on for online play, in the same places every time. When you add a field to `TokenEntity`, a new kind of map object, a grid setting or a new layer, work through this list.

## 1. Record the decision

`src/app/online/coverage.ts` has a table per Atlas type: map objects, token fields, text fields, drawing fields, fog fields, grid fields, and the store fields the projection reads. The tables are typed over Atlas's own types, so a new field or object kind fails `npx tsc --noEmit` until it has an entry:

- `sent`: players receive it, or what it decides (`isHidden` keeps a token from them).
- `gm-only` with a reason: it never changes what players receive.
- `not-yet` with the piece expected to add it.

Then add a variant for the field in `tests/unit/online/coverage.test.ts`. It changes the field and checks that the projection changes for `sent` and stays the same otherwise.

## 2. Project it on the GM's side

`src/app/online/scene/projectForPlayers.ts` (map, grid, tokens), `projectRecords.ts` (fog, texts, drawings) and `projectPanels.ts` (widgets, initiative) build every sent object field by field, never by spreading a GM record. Read values through `coerce.ts` and clamp numbers into `SCENE_RANGES`, so the output always validates. Follow the player view settings (`playerViewRules.ts`) and the fog (`FogCoverage`) as the local player window does. If the projection reads a new store field, add it to `sliceOf` in `sceneSources.ts`, to `ProjectedState` in `projectForPlayers.ts` (a hand-written `Pick` of the store state), and to `SCENE_FIELD_COVERAGE` in `coverage.ts`.

## 3. Wire type and validation

Add the field to `src/app/online/scene/sceneTypes.ts` as `T | null`, never optional: JSON drops `undefined`. Validate it in `sceneValidation.ts`. Players running an older page ignore fields they do not know, so a new field needs no new protocol version. A changed meaning does.

## 4. Draw it on the player's side

Each Atlas layer has a player layer in `src/app/online/view/layers/`, drawn through `ViewSurface` (never the canvas directly), in the order of `SCENE_LAYER_ORDER` (`src/app/pixi/sceneLayerOrder.ts`):

- Draw only what is on screen (`frame.visible`).
- Hand network text and colours only to the surface's `text`, `fill` and `stroke`.
- Cache expensive drawings the way the fog layer does.

A new Atlas layer goes into `SCENE_LAYER_ORDER` (and `SCENE_LAYER_Z` when it is placed by `zIndex`). `createSceneLayers` then fails to compile until the player view has a layer for it.

## 5. Share the geometry

Layout that Atlas and the player view both need lives in modules without PIXI or Obsidian imports, which both renderers use:

- `grid/hexGeometry.ts`, `grid/hexNumbering.ts` and `grid/gridDistance.ts` (path lengths, `cellCenterAt`)
- `grid/measurementFormat.ts` (distance labels)
- `pixi/token-renderer/tokenSizing.ts`, `tokenUiLayout.ts` (bars, nameplate), `conditionBadgeLayout.ts` and `dragRulerPath.ts`
- `pixi/textBoxLayout.ts`, `pixi/mapIcons.ts` and `pixi/measureGeometry.ts` (measure strokes, shapes and labels)
- `pixi/laser/laserBeamGeometry.ts`, `laserTrail.ts` and `remoteLasers.ts`
- `tools/diceRolling.ts` and `tools/laserPointerSettings.ts`
- `packages/components/toolbar/toolbarFit.ts`

Change the shared module, never a copy in one renderer.

## 6. Tests

- The coverage variant (step 1).
- The projection, in `tests/unit/online/projectForPlayers.test.ts` or `projectParts.test.ts`.
- The validation, in `sceneProtocol.test.ts`.
- What the layer draws, on `RecordingSurface` (`tests/unit/online/recordingSurface.ts`).
- An end-to-end test over `MemoryTransport` (`sceneSyncEndToEnd.test.ts`) when messages change.

## 7. Tell players and the GM

Update `README.md` and `changelog/Unreleased.md`. Update `PRIVACY.md` too when players learn something new about the GM's scene or view.

## 8. When players act on the scene

Players change the GM's scene only through messages the GM checks. Token moves (`src/app/online/control/`) are the pattern:

- Add the message to `src/app/online/protocol.ts` with its validator, and its type to `PLAYER_MESSAGE_TYPES`. `GmSession` hands handlers nothing else from players.
- Handle it in its own `GmSession` handler, started by `TokenControlHost` or beside it, never in `SceneBroadcaster`.
- Check the message against what players have (`currentProjection()`).
- Refuse while the presented scene is held or its map is loading, because the view's store then holds another map.
- Look ids up with `Object.hasOwn`.
- Rate-limit per player.
- Write through a store action inside `runHistoryTransaction`, so each player action is one undo step for the GM.
- Answer a refusal with only what the player sent, so refusals reveal nothing.
- Validate numbers as numbers and check finiteness in the handler, because `1e400` reads as `Infinity`. A bad value then gets a refusal, not an invalid-message strike.
- Test it end to end over `MemoryTransport` with the history-backed store in `tests/unit/online/tokenMoveFixtures.ts`. A store without history passes undo tests for the wrong reason.

## 9. Player tools

The join page has Atlas's table tools: the drag ruler, the measure tool, the laser and the dice tray. Each one follows the same split as a map feature.

- **Shared geometry.** The maths both sides need lives in the shared modules of step 5, which Atlas's PIXI renderers use too. Change the shared module, never a copy on one side.
- **The gesture.** `PlayerTools` (`src/app/online/view/tools/`) takes the one-finger presses `ViewInput` hands it. Move drags the player's own tokens with the drag ruler. Measure and Laser take every one-finger press. Two fingers always pinch and pan the map, and end the gesture. A new tool needs:
  - a `PlayerTool` value and its gesture in `PlayerTools`;
  - what it draws in `toolsLayer.ts`, through `ViewSurface`, over the fog;
  - a control in `TOOLBAR_CONTROLS` (`src/app/online/page/playerToolbar.ts`) with a priority, a label and one of Atlas's icons in `toolIcons.ts` (the test checks each icon against Atlas's component).
  - The toolbar fit is Atlas's own `overflowingToolbarItems`, so the tool in use never moves into More tools.
- **What stays local.** Measurements and the drag ruler are never sent; `playerToolsPage.test.ts` checks that a measurement sends nothing. Keep a new tool local unless the spec says others see it.
- **What others see.** A tool others see sends a message from the player (step 8). The GM either applies it or relays it:
  - Relays, such as lasers (`LaserRelay`), go to every other admitted player with `from` set to the session's id for the sender. Never trust a `from` the player sent.
  - Relays drop a message for another scene than the one players have, and store nothing.
  - Senders batch with `LaserBatcher`, so a player's page stays under the GM's rate limit.
  - Receivers let a laser go after `LASER_STALE_MS`, and the GM lets a player's laser go when the player leaves.
- **Rolls.** Dice are rolled on the GM's side (`DiceHost`), never on the page, so a roll cannot be faked.
  - Every roll reaches Atlas's dice log, toasts and sounds through the `atlas-dice-rolled` event (`DiceFeed`). Anything that rolls in Atlas, the toolbar, statblocks or a future physical-dice integration, must dispatch it. Rolls with `rolledBy` (players') stay in the live dice log only: `persistableDiceLog` filters them out of what `storeFactory`'s `partialize` saves into the map file.
  - `DiceHost` names a roll from the projection players have (`currentProjection().tokens[tokenId].name`), so a roll for a token that is hidden, under fog, unnamed (nameplates off), on a held scene, or with nothing presented is "GM".
- **Tests.**
  - The shared modules have their own tests (`tests/unit/playerToolsShared.test.ts`, `diceRolling.test.ts`, `remoteLasers.test.ts`), and Atlas's renderer tests must pass unchanged.
  - Gestures are tested on `PlayerTools` with `ViewInput`, drawings on `RecordingSurface`, and the page's DOM under jsdom (`pageToolbar.test.ts`, `diceTrayView.test.ts`, `diceLogView.test.ts`).
  - Messages are tested end to end over `MemoryTransport` with `tests/unit/online/toolsFixtures.ts`.
  - `online-client/main.mts` is neither linted nor tested. After `npm run build:online`, search `dist-online/` for the new message types, element ids and copy.

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
- **One tab per Atlas.** The Online scene tab is not navigable: opening a map never replaces it, and a second Online scene view closes itself instead of taking over the session. Closing the tab leaves the session.
- **Images.** Each image is shown by two object URLs, one for the map and one for tokens (`objectUrlImages.ts`). Atlas's background cache and token cache each unload by URL, so they must never share one. A blob background is unloaded as soon as nobody shows it.
- **Tools.** The player's tools are Atlas's own:
  - `InteractionController` drags only the tokens `mayMoveAsOnlinePlayer` allows, one at a time, and emits `ONLINE_TOKEN_DROPPED`. `RemoteTokenMoves` sends the drop and holds the token until the GM answers.
  - The laser goes through the view's `LaserHub` and `OnlineLaserLink`.
  - The dice tray and the dice log's "Roll again" send `dice-roll` through `onlineControls().rollDice`. The online tray allows at most 20 dice, the limit the GM enforces.
  - A new tool for Obsidian players follows the same pattern: Atlas's tool, gated on `remoteScene`, sending through the join service.
- **Never the vault.** Nothing in the online scene reads or writes the vault, and it writes no settings: it reads only the laser colour and the navigation settings. Only the Join dialog writes `online.playerName`, and the settings tab writes `online.keepImages`. Nothing in the online scene dispatches `atlas-dice-rolled`: every open map view records that event and saves it into its map file. `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts` checks both over `MemoryTransport`.
