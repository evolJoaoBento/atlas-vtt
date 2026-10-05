## New

- Extension API: read open map views and their scenes, the rules of a map's collection, the laser, dice and player view settings, and a data folder per extension
- Extension API: other Obsidian plugins can connect to Atlas through `app.plugins.plugins['atlas-vtt'].api`, which announces itself with the `atlas-vtt:api-ready` workspace event and tidies up every extension's additions when Atlas unloads. See docs/extension-api.md
- Extension API: present a scene, follow which scene players see, and add an audience besides the player window
- Extension API: roll dice by a map's collection rules on someone's behalf, hear every roll, and add rolls made elsewhere to the log
- Extension API: follow the GM's laser in a view and draw other people's lasers there, fading like Atlas's own
- Extension API: ask what the player window shows of a lit scene, token by token and cell by cell, failing closed while sight is not ready
- Extension API: move tokens like a GM drag (snapped, kept on the map, one undo step), and ask where a dropped token lands
- Extension API: other plugins can add toolbar buttons, command palette sections, dashboard tiles, entries in a map's More options and a token's menu, and floating panels in Atlas's style
- Extension API: list scenes, keep an extension's own data on a scene (never exported), read a saved map without opening it, add a scene with its images in one step, and keep note properties out of exports
- Extension API: a presented scene carries a `presentationId`, the same while the scene is held and resumed and new for each presentation, so an extension no longer has to guess whether it is the one it knows
- Extension API: note properties an extension asks to keep out of exports stay stripped while that extension is switched off, until it removes them itself, which `bundles.forgetNoteProperties` also does
- Extension API: an optional `remote-view` capability: a read-only map view fed by another plugin, never saved, with the player's tools: dragging the tokens they may move, measuring, the laser and the dice tray into a shared log
- Extension API: remote views are listed by `views.list()` and announced by `map-loaded` and `map-closed` as `kind: 'remote'`; an extension that picks the GM's map views keeps to `kind === 'map'`
- Extension API: menu items can stay open when chosen, and an open submenu follows its extension's changes, so several toggles can be set in a row
- Extension API: throw a roll decided elsewhere with Atlas's own 3D dice in a map view, once per roll, following your dice display setting
- Extension API: reading a saved map without opening it also gives its note pins, walls, lights, light zones, camera, token settings and whether the initiative tracker was open, and adding a scene can write them
- Extension API: an extension can replace the map of a scene it added itself with a newer version, keeping the scene; the GM's own scenes, and scenes open in a view, are never replaced

## Improved

- The presented scene keeps its marker on the scene tab until you choose Stop presenting, and an open player window follows the scene you present from anywhere. New commands: Present to players, Stop presenting
- A collection's cone angle is read through one function for the measure tool everywhere, so every view measures cones with the same angle
- Rolls made by someone other than the GM show who rolled them in the dice log and toasts, appear as a result card instead of being thrown on the GM's map, and are never saved in the map file

## Fixed

- The laser pointer is let go when Obsidian loses focus in the middle of a stroke, instead of staying drawn until the next click
- When a map image is replaced, the old image is released only after its sprite has left the map, so it is never freed while still showing
- Fog that did not change is no longer redrawn when other fog changes
- The automatic grid colour no longer fails on a map whose texture is not an image
- Presenting a scene again after the player window lost its source shows that scene, instead of keeping the window on its last frame
- An odd last tile on the dashboard takes the whole row instead of leaving half of it empty
- A widget, condition or game system preset whose icon name is not one of Atlas's icons but a built-in word such as `constructor` shows the default icon, or the condition's initial, instead of an empty badge

## Important changes

- Data that other plugins keep on scenes never travels in collection exports, copies or installs. Map shares saved by the online preview are kept for the extension that reads them and are never exported either
