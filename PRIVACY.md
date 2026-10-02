# Privacy and network use

Atlas VTT works offline. Maps, tokens, notes, audio and settings stay in your vault. Submitting an issue report is an optional network action. Online play, which you start yourself, is the only other exception; see [Online play](#online-play).

- No accounts, no telemetry, no analytics, no ads.
- No code is downloaded or executed from the internet, and the plugin does not update itself.

## Network access

If you set a token or map background to an `http://` or `https://` image URL, or copy an image that a note embeds from an external URL, that image is downloaded from the address in question. Images stored in your vault cause no network traffic.

## Online play

While an online session you started runs, Atlas connects to a signaling server (the PeerJS cloud at `0.peerjs.com` unless you set your own), a STUN server (`stun.l.google.com`), any relay servers you add, and directly to the players you let in. The signaling and STUN servers see IP addresses and connection ids but no game data; data between you and your players is encrypted end to end. A relay (TURN) server, if you add one, forwards that still-encrypted traffic between you and a player. Stopping the session, or closing Obsidian, ends all of it.

The join link you share carries your signaling and relay settings, including any relay username and password from **Settings → Online play**, so players' browsers can use them. The players you let in receive the scene you present: what your player window shows, filtered on your computer before it is sent, with file paths replaced by fingerprints of the files' contents, which only tell whether two images are the same file. They also receive the map and token images of that scene, as the original files, and no other file from your vault. A map image is sent whole, so the parts of the picture under fog of war are visible to anyone who inspects the page; tokens, texts and drawings under fog are still never sent. While a scene is presented and you look at it in Atlas, players also receive where your view of it is (its centre and how much of the map it shows), so their view can follow yours; nothing about your view is sent while you look at another scene.

Players can move the tokens you assign to them under **Controlled by**. For each move, their page sends Atlas only the token and the spot where they let go, and Atlas checks every move before applying it to your scene; players cannot send anything else that changes it. Each player receives the ids of their own tokens, and nothing else about them. Assignments are kept only while the session runs.

While a session runs, players also receive every dice roll Atlas makes: the formula, each die and the total, and who rolled it. That is the player's name, or a statblock token's name only when players can see that token with its name on the presented scene (not hidden, not under fog, nameplates on), or "GM". While you point with the laser on the presented scene, players receive where it is. Players' measurements and drag rulers stay on their device. Their lasers and dice rolls go to you and to the other players in the session. Lasers are not stored. Players' rolls show in your dice log for as long as the map stays open, but are not saved into your map files; your own rolls are saved there as before.

Players open the join page from `evoljoaobento.github.io` (GitHub Pages) by default. Their browsers load it from there, so GitHub sees their IP address like for any web page. Atlas itself never contacts that address, it only builds links to it. You can change the address in **Settings → Online play**.

With **Keep images on this device** on (the default), the join page keeps the images it received in the player's browser storage for later sessions, up to 500 MB, until the player switches it off or chooses **Clear saved images**; with it off, images are kept only while the page is open. Browsers give every site under `evoljoaobento.github.io` the same storage, so the join page should stay the only site published there, or move to its own address.

When you join a session from Atlas (**Join online session…**), Atlas connects to the signaling and relay servers the join link names, the STUN server, and directly to the GM, only while the Online scene tab is open. The GM receives the name you enter, that you joined from Atlas, and the same things a web player sends. Nothing you receive is written into your vault: the scene is kept in memory only. With **Keep online images on this device** on (the default), the images are kept in Obsidian's browser storage on this device, outside the vault and shared by all vaults on the device, up to 500 MB. Switching it off deletes them. Atlas remembers the last name you joined with in its settings.

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

The clipboard is written only when you choose a copy action (for example "Copy image"). Interface state such as the music queue is kept in local storage on your device.
