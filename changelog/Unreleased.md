## New

- Extension API: read open map views and their scenes, the rules of a map's collection, the laser, dice and player view settings, and a data folder per extension
- Extension API: other Obsidian plugins can connect to Atlas through `app.plugins.plugins['atlas-vtt'].api`, which announces itself with the `atlas-vtt:api-ready` workspace event and tidies up every extension's additions when Atlas unloads. See docs/extension-api.md
- Extension API: present a scene, follow which scene players see, and add an audience besides the player window
- Extension API: roll dice by a map's collection rules on someone's behalf, hear every roll, and add rolls made elsewhere to the log. A roll made for someone other than the GM shows who rolled it in the dice log and toasts, appears as a result card instead of being thrown on the GM's map, and is never saved in the map file
- Extension API: follow the GM's laser in a view and draw other people's lasers there, fading like Atlas's own
- Extension API: ask what the player window shows of a lit scene, token by token and cell by cell, failing closed while sight is not ready
- Extension API: move tokens like a GM drag (snapped, kept on the map, one undo step), and ask where a dropped token lands
- Extension API: other plugins can add toolbar buttons, command palette sections, dashboard tiles (an odd last tile takes the whole row), entries in a map's More options and a token's menu, and floating panels in Atlas's style
- Extension API: a floating panel an extension added can be moved by its header, like Atlas's own panels, and stays inside the view
- Extension API: list scenes, keep an extension's own data on a scene (never exported), read a saved map without opening it, add a scene with its images in one step, and keep note properties out of exports
- Extension API: a presented scene carries a `presentationId`, the same while the scene is held and resumed and new for each presentation, so an extension no longer has to guess whether it is the one it knows
- Extension API: note properties an extension asks to keep out of exports stay stripped while that extension is switched off, until it removes them itself, which `bundles.forgetNoteProperties` also does
- Extension API: an optional `remote-view` capability: a read-only map view fed by another plugin, never saved, with the player's tools: dragging the tokens they may move, measuring, the laser and the dice tray into a shared log
- Extension API: remote views are listed by `views.list()` and announced by `map-loaded` and `map-closed` as `kind: 'remote'`; an extension that picks the GM's map views keeps to `kind === 'map'`
- Extension API: menu items can stay open when chosen, and an open submenu follows its extension's changes, so several toggles can be set in a row
- Extension API: throw a roll decided elsewhere with Atlas's own 3D dice in a map view, once per roll, following your dice display setting
- Extension API: reading a saved map without opening it also gives its note pins, walls, lights, light zones, camera, token settings and whether the initiative tracker was open, and adding a scene can write them
- Extension API: an extension can replace the map of a scene it added itself with a newer version, keeping the scene; the GM's own scenes, and scenes open in a view, are never replaced
- Extension API: follows Atlas 0.6. A scene's own distance per cell reaches extensions (`GridState.unitDistanceOverride`, `MeasurementSettings.ruleDistance`), extension toolbar buttons sit after the dice in the customizable toolbar, and Atlas's own texts around what extensions add follow Obsidian's language
- Extension API: a toolbar button can choose per view whether it shows, for example only in the remote views its own extension opened; a hidden button takes no room and is not in More tools
- Extension API: a remote view's status bar takes up to 3 buttons in all, each telling the extension which was chosen
- Extension API: a remote view's camera can leave the same margin as Fit map, so an extension's own Fit button frames the map as Shift+1 does
- Extension API: a remote view redraws only the parts of the player's state that changed, so its initiative list keeps its scroll when the rest is sent again
- Extension API: rolls an extension makes or publishes still show in every open map view now that Atlas keeps each view's rolls in that view, `dice.onRolled` hears every roll once, and `dice.roll` refuses the formulas the dice tray refuses
- Extension API: what the player window shows (`lighting.playerVisibility`) leaves out tokens under fog, and whatever only a token the GM hid would see, as the player window now does
- Extension API: other plugins can add dice looks with their own face art and colour, chosen in the dice settings; Atlas's dice keep their throw, sounds and results, and a face a look has no art for keeps Atlas's numeral
- Extension API: a roll an extension publishes can skip Atlas's 3D throw and show as a result card, so dice already thrown elsewhere are not shown twice
- Extension API: a die in a roll can carry a colour and its name (e.g. "Fire"), as physical dice report them; the dice log and toasts group such dice under a coloured dot and the name, and the tags are saved with the dice log
- Extension API: a remote view shows at most 2,000 fog operations and 200,000 fog points (10,000 per operation, brushes no wider than the map); a scene with more is shown fully fogged with a line saying why, instead of freezing Obsidian, and fog sent again unchanged is not worked out again
- Extension API: `tabs-changed` tells extensions when a map view's tabs or active tab change, a scene snapshot names its tab, and `views.showTab` opens a tab without presenting it (API 1.17.0, `scene-tabs`)
- Extension API: `ui.addSceneTabMenuSection` adds a section to the menu that right-clicking a scene tab's eye opens; its checkmarks follow changes while it is open
- Extension API: a presentation target can mark scene tabs next to their eye, for example with how many players see them
- Extension API: the shared 3D dice module (`@atlas-vtt/shared/dice3d`) lets a page outside Obsidian install its own DOM, so it can draw Atlas's dice
- Extension API: other plugins can add a tab to the asset manager, beside Scenes, Maps, Encounters and Tokens, that shows their own content for the chosen collection (API 1.18.0, `asset-tabs`)
- Extension API: other plugins can keep their own data on a collection, never exported or copied, and add a tab of their own to a collection's settings
- Extension API: other plugins can offer colours in the dice tray; dice added while a colour is picked carry it in the log and toasts
- Extension API: a die rolled in a colour (its tag) is thrown in that colour with Atlas's 3D dice, in Atlas's look and in looks other plugins add

## Improved

- The presented scene keeps its marker on the scene tab until you choose Stop presenting, and an open player window follows the scene you present from anywhere. New commands: Present to players, Stop presenting
- Fog paint and erase strokes now use consistent shapes.
- Simplified how token artwork and collection rules update.
- Simplified token statblock updates and added checks for linked notes.
- Simplified laser pointer updates and added checks for cleanup.
- Added checks to keep data types and rendering helpers independent of plugin services.
- Widget shortcuts are consistently marked as GM controls.
- Dice rolls now reject invalid formulas with a clear message and enforce limits of 64 characters, 10 terms, 100 dice and 1,000 faces per die. Exploding dice keep their existing limit.

## Fixed

- A grid too fine to draw (a size of 0 or less, or more than 2,000 cells along a side of the map) is no longer drawn, and one whose origin lies extremely far from the map is moved next to it by whole cells, instead of freezing Obsidian
- The laser pointer is let go when Obsidian loses focus in the middle of a stroke, instead of staying drawn until the next click
- When a map image is replaced, the old image is released only after its sprite has left the map, so it is never freed while still showing
- Fog that did not change is no longer redrawn when other fog changes
- The automatic grid colour no longer fails on a map whose texture is not an image
- Presenting a scene again after the player window lost its source shows that scene, instead of keeping the window on its last frame
- A cone angle edited by hand to a value no cone can open with measures as 90 degrees, in every view alike
- Renaming a map while its explored areas wait to be saved saves them into the renamed map
- A statblock note rewritten on export keeps its byte order mark
- A widget, condition or game system preset whose icon name is not one of Atlas's icons but a built-in word such as `constructor` shows the default icon, or the condition's initial, instead of an empty badge
- Fog now updates correctly when returning to a map or canceling a drawing.
- Erasing part of a drawing now keeps all saved properties on the remaining pieces.
- Closing the command palette cancels its pending focus attempts, so it cannot take focus back afterwards.
- Dice rolls, sounds and history stay in the map view that made them. The player window follows the presented view, and clearing a log leaves other views alone.

## Important changes

- Data that other plugins keep on scenes never travels in collection exports, copies or installs, and stays on the device that saved it; library sync does not carry it. Exporting a collection reads each asset's record file to make sure.
- Fog-covered tokens and door badges are now hidden in the player view, including token labels and drag rulers.
- Hidden tokens no longer add sight or explore new areas in the player window. Areas already explored stay remembered.
- Removed an unused legacy map view. Old tabs using it no longer reopen. The current player window is unchanged.
