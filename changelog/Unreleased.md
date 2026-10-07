## New

- Other Obsidian plugins can extend Atlas through a versioned extension API (`app.plugins.plugins['atlas-vtt'].api`, announced by the `atlas-vtt:api-ready` event). They can read map views, scenes and collection rules; present scenes; roll, publish and throw dice, add dice looks and dice tray colours; draw lasers; ask what players see of a lit scene; move tokens; add toolbar buttons, command palette sections, dashboard tiles, menu entries, movable panels and tabs in the asset manager and collection settings; keep their own data on scenes and collections; and open read-only map views they feed themselves. Atlas removes everything a plugin added when either plugin unloads. See docs/extension-api.md

## Improved

- Sight and light are worked out much faster on maps with thousands of walls, such as large imported maps.

- Fog paint and erase strokes now use consistent shapes.

- Simplified how token artwork and collection rules update.

- Simplified token statblock updates and added checks for linked notes.

- Simplified laser pointer updates and added checks for cleanup.

- Added checks to keep data types and rendering helpers independent of plugin services.

- Widget shortcuts are consistently marked as GM controls.

- Dice rolls now reject invalid formulas with a clear message and enforce limits of 64 characters, 10 terms, 100 dice and 1,000 faces per die. Exploding dice keep their existing limit.

- Simplified the hashing behind bundles, library files, thumbnails and dice throws, with checks that keep their results unchanged.

- Simplified how the GM view and the player view decide which tokens see and which are always shown.

- Added licence notices for the two dice fonts.

## Fixed

- A grid too fine to draw (a size of 0 or less, or more than 2,000 cells along a side of the map) is no longer drawn, and one whose origin lies extremely far from the map is moved next to it by whole cells, instead of freezing Obsidian.

- The laser pointer is let go when Obsidian loses focus in the middle of a stroke, instead of staying drawn until the next click.

- When a map image is replaced, the old image is released only after its sprite has left the map, so it is never freed while still showing.

- Fog that did not change is no longer redrawn when other fog changes.

- The automatic grid colour no longer fails on a map whose texture is not an image.

- A cone angle edited by hand to a value no cone can open with measures as 90 degrees, in every view alike.

- Renaming a map while its explored areas wait to be saved saves them into the renamed map.

- A statblock note rewritten on export keeps its byte order mark.

- Selecting, hovering, switching tools and other changes to nothing a map saves no longer rewrite the map file.

- A widget, condition or game system preset whose icon name is not one of Atlas's icons but a built-in word such as `constructor` shows the default icon, or the condition's initial, instead of an empty badge.

- Fog now updates correctly when returning to a map or canceling a drawing.

- Erasing part of a drawing now keeps all saved properties on the remaining pieces.

- Closing the command palette cancels its pending focus attempts, so it cannot take focus back afterwards.

- Dice rolls, sounds and history stay in the map view that made them. The player window follows the presented view, and clearing a log leaves other views alone.

- Undo and redo now change only what that edit changed. Changes Atlas made by itself since, such as following a renamed file, stay.

## Important changes

- Data that other plugins keep on scenes and collections never travels in collection exports, copies or installs, and stays on the device that saved it; library sync does not carry it. While a vault holds such data, exporting a collection reads each asset's record file to make sure.

- Fog-covered tokens and door badges are now hidden in the player view, including token labels and drag rulers.

- Hidden tokens no longer add sight or explore new areas in the player window. Areas already explored stay remembered.

- Removed an unused legacy map view. Old tabs using it no longer reopen. The current player window is unchanged.

- In the player window, a dice roll shows its token's portrait and ability only when players can see that token in the shown scene, and its name only when token nameplates are shown to players.

- A measurement that starts on a token players can't see is no longer shown in the player view or session view. A measurement also leaves the player view while the token it started on is out of sight.

- Instance badges in the player view and session view count and number only the tokens players can see, so their numbers can differ from those in the GM view. A token whose look-alikes are hidden or under fog shows no badge.
