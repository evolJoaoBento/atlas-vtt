## New

- Extension API: other Obsidian plugins can connect to Atlas through `app.plugins.plugins['atlas-vtt'].api` (version 1.1.0), which announces itself with the `atlas-vtt:api-ready` workspace event and tidies up every extension's additions when Atlas unloads. See docs/extension-api.md

## Improved

- A collection's cone angle is read through one function for the measure tool everywhere, so every view measures cones with the same angle
- Number every cell of a square grid, the same way hex grids already could. A new Letters and numbers format (A1, B1, …) is available on square and hex grids alike
- An open map uses much less graphics memory: 3D dice share one drawing context per window, and with dynamic lighting on the map no longer keeps antialiasing buffers it does not draw into

## Fixed

- Rolls show as result cards when the graphics card cannot draw 3D dice, for example after Obsidian lost or blocked WebGL, instead of an empty white panel. Contributed by ISorokaI
- Corrected the swapped export and import icons in the asset manager's collection header. Contributed by anacletoTM
- Large (2×2) and Gargantuan (4×4) tokens snap to where cells meet, so they cover whole cells: on square grids to the corners where grid lines cross, on hex grids to the corner three hexes share, so a Large creature covers 3 hexes and a Gargantuan one 12 (a Huge one stays on a hex and covers 7). This holds when you drag, place, paste or duplicate them and when an encounter spawns them, and they stay there when a scene loads or its grid is changed or aligned. Before, they snapped to the middle of a cell like Medium tokens. A token you resize keeps the cell its footprint starts from, so it stays on the grid at its new size
- The selection outline around a token follows it when the token is resized, from the resize handles or the size menu. Before, it kept the old size until the token was selected again
- Reloading Atlas no longer leaves the previous 3D dice in graphics memory
- Loading a scene with explored areas no longer keeps a copy of them in graphics memory
- The laser pointer is let go when Obsidian loses focus in the middle of a stroke, instead of staying drawn until the next click
- When a map image is replaced, the old image is released only after its sprite has left the map, so it is never freed while still showing
- Fog that did not change is no longer redrawn when other fog changes
- The automatic grid colour no longer fails on a map whose texture is not an image
- Presenting a scene again after the player window lost its source shows that scene, instead of keeping the window on its last frame
- An odd last tile on the dashboard takes the whole row instead of leaving half of it empty
