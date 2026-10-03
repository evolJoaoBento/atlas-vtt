<p align="center">
  <img src="docs/images/atlas-vtt-icon.webp" alt="AtlasVTT icon" width="160" height="160">
</p>

# AtlasVTT

A game system agnostic virtual tabletop for tabletop RPGs that runs inside [Obsidian](https://obsidian.md). 

I built Atlas as part of my bachelor's thesis to give the TTRPG community a virtual tabletop that's open source, hackable, and free to use. Every file Atlas creates, every token, every map, every world you build, stays yours and stays local. It follows the same philosophy as Obsidian: your work lives on your machine, in formats you control, with no account and no server in between.

TTRPG worlds in my opinion are something very personal and players and DMs get attached to them. That attachment deserves better than a subscription and someone else's database. Atlas makes sure your creative output stays yours, just like a sheet of paper would.

Ease of use matters just as much to me. Atlas aims for a minimal, streamlined interface that feels native to Obsidian, with clear controls and simple workflows that keep your attention on the game.

AtlasVTT is desktop only for now

![Atlas VTT showing a battle map, character tokens, a linked statblock, and the initiative tracker](docs/images/atlas-overview.webp)

## At the table

- **Maps and grids:** Build scenes from your own map images. Align square or hex grids manually or with automatic detection.
- **Tokens and encounters:** Import characters, move and resize tokens, and save groups as reusable encounters. Link creature notes with the optional [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin. Simple die syntax like 2d8+2 will be turned into a clickable dice roll.
- **Fog and player view:** Reveal the map as your players explore. Show a separate player window on a second screen while keeping GM information hidden.
- **Drawing and notes:** Sketch, add text, measure distances, and pin Markdown notes or other Atlas maps to locations.
- **Dice and initiative:** Roll dice, review the roll log, track turns, and keep counters and timers close at hand.
- **Music and controls:** Play audio from your vault, customise map hotkeys, and undo or redo map edits.

## Online play (preview)

Host a session from Atlas and your players join from a browser: run **Online session…**, share the link, and approve each player who joins. Nothing is sent before you start a session. Run **Present to players** (also in a map's **More options** menu) to show the current scene to everyone in the session without opening the player window; **Send current map to player view** presents it too. Players who join later get it when you let them in, and **Stop presenting** hides it again. Run **Stop online session** to end the session.

In a map view, the **Online session** button in the toolbar opens the online panel; **Online session…** opens it too. The panel shows the join link with a copy button, players waiting to join with **Allow** and **Deny**, each player with the tokens they control (given with a token's **Controlled by** menu on the map) and an X to remove them, the presented scene with **Present to players** or **Stop presenting**, and a stop button to end the session. The same actions are in Atlas's command palette under Online play. While a session runs, a scene tab's eye button presents that scene to online players without opening the player window; right-click it and pick **Open player window** to open the player window too. The presented scene's eye becomes a hide button that stops presenting.

Players get what the player window shows and nothing more: no hidden tokens, pins, notes or statblocks, nothing completely under fog of war, and grid, HP, stress, names, widgets and initiative as your player view settings say. The join page shows the scene full-window, on desktop and phones, with the map and token images. Players follow your view of the scene in Atlas by default: they see the part of the map you look at, can drag, scroll or pinch to look around on their own, and come back with **Follow GM**. Players download the images of the scene you present when they need them, with a progress bar, straight from your Atlas; only images of the scene they see can be downloaded, and file paths are never sent. Players receive the whole original map image file, so fogged areas of the map picture are visible to anyone who inspects the page; tokens, texts and drawings under fog are still never sent. Their browser keeps the images for next time unless they switch off **Keep images on this device** on the join page.

While a session runs, right-click a character token and pick players under **Controlled by** to let them move it. They drag it on the join page, on desktop or phone, and Atlas puts it where they let go, snapped to the grid as your own drag snaps, as one step you can undo. Players can move only the tokens you gave them, and only while they can see them; a refused move goes back, and the player sees "Move not allowed.". Assignments last until the session ends and are never saved in your tokens.

Players also have Atlas's table tools on the join page. They get a toolbar with **Move**, **Measure** (line, circle or cone, seen only by the player measuring), **Laser** and **Dice**. Dragging one of their tokens shows the drag ruler with your measurement units and diagonal rule; Space, or holding still for half a second on a phone, adds a waypoint. Everyone sees everyone's laser, yours included. Players pick their laser colour from the menu beside the Laser button (the page remembers it); until they do, it follows their place in the session. Your own laser shows in the colour you set in Atlas. Players roll from a dice tray like Atlas's, and Atlas rolls their dice. Every roll, yours and theirs, shows in your dice log under the roller's name and in every player's **Dice log**.

Players who use Obsidian with Atlas can join from Atlas instead of a browser: they run **Join online session…** (also on the online panel while they are not hosting), paste the same join link and enter a name. Once you let them in, an **Online scene** tab shows the presented scene drawn by Atlas, with Atlas's own tools: their tokens move with the drag ruler, and they get Measure, Laser and the dice tray, with the shared dice log in Atlas's dice log. They follow your view by default, and come back with **Follow GM** or see the whole map with **Fit map**. Closing the tab leaves the session. The session itself is never written into their vault; only what they choose to pull from other people's shares is (see below). Atlas keeps the images outside the vault for the next session, unless they switch off **Keep online images on this device** in **Settings → Online play**. Your online panel marks players who joined from Obsidian with a gem. An Atlas joins one session at a time and does not host while it is in one.

Everyone who plays from Atlas in Obsidian can share notes and maps with the others in the session, GM and players alike. Right-click a note or a map, or use the command palette, and pick **Share with…**: tick people, or **Everyone in my sessions**; for a map, choose **Player-safe** (what online players see) or **Full** (everything, as a co-GM would see it) and which of its linked notes to include. A note keeps its sharing in its `atlas-share` property, which you can also edit by hand: `public`, `private`, `[Ana, Ben]` or `[public, except Cara]`. Parts of a note stay yours: `> [!private]` callouts and `%% comments %%` are never shared, `> [!only|Ana, Ben]` goes only to those people and `> [!except|Cara]` to everyone but Cara. The dialog previews what each person gets with **Preview as**. Properties are removed before sending except those listed in **Settings → Online play → Shared note properties**.

During a session, **Shared with me…** (a command, and a button on the online panel and the Online scene bar) lists what each person shares with you, marked **New**, **Updated** or **Up to date**. **Pull** saves a note in `Shared/<person>/` and a map, with its images, in the **Shared with me** collection. Nothing lands in your vault unless you pull it. When you pull a note you also changed, choose **Keep both**, **Keep mine**, **Take theirs**, **Resolve conflicts** (a merge page that takes one-sided changes and lets you settle each conflict) or **Auto merge**, and tick **Remember for this note** to skip the question next time; **Undo last merge** restores the text a merge replaced. A sender can use **Ask to pull…** on a note or map they share with you: you see **Pull** and **Not now**, and nothing is written until you pull.

Atlas knows people by a key each of their devices keeps for your table, never by the name they type. Your join requests show **(known)** or **(new)**, a new device with a known name is flagged, and only you can **Link** it to that person. The **People…** command lists everyone Atlas met in sessions, to rename, link or remove.

Things to know about sharing:

- Names are unique across current and former names, so a new person called like someone who was renamed becomes "Ana (2)"; a name in a note keeps reaching a renamed person.
- `%% comments %%` are removed everywhere in a note, including inside code. A `%%` that is never closed hides the rest of the note.
- Text Atlas cannot read as a private part, or an `atlas-share` entry, is kept back, not shared: the share dialog warns you, and a note whose rule cannot be read counts as private. A name after `except` that is not in your people list hides that part from everyone.
- Maps are replaced, never merged: pulling a map again replaces the copy you received, and if you changed that copy you choose **Keep both** or **Take theirs**.
- A player-safe map leaves out pins under fog of war and pins whose note you did not tick, as well as GM-only pins and hidden tokens.
- Sharing never travels in collection bundles: exporting or importing a collection drops a map's sharing.
- While one person is connected from two devices, requests made from the older device go unanswered until it times out; use the newer one.
- The GM's table key is kept in Atlas's settings in the vault, so anyone who can read the vault can act as your table. Each player's device key is kept in Obsidian's local storage, which belongs to one vault on one device: joining from another vault or device makes a new device, which the GM can link.
- The GM's Atlas passes items between players along, in clear and without storing them, so the GM could read them. See [PRIVACY.md](PRIVACY.md).

- Connections are direct between your Atlas and each player (WebRTC), encrypted end to end.
- To find each other, Atlas and the player page use the free PeerJS signaling server (`0.peerjs.com`) and a public STUN server (`stun.l.google.com`). They see your and your players' IP addresses, never game data. You can use your own peerjs-server instead in **Settings → Online play**.
- Players on strict networks may need a relay (TURN) server, which you can add in the same settings. A relay forwards your traffic between you and a player; it stays encrypted. The join link carries your signaling and relay settings, including any TURN username and password, so your players' browsers can use them: share the link only with people you trust with those credentials.
- Players open the join page from `evoljoaobento.github.io` (GitHub Pages, the default player page; published from this repository's `online-client/` folder). Their browsers load it from there, so GitHub sees their IP address like for any web page. Atlas itself never contacts that address, it only builds links to it. You can change the address in **Settings → Online play**.

## Your notes, right on the map

Pin an Obsidian markdown note or even another Atlas map to a location, then read and edit it in a floating panel without leaving the map. Keep room descriptions, session prep, and character details close at hand, with Obsidian's familiar note linking built in.

![Atlas VTT showing the note picker beside a linked note open on the map, with editing and Obsidian link suggestions](docs/images/note-linking-preview.webp)

## Organise your campaign

Keep scenes, maps, encounters, and characters together in collections. Use folders and tags to find what you need, then bring it onto the map.

![Atlas VTT collection manager with character tokens, folders, tags, and actions for spawning tokens and linking statblocks](docs/images/collection-manager.webp)

## Install

Requires **Obsidian 1.8.7 or newer on desktop**. Atlas VTT is available through Obsidian's community plugins.

1. Open **Settings → Community plugins** and turn off **Restricted mode** if it is enabled.
2. Select **Browse** and search for **Atlas VTT**.
3. Select **Install**, then **Enable**.

Check for updates under **Settings → Community plugins**.

Want to try upcoming features early? Beta builds are available through BRAT, see [docs/beta-testing.md](docs/beta-testing.md).

<details>
<summary>Manual installation</summary>

Download `main.js`, `manifest.json`, and `styles.css` from a [GitHub release](https://github.com/ByteMirror/atlas-vtt/releases). Place them in `<your vault>/.obsidian/plugins/atlas-vtt/`, then enable Atlas VTT under **Settings → Community plugins**.

</details>

## Your first scene

1. Run **Atlas VTT: Open dashboard** from the command palette.
2. Use the **+** button in the asset manager to import a map image, then create a scene using that map.
3. Align the grid with automatic detection or the manual alignment tool.
4. Import tokens and place them on your scene.
5. For a local game, open the player view and move it to your second screen.

## Privacy and network use

Atlas works offline with files in your vault. It has no accounts, telemetry, or ads. Scenes are saved as `.atlasmap` files; asset tags and thumbnails live in the vault's hidden `.atlas-data` folder.

If you use an external image URL for a token or map background, or copy an externally hosted image from a note, Atlas downloads that image from the supplied address. Vault images require no network access. Online play connects to a signaling server, a STUN server and your players only while a session you started is running (see above). When you explicitly submit an issue report, Atlas sends it to `https://srv1871379.hstgr.cloud/atlas/reports`, which creates a public GitHub issue. See [PRIVACY.md](PRIVACY.md) for details.

## Help and contributing

Found a bug or have an idea? Run the **Report an issue** command inside Obsidian or use **Settings → Atlas VTT → Help and feedback**. Atlas fills in your versions and submits your report directly, without a GitHub account or a second form; see [docs/reporting-issues.md](docs/reporting-issues.md). To contribute code, see [CONTRIBUTING.md](CONTRIBUTING.md).

<details>
<summary>Build from source</summary>

Requires Node.js 22 or newer.

```bash
npm ci
npm run build   # production build into ./dist
npm run dev     # watch build
npm test
```

The build also copies the plugin into local test vaults when they are present.

</details>

## Credits and license

Widget icons, map pin icons, the token icon and the end-combat icon are by Lorc, Delapouite, Skoll, sbed, Carl Olsen, and Caro Asercion from [game-icons.net](https://game-icons.net), under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Their backgrounds were removed and glyphs recoloured. The starter class tokens are icons by [Sketch Studio](https://www.fiverr.com/sketchstudioart), commissioned by Maatlock of [maatlockstavern.com](https://maatlockstavern.com), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), redrawn as pencil sketches on parchment. Other asset and library credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Atlas VTT is free software. Copyright (C) 2025-2026 Fabian Urbanek.

You can use it for any purpose, including streamed, recorded, and paid games. You can redistribute and modify it under the terms of the [GNU Affero General Public License, version 3](LICENSE) (`AGPL-3.0-only`) as published by the Free Software Foundation. If you distribute Atlas VTT or a modified version, or let others use a modified version over a network, you must make the complete source code available under the same license. It is distributed in the hope that it will be useful, but without any warranty; see the license for details.

Additional permission under GNU AGPL version 3 section 7: if you modify this program, or any covered work, by linking or combining it with [Obsidian](https://obsidian.md) (or a modified version of that program), the licensors of this program grant you additional permission to convey the resulting work.

Releases up to and including 0.1.6 were published under the PolyForm Noncommercial License 1.0.0. If you want to use the code under different terms, contact Fabian Urbanek.

Your campaign content remains yours. Third-party components retain their own licenses.
