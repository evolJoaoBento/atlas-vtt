# Adding a map feature to online play

Online players see the presented scene through a projection on the GM's side and a layer on the join page. Every Atlas map object and field must be decided on for online play, in the same places every time. When you add a field to `TokenEntity`, a new kind of map object, a grid setting or a new layer, work through this list.

## 1. Record the decision

`src/app/online/coverage.ts` has a table per Atlas type: map objects, token fields, text fields, drawing fields, fog fields, grid fields, and the store fields the projection reads. The tables are typed over Atlas's own types, so a new field or object kind fails `npx tsc --noEmit` until it has an entry:

- `sent`: players receive it, or what it decides (`isHidden` keeps a token from them).
- `lighting`: never sent; with dynamic lighting on it decides what players receive, through the lighting the player window is drawn by (walls, lights, light zones, token vision and light, the scene's lighting options and explored memory). See step 2a.
- `gm-only` with a reason: it never changes what players receive.
- `not-yet` with the piece expected to add it.

Then add a variant for the field in `tests/unit/online/coverage.test.ts`. It changes the field and checks that the projection changes for `sent` and stays the same otherwise. A `lighting` field also gets a pair in `tests/unit/online/lightingCoverage.test.ts`, which projects with the lighting upstream's CPU code works out from the store and checks that the field changes what players get there.

## 2. Project it on the GM's side

`src/app/online/scene/projectForPlayers.ts` (map, grid, tokens), `projectRecords.ts` (fog, texts, drawings) and `projectPanels.ts` (widgets, initiative) build every sent object field by field, never by spreading a GM record. Read values through `coerce.ts` and clamp numbers into `SCENE_RANGES`, so the output always validates. Follow the player view settings (`playerViewRules.ts`) and the fog (`FogCoverage`) as the local player window does. If the projection reads a new store field, add it to `sliceOf` in `sceneSources.ts`, to `ProjectedState` in `projectForPlayers.ts` (a hand-written `Pick` of the store state), and to `SCENE_FIELD_COVERAGE` in `coverage.ts`.

## 2a. Dynamic lighting

With dynamic lighting on (an experimental feature) and the presented scene lit, online players get exactly what the player window shows, read from the presented view's own lighting, never worked out again: `LightingController.playerLighting()` (`PlayerLighting`: the sight, ambient light, light reaches and seen spots of the view's `SceneLightingView`, and `playerSight()`, the perception the player window hides tokens by). `PresentedSceneInfo.lighting()` reaches it through the view's renderer, `watchLighting` tells when it changed outside the store, and `LiveLighting` (`src/app/online/scene/`) turns it into a `LightingFrame` for each projection:

- **Tokens** the window does not show (perception other than `seen`, also tokens players only sense, which the window outlines) are not sent, with their nameplates, bars and initiative entries.
- **The map**: `darknessRaster.ts` marks every cell of the map (8 px or more, at most 384 across) whose centre the window shows: where a precise sense that shows the map perceives it in the light there, a seen spot, or the explored memory the window shows (decoded from the scene's saved `exploredMask` by `exploredImage.ts`). `darknessFog.ts` sends the rest as one fog paint lasso, id `atlas-lighting-darkness`, ordered after every GM fog operation: its outline follows the cell edges and its loops are joined by zero-width bridges, so both clients fill exactly the dark cells with their nonzero fill and need no change. The GM side covers the same cells as rectangles in a second `FogCoverage` (`darkCoverage`), so texts and drawings in the dark are left out like those under fog. Tokens are checked against the GM's fog only: perception decides them, and a token the window sees is never wholly dark.
- Until the view's sight belongs to the scene the store holds (`sightReady`: a map loading, no bounds yet, a lost graphics device), nothing is seen: no tokens, all dark.
- The darkness is worked out at most every `DARKNESS_INTERVAL_MS`, whatever changed (a light put out and a door closed wait too; only a change to or from not-ready darkens at once); tokens follow perception at every tick.
- Where the view cannot tell (no renderer, no lighting state yet) and the scene is saved lit, players get no token and full darkness (`closedFrame`).
- A darkness change never replays the GM's fog: on the GM's side it is painted over the fog's cached cells (`FogCoverage.covering`), and the Obsidian client's fog renderer keeps every operation canvas whose records did not change and composites everything before the latest operation once (`FogCanvasCompositor`). `darknessFogCost.test.ts` checks both against a scene with hundreds of fog operations.
- **Deliberate difference from the player window:** texts and drawings in the dark are hidden online. The player window draws them above its darkness (z 500 and 900 over the lighting layer's 90), which shows GM labels in rooms nobody has seen; online they are covered like texts under fog, on purpose.
- Walls, lights and vision are never sent; `lightingProjection.test.ts` searches every message for them.

A new lighting input that changes what the player window shows must reach `PlayerLighting` (or the store fields `sliceOf` watches), never the wire.

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
- **Never the vault.** Nothing in the online scene reads or writes the vault (sharing, section 11, is separate: it writes only when the receiver pulls), and it writes no settings: it reads only the laser colour and the navigation settings. Only the Join dialog writes `online.playerName`, and the settings tab writes `online.keepImages`. Nothing in the online scene dispatches `atlas-dice-rolled`: every open map view records that event and saves it into its map file. `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts` checks both over `MemoryTransport`.

## 11. Sharing between Obsidian clients

Sharing (`src/app/online/sharing/`) reuses online play: a player-safe map is `projectForPlayers` (step 2), so a new map feature that players see is in player-safe shares too. Obsidian clients only: web players send `kind: 'web'` and no device proof, never receive `share-*` messages, and `online-client/` must not import anything from `sharing/` (search `dist-online/` after `npm run build:online`).

- **A new map field holding a vault path** (an image, a note, a sound) is cleared by name: keys matching `PATH_KEY` (`buildMapPayload.ts`: `…path`, `…paths`, `background`) and everything under them are replaced on the sender's side, and `clearForeignPaths` (`receive/receivedMap.ts`) clears them again on the receiver's, for every `*Path` field whether or not the file exists. Add the field to `imagePathsOf` (`model/buildMapPayload.ts`) only if it is an image to send. Tests in `mapPayload.test.ts` and `mapPull.test.ts` fail when a new `*Path` field appears on the map types without being covered.
- **A lit map is never shared player-safe** (`LIT_MAP_NOT_PLAYER_SAFE`): when the saved map has dynamic lighting on, whatever this device's Experimental toggle, `playerSafePayload` returns null, `SenderCatalogue` neither lists, opens nor serves images of it, and Share with… offers only Full and says why. A share does not work out sight and light yet (a later piece: the lighting from the file on the CPU, with the collection's sight rules, the decoded memory and pins checked against the darkness).
- **Player-safe maps** hold `projectForPlayers` output plus pins; a pin is left out when it is GM-only, under fog (`FogCoverage`) or its note was not ticked. Full maps send every field with paths replaced by `atlas-share-image:`/`atlas-share-note:` references. Maps are replaced, never merged: a re-pull overwrites the received scene (the receiver chooses Keep both or Take theirs if they changed it).
- **Note filtering** (`model/noteFilter.ts`, `commentFilter.ts`) is fail-closed:
  - `%%` comments are stripped everywhere, code fences included; the filter does no fence tracking, so do not add any. An unclosed `%%` hides the rest of the note.
  - A callout ends only at a blank line, a heading or a fence at a lower quote depth. Do not "fix" it to end at the first unquoted line: Obsidian renders such a line inside the callout.
  - A `[!private`, `[!only` or `[!except` that is not a readable header hides its section; an `atlas-share` entry that is not understood makes the rule `private`; an unknown name after `except` hides from everyone. Each warns the sender (`ShareWithModal`).
  - After filtering, links are rewritten (`noteLinks.ts`) and a final sweep turns any remaining vault link into text.
- **Names**: unique within a people list across current and former names (`peopleNames.ts`); a former name is never reassigned. Notes name people, maps hold person keys (`<table>/<person>`), so a rename keeps both working.
- **Wire**: `share-*` messages on the assets channel (`transport/shareProtocol.ts`), addressed by person id. Handles at or above `SHARE_HANDLE_MIN` belong to sharing; image handles stay below. The GM's own transfers use `NODE_HANDLES`, relayed ones `RELAY_HANDLES`. `GmShareHost` stamps `from`; never trust one a player sent. `ShareRelay` holds handle mappings only, never bytes, and drops them when either side leaves or is taken over. The GM replies to a person's most recently admitted device, so while one person is connected from two devices, requests from the older one time out after 15 s.
- **Identity**: person ids come from the GM; `IdentityDesk` decides known or new by device id, never by name. A proof is bound to the host id, so change `deviceProofText`/`tableProofText` (`identity/proofs.ts`) only with a new version prefix. The GM's table key is in `online.table` (vault settings, so vault access means table access); device keys are in Obsidian local storage under `atlas-online-device-keys` (per vault, per device).
- **Vault writes** happen only in `notePull` and `mapPull`, inside a pull the receiver started, and in Undo last merge. Maps and their scene record are written under `assetService.runExclusive`. A copied scene or collection bundle drops `data.sharing`. Atlas's own data (`people.json`, `items.json`, `pulled.json`, `bases/`, `history/`) goes through the adapter into `atlas-vtt/.atlas-data/sharing/`; a file that cannot be read is first copied to `<name>.broken.json`.
- **Tests**: the end-to-end tests run three Atlases over `MemoryTransport` (`tests/unit/online/sharing/sharingEndToEnd.test.ts`, with the GM's vault spied for writes); use `noteCatalogue` and `nodeIdentityCrypto` from `sharingFixtures.ts`, since Web Crypto finishes outside fake timers' control.
