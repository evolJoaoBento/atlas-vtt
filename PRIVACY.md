# Privacy and network use

Atlas VTT works offline. Maps, tokens, notes, audio and settings stay in your vault. Submitting an issue report is an optional network action. Online play, which you start yourself, is the only other exception; see [Online play](#online-play).

- No accounts, no telemetry, no analytics, no ads.
- No code is downloaded or executed from the internet, and the plugin does not update itself.

## Network access

If you set a token or map background to an `http://` or `https://` image URL, or copy an image that a note embeds from an external URL, that image is downloaded from the address in question. Images stored in your vault cause no network traffic.

## Online play

While an online session you started runs, Atlas connects to a signaling server (the PeerJS cloud at `0.peerjs.com` unless you set your own), a STUN server (`stun.l.google.com`), any relay servers you add, and directly to the players you let in. The signaling and STUN servers see IP addresses and connection ids but no game data; data between you and your players is encrypted end to end. A relay (TURN) server, if you add one, forwards that still-encrypted traffic between you and a player. Stopping the session, or closing Obsidian, ends all of it.

The join link you share carries your signaling and relay settings, including any relay username and password from **Settings → Online play**, so players' browsers can use them. The players you let in receive the scene you present: what your player window shows, filtered on your computer before it is sent, with file paths replaced by fingerprints of the files' contents, which only tell whether two images are the same file. They also receive the map and token images of that scene, as the original files, and no other file from your vault. A map image is sent whole, so the parts of the picture under fog of war are visible to anyone who inspects the page; tokens, texts and drawings under fog are still never sent. With dynamic lighting on, the same holds for what the lighting hides from your player window: the darkness covers the map image, tokens your players' tokens do not see and texts and drawings in the dark are never sent, and walls, lights and how tokens see are never sent at all. Token resources reach players only as your player window shows them: a bar for each resource your collection shows to players (never a name or a number, and a fill rounded to hundredths), and the HP bar in the initiative list. The initiative list reaches players as your player window shows it: for a collection that fights by sides, the combatants under their side and no initiative numbers, and a number only where the window shows one. Which side a combatant is on is sent, but not why (a creature's vision settings never are). A creature is also marked as downed, as in the player window, when a resource that defeats it is spent, even one you keep from players. While a scene is presented and you look at it in Atlas, players also receive where your view of it is (its centre and how much of the map it shows), so their view can follow yours; nothing about your view is sent while you look at another scene.

Players can move the tokens you assign to them under **Controlled by**. For each move, their page sends Atlas only the token and the spot where they let go, and Atlas checks every move before applying it to your scene; players cannot send anything else that changes it. Each player receives the ids of their own tokens, and nothing else about them. Assignments are kept only while the session runs.

While a session runs, players also receive every dice roll Atlas makes: the formula, each die (and whether it was rolled for an exploding die or subtracts) and the total, whether it was a critical success or failure by your collection's dice rules, and who rolled it. That is the player's name, or a statblock token's name only when players can see that token with its name on the presented scene (not hidden, not under fog, nameplates on), or "GM". Only the player who made a roll receives it marked as their own, so their page can throw it as dice. Players' rolls are rolled with your collection's dice rules. Players also receive your game system's cone angle with your measurement settings. Their page keeps their **Roll display** choice in that browser. While you point with the laser on the presented scene, players receive where it is. Players' measurements and drag rulers stay on their device. Their lasers and dice rolls go to you and to the other players in the session. Lasers are not stored. Players' rolls show in your dice log for as long as the map stays open, but are not saved into your map files; your own rolls are saved there as before.

Players open the join page from `evoljoaobento.github.io` (GitHub Pages) by default. Their browsers load it from there, so GitHub sees their IP address like for any web page. Atlas itself never contacts that address, it only builds links to it. You can change the address in **Settings → Online play**.

With **Keep images on this device** on (the default), the join page keeps the images it received in the player's browser storage for later sessions, up to 500 MB, until the player switches it off or chooses **Clear saved images**; with it off, images are kept only while the page is open. Browsers give every site under `evoljoaobento.github.io` the same storage, so the join page should stay the only site published there, or move to its own address.

When you join a session from Atlas (**Join online session…**), Atlas connects to the signaling and relay servers the join link names, the STUN server, and directly to the GM, only while the Join dialog waits for the GM and while the Online scene tab is open. The GM receives the name you enter, that you joined from Atlas, and the same things a web player sends. Nothing you receive is written into your vault unless you pull it (see [Sharing notes and maps](#sharing-notes-and-maps)): the scene is kept in memory only. With **Keep online images on this device** on (the default), the images are kept in Obsidian's browser storage on this device, outside the vault and shared by all vaults on the device, up to 500 MB. Switching it off deletes them. Atlas remembers the last name you joined with in its settings.

### Sharing notes and maps

When you and others play from Atlas in Obsidian, Atlas identifies each of you with a key that stays on your device. Joining sends a signature made with it, never the key.

- **The GM's table key** is kept in Atlas's settings (`atlas-vtt/.atlas-data/settings.json`), so it travels with the vault: anyone who can read the vault, or a copy or sync of it, can act as that table. Using one vault on several machines keeps it one table.
- **A player's device key** is kept in Obsidian's local storage, one per table, never in the vault. Obsidian keeps local storage per vault on each device, so a second vault or device is a new device to the GM, who can link it to the person.
- **The people list** (names, device ids, when they were last seen) is kept in `atlas-vtt/.atlas-data/sharing/people.json`: the GM's for everyone admitted, a player's for the people they met.

Nothing is shared until you share it, and only with the people you pick. What leaves your Atlas is decided on your computer, before anything is sent:

- `[!private]` parts, parts meant for other people, and `%% comments %%` are removed. Comments are removed everywhere, including inside code, and an unclosed `%%` removes the rest of the note.
- Text that cannot be read fails closed: a private part or an `atlas-share` entry Atlas cannot read is kept back rather than sent, and a name after `except` that is not in your people list hides that part from everyone.
- Properties are removed except those listed under **Shared note properties**, and the `atlas-share` property itself is never sent. Links to notes the person does not get become plain text.
- File paths never leave your Atlas. Shared items get random ids, and a map's paths are cleared or replaced by references.
- A player-safe map holds what online players see. A map saved with dynamic lighting on is never shared player-safe, since a share does not work out what its players' tokens see yet; share it Full or switch its lighting off. Pins under fog of war, GM-only pins and pins whose note you did not tick are left out. A full map holds the whole map as a co-GM would see it, including hidden tokens, GM-only pins, walls and lights, so Atlas asks you to confirm it.
- Sharing settings are not part of collection bundles: exporting a collection leaves them out (a scene's share, and the `atlas-share` property of every exported note) and importing one drops them. The rest of an exported note is not filtered: a bundle is your own release.

Items go only to someone who pulls them, during a session, over the same encrypted connection as the game.

Items between two players pass through the GM's Atlas. It forwards them piece by piece and stores none of them: it writes nothing to its vault and keeps no record once the transfer ends. But each connection is encrypted separately, so the GM's Atlas handles those items in clear while it forwards them, and the GM could read anything players share with each other. There is no end-to-end encryption between players.

What you pull is written into your vault: notes into `Shared/<person>/`, maps and their images into the **Shared with me** collection. Atlas also keeps, in `atlas-vtt/.atlas-data/sharing/` (which Obsidian does not index), the last pulled version of each note, its merge history and a list of what you pulled from whom. Removing a person from your people list does not delete what you already pulled.

## Files outside the vault

Atlas VTT does not read or write files outside your vault. Images kept for online play when you join from Atlas are in Obsidian's browser storage, not in files (see [Online play](#online-play)).

## Code execution

When the optional [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin is installed, Atlas VTT renders creature statblocks with that plugin's layouts. Layouts can contain small JavaScript callbacks (for example to format a modifier). Atlas VTT runs those callbacks exactly as Fantasy Statblocks does. They come only from Fantasy Statblocks' own layout data on your computer — never from note content or the internet. That includes layouts you imported from someone else, so only import layouts you trust, as you would for Fantasy Statblocks itself. Without Fantasy Statblocks installed, no such code runs.

Atlas VTT converts imported images in background workers so Obsidian stays responsive. The workers run code bundled in the plugin's `main.js`, started from a local blob URL; nothing is downloaded, and they only receive the images you import.

## Issue reports

The **Report an issue** command and **Settings → Atlas VTT → Help and feedback**
open a form inside Obsidian. **Submit report** sends the filled report over HTTPS
to the Atlas reporting service. The service
publishes it as a public GitHub issue and returns a confirmation. No GitHub
account is required. Nothing is sent merely by opening the form.

The report includes the text you enter and the Atlas, Obsidian and Electron
versions, operating system, interface language and active theme. Community
plugin names/versions and recent Atlas errors are optional. Automated diagnostics
exclude vault names, file paths, note contents and map data; your own report
text is published as entered.

The reporting service processes your IP address for abuse prevention. It stores
a daily keyed address hash for up to 24 hours, not the raw IP. It retains request
identifiers, report hashes and issue receipts to prevent duplicate submissions;
it does not retain report bodies separately from GitHub. **Copy report** writes
the report to your clipboard without sending it. See
[docs/reporting-issues.md](docs/reporting-issues.md).

## Clipboard and local storage

The clipboard is written only when you choose a copy action (for example "Copy image"). Interface state such as the music queue is kept in local storage on your device. So are the device keys Atlas uses to join online sessions (see [Sharing notes and maps](#sharing-notes-and-maps)).
