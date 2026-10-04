# Adding a map feature to online play

Online players see the presented scene through a projection on the GM's side and a layer on the join page. Every Atlas map object and field must be decided on for online play, in the same places every time. When you add a field to `TokenEntity`, a new kind of map object, a grid setting or a new layer, work through this list.

## 1. Record the decision

`src/app/online/coverage.ts` has a table per Atlas type: map objects, token fields, text fields, drawing fields, fog fields, grid fields, and the store fields the projection reads. The tables are typed over Atlas's own types, so a new field or object kind fails `npx tsc --noEmit` until it has an entry:

- `sent`: players receive it, or what it decides (`isHidden` keeps a token from them).
- `used`: never sent itself, but it decides what is sent (a resource definition's socket).
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

## 2b. Token resources

Online players get the bars of the resources the player window draws, and no more (`projectResources.ts`, from the collection's definitions that `SceneBroadcaster` reads through `options.resources(mapPath)`; `OnlineSessionService` passes the asset index's `mapResources`). The window's rules, which `projectBars` follows by going through `visibleResources`:

- Only resources the collection shows to players (`visibleToPlayers`) with a maximum above 0; the map's own `hiddenResources` do not apply to players.
- Only the bars (sockets 0 and 1): the window has no wheels for players, so a resource in a wheel socket is not sent. Bars stack in the order they are shown, whatever their sockets.
- A bar has no label and no numbers in the window, so it goes out as `{ color, share, spent }`: the colour the window shows (a resource that defeats its token warns yellow below 70% and red below 30%, computed on the GM's side from the exact values), the fill in hundredths (a static value is full) and whether the window darkens the bar (the first spent bar that defeats the token). Names, keys, fields, maximums and the other resources never leave.
- A creature whose defeating resource is spent is greyed out with a skull in the window, whether players see that resource or not: `downed` is sent for it (`isDowned`).
- The window's initiative list draws a bar after the name from the token's `hp` resource where the collection shows `hp` to players, from any socket (`initiativeShare`, sent as the entry's `hpShare`).
- Nothing depends on the player or on controlled tokens: one projection goes to everyone, as with the window.
- Edits reach players: the broadcaster watches the collection's settings (`atlas-vtt:collection-settings-changed`, and the asset index loading) through `options.watchResources`, which is not in the store, and projects again. The collection's initiative rules (section 2c) arrive the same way.
- Shares (section 11) call `projectForPlayers` without definitions, so a player-safe map shares no bars.

The Obsidian client cannot give Atlas the GM's definitions, so `convertResources.ts` makes stand-in definitions for each token (`remoteScene.resources`, by token id): one per bar, in the colour sent, filled to the share out of 100, and a hidden `downed` resource for a downed token. `viewResourceDefinitions` answers for a token from them (as `viewConditionDefinitions` does for badges), the stand-ins use only the two bar sockets and the `downed` one sits in `tokenSettings.hiddenResources` of the remote store (written by `RemoteSceneApplier`), so no wheel or extra bar shows. The upstream files carry only the hooks that cannot live here: the provider's optional token id (`resourceTypes.ts`, `TokenRenderer`, `UIManager`, `TokenUIRenderer`), no hover numbers in the online scene (`TokenUIRenderer.isRemote`) and `PlayerInitiativePanel` reading `remoteScene.initiativeHealth`. The join page draws the bars with `barStackRects` and the other shared layout of `tokenUiLayout.ts`, and its initiative rows with a `<progress>` (`online-client/fillList.mts`), no number. `ResourceBarView`, `DownedTokenOverlay` and `downedEmblemTexture` stay as upstream wrote them; `tokenUiLayout.ts` and `downedLook.ts` copy their values, and `sharedLayout.test.ts` fails when upstream's change.

## 2c. Initiative

Players get the list the player window draws (`PlayerInitiativePanel`), which is the authority: `projectPanels.ts` follows it, using upstream's own `listedBySides` and `sideOf` (`initiative/sides.ts`), never a copy.

- **Which entries.** Those whose token is sent (not hidden, not fogged, not unseen under lighting), in the tracker's order, with the name where nameplates are on and the HP bar of section 2b.
- **Turn order.** The numbers, the entry whose turn it is (`isActive`) and the round. No `sides`.
- **By sides** (`PlayerInitiative.sides`, present exactly when the window groups by sides). A running fight keeps the mode it started in (`initiative.sides` is set); before a fight the collection's rules decide (`mode: 'sides'`), and the first side is the fight's, else the rules'. Then `sides` is `{ first, active? }` (`active` only while a fight runs), every `initiative` is 0 (older pages require a number) and no entry is active, because the window shows neither numbers nor a combatant's turn there. The sender never puts a real number on the wire (`initiativeSides.test.ts` scans the JSON).
- **Which side.** `PlayerToken.side`, sent only for a token with an entry while the list is by sides: `sideOf` resolves it on the GM's side (the token's own, else the players' for a token that sees, else the opponents'), so the vision settings never leave. A side nobody is listed under is not drawn.
- **Sitting out.** `PlayerInitiativeEntry.sitsOut` (true or absent), in both modes: the window fades the card.
- **Rules.** The collection's initiative rules are not in the store, so `SceneBroadcasterOptions.initiativeRules(mapPath)` (`mapInitiativeRules`) supplies them and `watchResources` announces edits. Coverage: `INITIATIVE_RULES_COVERAGE` (`mode` and `firstSide` are used, `roll` is the GM's alone). `TOKEN.side`, `INITIATIVE.sides` and `INITIATIVE_ENTRY.sitsOut` are `sent`. Player-safe shares are projected with the same rules (`CatalogueSources.initiativeRules`), so a share of a by-sides collection carries no numbers either.
- **Fields are optional** (older GMs send none; older clients ignore them and show the list as a plain list with 0s). Limits: `sides.first` and `.active` must be one of `PLAYER_SIDES`, `sitsOut` the literal `true`, `side` one of `PLAYER_SIDES`.
- **Join page.** `initiativeLines(initiative, tokens)` returns rows for `fillList`: side headings (`SIDE_LABELS`, `sidesInOrder`, imported from upstream), the side to act marked with `aria-current`, faded rows, no numbers.
- **Obsidian client.** The converter gives the remote token its `side` and the entry its `sitsOut`, and sets `initiative.sides` while a fight runs. Before a fight the list is by sides through `remoteScene.initiativeRules` (`atlasInitiativeRules`), which `PlayerInitiativePanel` reads instead of the player's own vault's rules (one more hook, beside `initiativeHealth`). `onlineSceneInitiative.test.ts` draws the upstream panel over the GM's store and over the remote store and compares the markup.

## 3. Wire type and validation

Add the field to `src/app/online/scene/sceneTypes.ts` as `T | null`, never optional: JSON drops `undefined`. The exception is a field added after players already ran: make it optional, validate it as absent-or-valid (`optional()` in `sceneValidation.ts`) and read it with a default, so older GMs and players keep working (`PlayerToken.resources`, `downed` and `PlayerInitiativeEntry.hpShare` are like this; `hp` and `stress` stay in the type, always null, because older pages require them). Validate it in `sceneValidation.ts`, with bounds on every count and string. Players running an older page ignore fields they do not know, so a new field needs no new protocol version. A changed meaning does.

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
  - `DiceHost` rolls a player's roll with the dice rules of the collection of the map players have (`mapDiceRules`, read at every roll; while the GM holds the scene, the map last presented live): exploding dice and the crit. The tray always sends dice, so the default roll only decides which dice are the default dice.
  - A log entry (`DiceLogEntry`, `toolMessages.ts`) carries each die with `negative` / `exploded`, the `crit`, and `unlisted` for dice past the first 100; dice are clipped, never filtered, since an exploded die must follow its parent. Write dice out with `tools/diceLabels.ts` on both clients. `mine` is set per recipient (`entryFor`): only the roller's copy carries it.
  - **Own rolls in 3D.** Only fresh, live `mine` entries are thrown (`mergeDiceLog(...).fresh`, `ownRolls`), never a replay. On the page `OwnRollThrows` decides (Roll display `card`, more than 20 dice, unlisted dice, no WebGL, a failed chunk load: the toast instead) and loads `online-client/dice3d/diceThrows.mts` with the first throw: three.js and `src/app/dice3d/` in their own chunk, behind `obsidianShim.mts` (`createEl`, `activeDocument`). Nothing in the page's main script may import three.js or a module that does; after `npm run build:online`, `index-*.js` must not contain `WebGLRenderer`. `throwPlan.ts` and `stageClock.mts` copy `DiceStage`'s seeded steps and clock, `throwPanel.mts` `DiceRollPanel`'s times; `throwPlan.test.ts` reads upstream's source and fails when they change. The page throws without sound.
  - The GM's `DiceRollDisplay` shows a roll with `rolledBy` as a card, never thrown: the player sees it thrown on their own screen.
  - **Cones** open by `PlayerMeasurement.coneAngle`: `mapConeAngle`, the one function the GM's `mapMeasurementSettings` uses too (a system's angle for collections without one, with or without grid defaults; 90° for a stored angle no cone opens with), passed to the broadcaster as `coneAngle`. Player-safe shares use it too (`CatalogueSources.coneAngle`, `PayloadContext.coneAngle`). An older GM sends none and the page uses 90°.
  - The page holds at most two WebGL contexts (`PAGE_STAGES`: the stage on screen and a spare, `diceThrows.mts`), never upstream's four warm stages. `diceChunkGlobals.test.ts` reads every module the chunk runs and fails when one uses an Obsidian global the shim lacks, or passes `createEl` more than `cls` and `attr`.
  - The move notice, a roll's toast and the own throw stack at the top of the map (`.top-stack`), so none covers another; on a phone on its side the throw stands beside the other two, with a lower stage.
- **Tests.**
  - The shared modules have their own tests (`tests/unit/playerToolsShared.test.ts`, `diceRolling.test.ts`, `remoteLasers.test.ts`), and Atlas's renderer tests must pass unchanged.
  - Gestures are tested on `PlayerTools` with `ViewInput`, drawings on `RecordingSurface`, and the page's DOM under jsdom (`pageToolbar.test.ts`, `diceTrayView.test.ts`, `diceLogView.test.ts`, `throwPanel.test.ts`).
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
  - the stand-in resource definitions of each token and the initiative bars (section 2b);
  - how the GM's list is grouped before a fight (section 2c);
  - the status bar;
  - whether the camera follows the GM.

  It is null in every other view. UI that differs in the online scene reads `Boolean(state.remoteScene)`, and reaches the view's actions through `AtlasView.onlineControls()`.
- **One tab per Atlas.** The Online scene tab is not navigable: opening a map never replaces it, and a second Online scene view closes itself instead of taking over the session. Closing the tab leaves the session.
- **Images.** Each image is shown by two object URLs, one for the map and one for tokens (`objectUrlImages.ts`). Atlas's background cache and token cache each unload by URL, so they must never share one. A blob background is unloaded as soon as nobody shows it.
- **Tools.** The player's tools are Atlas's own:
  - `InteractionController` drags only the tokens `mayMoveAsOnlinePlayer` allows, one at a time, and emits `ONLINE_TOKEN_DROPPED`. `RemoteTokenMoves` sends the drop and holds the token until the GM answers.
  - The laser goes through the view's `LaserHub` and `OnlineLaserLink`.
  - The dice tray and the dice log's "Roll again" send `dice-roll` through `onlineControls().rollDice`. The online tray allows at most 20 dice, the limit the GM enforces. "Roll again" leaves out dice an explosion added and refuses rolls with subtracted or unlisted dice (`rollOfResult`).
  - The player's own rolls reach `remoteScene.ownRoll` (`OnlineSceneSink.ownRoll`), which `OnlineOwnRolls` (mounted in UIRoot under `remote`) throws with upstream's roll stack and the player's own dice settings.
  - A new tool for Obsidian players follows the same pattern: Atlas's tool, gated on `remoteScene`, sending through the join service.
- **Never the vault.** Nothing in the online scene reads or writes the vault (sharing, section 11, is separate: it writes only when the receiver pulls), and it writes no settings: it reads only the laser colour and the navigation settings. Only the Join dialog writes `online.playerName`, and the settings tab writes `online.keepImages`. Nothing in the online scene dispatches `atlas-dice-rolled`: every open map view records that event and saves it into its map file. `tests/unit/online/obsidian/obsidianPlayerEndToEnd.test.ts` checks both over `MemoryTransport`.

## 11. Sharing between Obsidian clients

Sharing (`src/app/online/sharing/`) reuses online play: a player-safe map is `projectForPlayers` (step 2), so a new map feature that players see is in player-safe shares too. Obsidian clients only: web players send `kind: 'web'` and no device proof, never receive `share-*` messages, and `online-client/` must not import anything from `sharing/` (search `dist-online/` after `npm run build:online`).

- **A new map field holding a vault path** (an image, a note, a sound) is cleared by name: keys matching `PATH_KEY` (`buildMapPayload.ts`: `…path`, `…paths`, `background`) and everything under them are replaced on the sender's side, and `clearForeignPaths` (`receive/receivedMap.ts`) clears them again on the receiver's, for every `*Path` field whether or not the file exists. Add the field to `imagePathsOf` (`model/buildMapPayload.ts`) only if it is an image to send. Tests in `mapPayload.test.ts` and `mapPull.test.ts` fail when a new `*Path` field appears on the map types without being covered.
- **A lit map is never shared player-safe** (`LIT_MAP_NOT_PLAYER_SAFE`): when the saved map has dynamic lighting on, whatever this device's Experimental toggle, `playerSafePayload` returns null, `SenderCatalogue` neither lists, opens nor serves images of it, and Share with… offers only Full and says why. A share does not work out sight and light yet (a later piece: the lighting from the file on the CPU, with the collection's sight rules, the decoded memory and pins checked against the darkness).
- **Player-safe maps** hold `projectForPlayers` output plus pins; a pin is left out when it is GM-only, under fog (`FogCoverage`) or its note was not ticked. Full maps send every field with paths replaced by `atlas-share-image:`/`atlas-share-note:` references. Maps are replaced, never merged: a re-pull overwrites the received scene (the receiver chooses Keep both or Take theirs if they changed it).
- **Note filtering** (`model/noteFilter.ts`, `privateParts.ts`, `commentFilter.ts`) is fail-closed:
  - Parts are marked with tags that are comments: `%%[!private]%%`, `%%[!only|names]%%`, `%%[!except|names]%%`, each closed by `%%[!end]%%` (innermost first), inline or on their own lines (`privateTags.ts`). `scanMarkup` finds tags first, as whole one-line tokens `%% [!…] %%`, and pairs comments only in the gaps between them, so a `%%` that Obsidian shows as code cannot shift the pairing and turn a part into text; a comment not closed within its gap hides the rest of the note. Keep that order. Block context comes from Obsidian's own parser: `metadataCache.getFileCache(file).sections`, read right after `cachedRead` (`catalogueSources.readNote`), trusted only when the cache parsed that very text (`sectionTrust.ts`: a fingerprint of the `data` of the last `metadataCache.on('changed')` must match, a note modified since is not trusted, a note untouched since startup keeps the cache Obsidian loaded; Share with... and Ask to pull use the same rule), and checked against that exact text (`noteSections.textBlocksOf`: every section's line/column must give its offset). A token counts only inside a text section (paragraph, heading, list, blockquote, callout, comment); in any other section, between sections, or with missing or stale sections it is text, hides the rest of the note and warns. Sections are top-level only, so inside lists, quotes and callouts `codeContext.ts` adds a blunt check (a fence- or HTML-looking line earlier in the block, or 4+ columns of whitespace in the token line's marker prefix). Inline checks (code spans, inline `<code>`, `$` math, autolinks, reference definitions, link labels by bracket depth, link destinations) honour backslash escapes: an escaped `%` before a token makes it text, and inside a code span a backslash is literal (only a backtick run of the opener's length closes it); every other check reads the text both as written and with escapes masked, and either reading open counts. A token's paragraph is read twice, back to the last blank line and back to the start of its list item or quote line run, and either reading open counts (spans can cross lazy lines and ordered markers, and must not pair across items). `<` depth is counted over the paragraph (multi-line attributes). Inside lists, quotes and callouts a `$$` line counts like a fence. Never add block detection that the sections cover. A token whose text is not a tag (unknown keyword, no names, `end|x`) opens a part hidden from everyone and never closes one. An unclosed tag hides the rest of the note from everyone. A stray end (nothing open) stops the note being shared at all: `SenderCatalogue` neither lists nor serves it, Ask to pull refuses it and Share with… names its line (`strayEndLineIn`), since its start tag was probably deleted.
  - `%%` comments are stripped everywhere, code fences included; the filter does no fence tracking, so do not add any. An unclosed `%%` hides the rest of the note.
  - Backstop: tag text outside a parsed tag (`[!private`, `[!only`, `[!except`, `[!public`, `[!end`; old `> [!private]` callouts, tag-like comments) hides everything from it to the end of the note. It is looked for in the author's view (every part shown, malformed ones too) and again in each reader's text.
  - Tag text in a kept property drops that property; tags are not read in frontmatter.
  - An `atlas-share` entry that is not understood makes the rule `private`; an unknown name after `except` hides from everyone. Each problem warns the sender (`ShareWithModal`).
  - **Parts meant only for you arrive marked, so if you share the note on, they stay with you and the sender.** A restricted part the recipient gets is sent as `%%[!only|@<table>/<person>, …]%%` (`forwardedParts.ts`): the sender's key (from `forTable`'s `self`) and every other person of the recipient's table the part lets in, never the recipient, at most 64. Private parts are never sent. A part whose tag line the old-callout guard removes is hidden instead, and the output is checked to hold exactly the parts it marked, so a tag never goes without its end. The receiver (`SharedWithMe.writeNote`) verifies the bytes against the listed version, then writes the keys as names from its own people list (`peopleListNames`: never a session's name, and only a name that reads back as the same person, since a re-share resolves names through that list), dropping keys of other tables, malformed keys, plain names and names a tag cannot hold; with none left the part becomes `%%[!private]%%`, and any other tag that arrives turns private. Versions stay the hash of exactly what is sent, and merges compare the written (named) text.
  - **Editor**: `parts/registerPartCommands.ts` adds flat **Share part: …** items to `editor-menu` (the API has no public submenus) and four editor commands; `parts/partEdits.ts` computes one change per action. Both first move the selection's ends out of any tag or comment they cut. Private / Only / Except wrap each stretch between the tags inside the selection on its own, so every selected character ends up inside the new part (fuzz test in `partEdits.test.ts`). **Everyone** frees exactly the selection: tags inside it go, parts open at its edges are closed before and reopened after it; it is refused when a part open at the selection's start is never closed. The Only… / Except… picker names people by person key through the people list (`parts/partPeople.ts`), never by join names; the session store refreshes its names when the people list changes.
  - `%%[!public]%%` marks a part for everyone the note reaches: no rule of its own (an outer part still applies), and its tags are never forwarded.
  - **Display** (`display/`): `tagDisplayOf` turns the scan into labels (start tags), highlights (covered text, with nesting depth) and hidden ranges (end tags), for the editor (`tagDecorations.ts`, a state field: a line of end tags folds away, which a view plugin cannot do; a tag the selection touches shows as written), reading view (`readingView.ts`, a post-processor reading `getSectionInfo`; inline parts are found by their plain characters, else the block is highlighted) and the Share with… preview (`TaggedText.tsx`). Colours are Obsidian's `--color-*-rgb`: private red, public green, only blue, except orange.
  - **The `atlas-share` property** (`display/shareProperty.ts`): each entry read by `parseShareRule` and its names through the people list, as `ruleReaches` does, gives labels (`not-met` for placeholders, `unrecognised` for unreadable entries and unknown names) and a summary. Obsidian has no API for property widgets, so `sharePropertyDom.ts` only adds classes to the panel's pills or text value and a hint line under the row, kept in sync by a MutationObserver per `.metadata-container` (child and text changes only); Obsidian's inputs are never replaced. `shareYaml.ts` colours the entries in Source mode's frontmatter.
  - After filtering, links are rewritten (`noteLinks.ts`) and a final sweep turns any remaining vault link into text.
- **Names**: unique within a people list across current and former names (`peopleNames.ts`); a former name, or a removed person's name (`retiredNames` in `people.json`), is never reassigned. Notes name people, maps hold person keys (`<table>/<person>`), so a rename keeps both working.
- **People added by name** (`PeopleBook.placeholders`, `placeholderTypes.ts`; `placeholders` in `people.json`): a placeholder has a stable random `id` (older files get one on load and are saved again) but no person or table id, and is never in `list()`/`byName()`, so nothing that needs a table or person id sees it. Its name is taken like any other (`nameKey`, `nameTaken`). `NameResolver.isPlaceholder`: in `only` a placeholder's name matches nobody (and `atlas-share: [Dave]` reaches nobody); in `except` it counts as unknown, so the part is hidden from everyone until the placeholder is linked (whoever arrives as "Dave (2)" must not get what was kept back from Dave), and **Share with…** warns. Map shares hold `placeholder:<id>` keys (keys older versions wrote by name still resolve), which reach nobody until linked; `PeopleBook.currentKey` maps a stored key to its current row (after a rename, link or merge), and a key that resolves to nobody is a "Removed or unknown person" row the user can untick. Linking is explicit, by placeholder id: the GM's join notice (`IdentityDesk` `sameName.placeholder`, `admitAsPlaceholder`) or **Link to…** on a person in People (`linkPlaceholder`); both keep the name and former names and alias the placeholder's keys, so every reference follows. Allow keeps a joiner separate (`Dave (2)`). "Preview as" a placeholder uses a stand-in recipient that lives for one call (`model/placeholderPreview.ts`).
- **Wire**: `share-*` messages on the assets channel (`transport/shareProtocol.ts`), addressed by person id. Handles at or above `SHARE_HANDLE_MIN` belong to sharing; image handles stay below. The GM's own transfers use `NODE_HANDLES`, relayed ones `RELAY_HANDLES`. `GmShareHost` stamps `from`; never trust one a player sent. `ShareRelay` holds handle mappings only, never bytes, and drops them when either side leaves or is taken over. The GM replies to a person's most recently admitted device, so while one person is connected from two devices, requests from the older one time out after 15 s.
- **Identity**: person ids come from the GM; `IdentityDesk` decides known or new by device id, never by name. A proof is bound to the host id, so change `deviceProofText`/`tableProofText` (`identity/proofs.ts`) only with a new version prefix. The GM's table key is in `online.table` (vault settings, so vault access means table access); device keys are in Obsidian local storage under `atlas-online-device-keys` (per vault, per device).
- **Vault writes** happen only in `notePull` and `mapPull`, inside a pull the receiver started, and in Undo last merge. Maps and their scene record are written under `assetService.runExclusive`. A copied scene or collection bundle drops `data.sharing`, and a bundle's Markdown notes (any role: linked notes, statblock notes, loot items) lose their `atlas-share` property (`withoutShareProperty`, applied by `rewriteContent` when a bundle is packed and when one is installed, so the manifest's checksum is of the bytes in the zip). It is deliberately not in `rewriteText` or `refersToFiles`, which `assetTransfer` also uses: moving a scene to another collection must keep the user's own notes as they are. Atlas's own data (`people.json`, `items.json`, `pulled.json`, `bases/`, `history/`) goes through the adapter into `atlas-vtt/.atlas-data/sharing/`; a file that cannot be read is first copied to `<name>.broken.json`.
- **Tests**: the end-to-end tests run three Atlases over `MemoryTransport` (`tests/unit/online/sharing/sharingEndToEnd.test.ts`, with the GM's vault spied for writes); use `noteCatalogue` and `nodeIdentityCrypto` from `sharingFixtures.ts`, since Web Crypto finishes outside fake timers' control.
