# Online play, piece 6a: players join from Obsidian

Date: 2026-10-02. Status: design, approved in conversation. Builds on pieces 1–5
and polish A/B, merged to the fork's `main` (52363a7).

## Context

Players join online sessions from the web page. Players who use Obsidian with
Atlas want to play from Obsidian: the same scene, drawn by Atlas's own renderer,
with Atlas's tools. This piece adds that client. It is also the foundation for
piece 6b (sharing notes and maps between people), which works only between
Obsidian users.

## Goals

- A player with Atlas runs **Join online session…**, pastes the GM's join link,
  enters a name, and after the GM approves sees the presented scene in an
  **Online scene** tab drawn by Atlas's renderer.
- The same session, messages, filtering and limits as web players; the GM's side
  treats an Obsidian player like a web player and shows which client they use.
- Players follow the GM's view, break away and come back, move their own tokens,
  measure privately, use the laser and roll dice, with Atlas's own tools and UI.
- The player's own maps, collections, settings and vault are never read or
  written by the online scene.

## Non-goals

- Sharing notes and maps (6b).
- Hosting from the same Atlas while joined to another session.
- Physical 3D dice (not on this line).

## Decisions

| Question | Decision |
| --- | --- |
| How the scene is shown | A real Atlas map view (new view type) fed from the received scene, drawn by Atlas's renderer. |
| How a player joins | Paste the same join link into **Join online session…**; one link for browser and Obsidian. |
| Where it opens | Its own **Online scene** tab; closing the tab leaves the session. |
| Styling | Atlas's existing patterns: `ToolButton`, panel and dialog motion, `CloseButton`, `atlas-panel-radius`, elevated surfaces, sentence case, `LabelTooltip`, SCSS. |

## Joining

- **Join online session…** (command palette, and the toolbar's network button
  when not hosting) opens a dialog in Atlas's dialog style with the join link and
  the player's name (remembered in Atlas's settings).
- The link is parsed with the existing `joinLink` code (host id, signaling and
  relay settings). Atlas connects with `PlayerSession` and identifies as
  `client: 'obsidian'` in `join`.
- One joined session per Atlas at a time; joining while hosting is refused with
  a notice.
- The GM's online panel shows an Obsidian mark next to Obsidian players.

## The online scene view

- New view type `atlas-online-scene`, opened in a new tab on admission.
- It owns an Atlas store created the usual way (`storeFactory`) but marked
  remote: no map file, no persistence, no history tracking, no autosave, no
  snapshots, no vault-sync, no collection or widget sync.
- `PlayerSceneMirror` scenes are converted into the store by a pure converter
  (`playerSceneToAtlasState`) — tokens, fog, texts, drawings, grid, map size,
  measurement settings, widgets, initiative — covering every field the coverage
  tables mark as sent. Patches become store updates, so Atlas's renderers redraw
  as for a local change.
- Images come from `AssetLoader` (memory cache, plus IndexedDB per the player's
  "keep images" setting); decoded images become PIXI textures for the
  background and tokens. Nothing is written to the vault.
- Camera: follows the GM (`scene-camera`) by default; panning or zooming breaks
  away; **Follow GM** and **Fit map** controls appear in Atlas's toolbar style.
- Read-only: GM tools (fog, walls, lights, drawing, text, pins, token creation,
  editing panels) are hidden; context menus offer only what players may do.
- Status: a slim bar shows the GM's session name and connection; when the
  session ends the tab keeps the last scene and says "The session ended."

## Player tools

- Move: Atlas's token drag with the drag ruler, for controlled tokens only; one
  `token-move` on drop; refused moves snap back with "Move not allowed.".
- Measure: Atlas's measure tool, private.
- Laser: Atlas's laser in the player's Atlas laser colour; sent and received as
  on the web page, drawn with Atlas's beam.
- Dice: Atlas's dice tray; rolls sent as `dice-roll`; the shared dice log shows
  in Atlas's dice log panel.

## Errors and reconnecting

- Reconnect as the web page (backoff, keep the last scene, give up after five
  minutes); then the tab shows "Lost the connection to your GM." with
  **Reconnect**.
- Denied, kicked, full, version mismatch: the same texts as the web page, in the
  tab.

## Testing

- Converter: every sent field maps into the store; round trip with patches.
- Remote store: nothing persisted, no history, no vault writes.
- Join dialog and link parsing; one session at a time; refuse while hosting.
- View: follow and break away; read-only tool set.
- End to end over `MemoryTransport`: an Obsidian player joins, receives the
  scene, moves a token, rolls dice, points a laser.
- Manual: two vaults on two machines.
