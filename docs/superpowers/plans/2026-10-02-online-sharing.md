# Online Play Piece 6b: Sharing Notes and Maps Between People — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everyone in an online session who uses Atlas in Obsidian can share notes and maps with chosen people. Each person browses a **Shared with me** catalogue and pulls items into their own vault. Pulling again updates an item, and the receiver decides how their own edits and the sender's meet. Parts of a note the sender kept back never leave their machine, and nothing lands in anyone's vault unless they pulled it.

**Architecture:**
- **Identity on the wire (Task 1).**
  - The GM's Atlas has a P-256 *table key* in its settings. The table id is the SHA-256 of that key, and the join link carries it as `table=`.
  - Each Obsidian player keeps one P-256 *device key* per table in Obsidian's local storage, on that device only.
  - `join` carries a device proof: the device key signs the table id, the GM's host id and a per-join nonce. `admitted` carries a table proof: the table key signs the player's nonce and the person id the GM gives them. Each side checks the other's proof.
  - No secret ever leaves a device, and a proof made for one GM's host id is worthless at any other. A forged link therefore collects nothing reusable.
  - `SessionPlayer` and presence gain the public `personId`.
- **People (Task 2).**
  - Every Atlas keeps a people list in `atlas-vtt/.atlas-data/sharing/people.json`. Entries are keyed by table id and person id, and the GM's entries also record their device ids.
  - The GM's `IdentityDesk` marks each Obsidian join request **(known)** or **(new)**. A new request reusing a known name gets a warning, and the GM answers with **Allow**, **Link to Ana** or **Deny**.
  - Players record their GM and their fellow players from the verified `admitted` and from presence.
  - A **People** dialog renames, links and removes people.
- **Sharing model (Task 3).**
  - Notes share through the `atlas-share` property.
  - Maps share through `data.sharing` on their scene record: people by id, the mode, and the ticked linked notes. The map file format stays unchanged.
  - A line-based filter applies `[!private]`, `[!only|…]`, `[!except|…]` and `%% %%` on the sender's machine. Its callouts end fail-closed. The filter also keeps only whitelisted properties and turns links to notes the receiver does not get into plain text.
  - Map payloads are built on the sender's side:
    - player-safe uses `projectForPlayers` plus pins that are not GM-only;
    - full uses the map file with paths replaced by references.
  - The **Share with…** dialog writes the property or the scene record and previews per person.
- **Transport (Task 4).**
  - `share-*` JSON messages and binary chunks travel on the assets channel. Share chunks use handles at or above `0x8000_0000`, and image handles stay below.
  - Messages are addressed by person id. The GM stamps `from` and forwards player-to-player traffic chunk by chunk, rewriting handles. It never stores what it forwards.
  - Acknowledgements with a 1 MiB window keep every hop bounded. Limits on size, count and rate apply as for images.
- **Receiving (Task 5).**
  - The **Shared with me** dialog lists items per person as new, updated or up to date. **Pull** writes notes to `Shared/<person>/` with sanitised names and contained paths.
  - Maps land in a **Shared with me** collection with their fingerprint-checked images, written under `runExclusive`. The receiver clears every path in a received map that it did not write itself.
  - Push requests show **Pull** and **Not now**.
- **Updates and conflicts (Task 6).**
  - Atlas keeps the last pulled text of each note as the merge base, in `.atlas-data/sharing/bases/`.
  - Per note, the receiver can keep both, keep mine, take theirs, resolve conflicts or auto merge. "Remember for this note" stores the choice.
  - A three-way line merge (Myers diff, diff3) feeds the merge page.
  - Replaced text goes to the note's merge history, so any merge can be undone.
- **End to end, docs and checks (Task 7).** Three Atlases run over `MemoryTransport`. The task also adds the privacy notes and the manual test with three vaults.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), React 19, zustand (vanilla stores), Obsidian API (`file-menu`, `processFrontMatter`, `metadataCache`, `vault.adapter`, `loadLocalStorage`), Web Crypto (ECDSA P-256 with SHA-256, SHA-256), PeerJS/WebRTC (unchanged), Vitest 4 with jsdom, SCSS.

**Spec:** `docs/superpowers/specs/2026-10-02-online-sharing-design.md` (binding). Its "Future direction" section (campaigns, characters) is not in scope. The ids chosen here (a table id from a key, per-device keys, GM-given person ids) are stable, so characters can be layered on without changing shares.

Context:
- Piece 6a: spec `docs/superpowers/specs/2026-10-02-online-obsidian-player-design.md`, plan `docs/superpowers/plans/2026-10-02-online-obsidian-player.md`. It provides `OnlineJoinService`, `PlayerSession` with `clientKind: 'obsidian'`, the Online scene view and `playerSceneToAtlasState`.
- Earlier pieces: `docs/superpowers/plans/2026-09-*.md` and `2026-10-01-*.md`.

## Global Constraints

- **Never run `npm run build`**: its `postbuild` copies the plugin into the user's vault. Build with `npm run build:ci`, and the join page with `npm run build:online`.
- **The full check**, run at the end of every task: `npx tsc --noEmit && npm run lint && npx vitest run`.
  - Tasks 1 and 4 also run `npm run build:online`, because they change `protocol.ts`, `joinLink.ts` and the asset server, which the web page shares.
  - Each task lists the focused test files to run first.
- **Commits:** stage only the files the task names (`git add <paths>`, never `git add -A`; other work happens on this branch), and end each message with the session's attribution lines.
- **Obsidian clients only.** The web page is unchanged in behaviour:
  - It still sends `kind: 'web'` and no `device`, and it never receives `share-*` messages.
  - It keeps parsing links that carry `table=`.
  - Protocol version stays `1`. Every new wire field is optional, so older clients and pages keep working.
- **Identity:**
  - The **table id** is `base64url(SHA-256(SPKI of the table public key))`: 43 characters, `[A-Za-z0-9_-]`. The **device id** is computed the same way from a device public key.
  - The **join link** gains `table=<table id>`: `<page>#id=<host>&table=<table id>[&signal=…][&ice=…]`. A malformed `table` value is ignored (the link works, sharing is off).
  - **Device proof:**
    - Fields: `{ table, key, nonce, sig }`.
    - Signed text: `atlas-device-v1|<table>|<GM host id>|<nonce>`.
    - `nonce` is `randomId()`, one per join (kept across that join's reconnects).
  - **Table proof:**
    - Fields: `{ id, key, personId, gmName, sig }`.
    - Signed text: `atlas-table-v1|<table id>|<player nonce>|<personId>`.
  - The player accepts a table proof only when its key hashes to the link's table id and the signature checks.
  - The GM accepts a device proof only when the table is its own, the host id is its current host id and the signature checks.
  - A failed device proof is denied with the reason `denied`. A failed table proof leaves the session playable with sharing off.
  - **Keys:**
    - Algorithm: ECDSA P-256, SHA-256.
    - Public keys: SPKI in base64url. Signatures: raw (IEEE P1363) in base64url.
    - The GM's private key is a JWK in Atlas's settings (`online.table`). Players' private keys are JWKs in Obsidian local storage under the key `atlas-online-device-keys`, one per table id. Neither is ever sent.
  - The GM's own person id, in every player's people list, is `gm`. The GM gives players `randomId()` person ids.
- **People list:**
  - Stored in `atlas-vtt/.atlas-data/sharing/people.json`.
  - Entries: `{ tableId, personId, name, formerNames, devices, aliases, lastSeen }`.
  - Names are unique within each list, compared case-insensitively. A taken name gets ` (2)`, ` (3)`, … when someone is added.
  - Rename and link keep every reference by id: map shares hold person keys `<tableId>/<personId>`, and names in notes also resolve through `formerNames`.
- **Join requests** (the notice and the online panel):
  - Text: `Ana wants to join your online session.` followed by `(known)`, `(new)` or nothing for web players.
  - Warning on a new id with a taken name: `Someone named Ana is already in your people list`.
  - Buttons:
    - **Allow** (`mod-cta` / `default`) and **Deny** for every request;
    - **Link to Ana** only beside that warning.
  - Only the GM links.
- **`atlas-share`** (property name exactly `atlas-share`):
  - `public`: everyone in a session with me (Obsidian people with a person id).
  - `private`: nobody. This is also the default without the property.
  - `[Ana, Ben]`: only Ana and Ben, the same as `[only Ana, only Ben]`.
  - `[public, except Cara]`: everyone except Cara.
  - `private` wins over everything and `except` over a name. Keywords are case-insensitive.
  - The property itself is never sent.
  - The dialog writes `public`, `[public, except Cara]` or `[Ana, Ben]`, and removes the property when nothing is ticked. It reads the property back after writing.
- **Private parts:**
  - `> [!private]` is never shared.
  - `> [!only|Ana, Ben]` goes only to those people.
  - `> [!except|Cara]` goes to everyone the note is shared with, except Cara.
  - `%% … %%` is never shared, inline or across lines, outside code fences.
  - Callout types are case-insensitive. A section nested in another must pass every rule.
  - Unknown names: in `only` an unknown name matches nobody; in `except` an unknown name hides the section from everyone. The sender gets the warning `Not in your people list: Cara.`
  - **A callout ends only at a blank line, a heading line or a code fence at a lower quote depth** (fail-closed: Obsidian continues a callout's paragraph onto following lines lazily).
- **Frontmatter:** stripped except the properties listed in **Settings → Online play → Shared note properties** (`online.shareableProperties`, default `tags, aliases`). `atlas-share` is always stripped.
- **Links:** `[[Note]]`, `[[Note|text]]`, `[[Note#Heading]]`, `![[…]]` embeds and `[text](Note.md)`:
  - A link to a note the receiver also gets becomes `[[<that note's shared title>…]]`.
  - Every other link becomes its plain text: the alias, or the note name.
- **Maps:**
  - **Player-safe** (the default) is exactly what online players get (`projectForPlayers` with the GM's local player view rules), plus pins that are not `gmOnly`.
  - **Full** is the whole map. Choosing Full asks first: `Share the full map?` / `A full share sends everything on this map, as a co-GM would see it: hidden tokens, GM-only pins, walls and lights.` / **Share full map**.
  - Linked notes (pins' and tokens' `notePath`, tokens' `statblockPath`) are ticked by the sender. A player-safe share never offers notes behind GM-only pins or hidden tokens. A note whose `atlas-share` is `private` is listed but cannot be ticked (`Private`).
- **Copy:**
  - Commands:
    - `people`: `People…`
    - `share-with`: `Share with…`
    - `shared-with-me`: `Shared with me…`
    - `ask-to-pull`: `Ask to pull…` (during a share session)
    - `undo-shared-merge`: `Undo last merge`
  - File menu items: `Share with…`, and `Ask to pull…` during a share session. Dialog titles: `People`, `Share with`, `Shared with me`, `Merge`.
  - Share dialog:
    - Option: `Everyone in my sessions`.
    - Map modes: `Player-safe` and `Full`.
    - Preview: `Preview as`.
  - Item states: `New`, `Updated`, `Up to date`. Buttons: `Pull`, `Pull update`.
  - Push request: `Ana asks you to pull Goblin cave.` with **Pull** and **Not now**.
  - Update dialog:
    - Title: `Goblin cave changed on both sides`.
    - Buttons: **Keep both**, **Keep mine**, **Take theirs**, **Resolve conflicts**, **Auto merge**.
    - Checkboxes: `Remember for this note` and `Save auto merges without showing them`.
  - Merge page:
    - Columns: `Mine`, `Base`, `Theirs`.
    - Per conflict: **Keep mine**, **Take theirs**, **Keep both**.
    - Result: `Result` (editable). Buttons: **Save merge** and **Cancel**.
    - Next time: `For conflicts next time`.
- **Where things land:**
  - Notes go to `Shared/<person>/<title>.md`.
  - Keep both saves `Shared/<person>/<title> (from <person>).md`.
  - Maps go into the collection `Shared with me`:
    - scene files: `atlas-vtt/collections/Shared with me/scenes/<person>/<name>.atlasmap`;
    - images: `atlas-vtt/collections/Shared with me/files/<person>/<fingerprint>.<ext>`.
  - Names:
    - `safeFileName` strips `\ / : * ? " < > | # ^ [ ]` and control characters, and trims dots and spaces.
    - Windows reserved names get a trailing `_`.
    - At most 100 characters; empty becomes `Untitled`.
    - A taken name gets ` (2)`, ` (3)`, ….
  - Every written path is checked with `isInside(path, folder)` after `normalizePath`.
- **Atlas data** (`atlas-vtt/.atlas-data/sharing/`, through `vault.adapter`, never indexed):
  - `people.json`;
  - `items.json` (the sender's note item ids, following renames);
  - `pulled.json` (the receiver's pulled items, choices and versions);
  - `bases/<key>.md`;
  - `history/<key>.json` (at most 20 entries per note).
- **Limits** (`SHARE_LIMITS`):

  | Limit | Value |
  | --- | --- |
  | Note size | 2 MiB |
  | Map payload | 16 MiB |
  | Image | `ASSET_LIMITS.fileBytes` (64 MiB) |
  | Catalogue | 500 items |
  | Share message | 256 KiB |
  | Ack window | 1 MiB, acks every 256 KiB |
  | Transfers | 4 incoming per peer; one outgoing transfer at a time per requester, with 16 queued pulls |
  | Requests | 10 per second per person (`RateLimit`); a sender sees at most one pending push per item per receiver |
  | Timeouts | 15 s for a request; 60 s without progress on a transfer |

- **Vault rules** (repo `CLAUDE.md`):
  - New maps are written with their scene record under `assetService.runExclusive` (`addAsset` inside).
  - A copied scene drops `data.sharing`.
  - Never hard-code `'default'`.
  - Validate the collection name with `collectionNameProblem`.
- **Styling** (repo `CLAUDE.md`):
  - Obsidian modals add `ATLAS_NATIVE_MODAL_CLASSES` to `modalEl` (their close control is Atlas's `CloseButton` look).
  - Contents are React with Atlas's `Button` and `LabelTooltip` (never a `title` attribute; `aria-label` only names controls).
  - SCSS classes, not Tailwind, and uniform padding equal to the gap. Sentence-case copy.
  - The online panel keeps its look (`atlas-online-panel__*`).
- **Files** stay under 300 lines; every function has an explicit return type; no `any`.

## Review Focus

1. **A private, only or except part never leaves the sender.**
   - Filtering runs on the sender before hashing or sending. A callout followed by a lazy-continuation line, a nested callout, `%%` across lines and an unknown name all fail closed.
   - The catalogue's version is the hash of the filtered text, so edits to private parts never show as `Updated`.
   - Tests:
     - Task 3: `noteFilter.test.ts`, "lazy continuation stays private" and "unknown names".
     - Task 4: `shareNode.test.ts`, "sends only the filtered text".
2. **A share can never write outside its folder or reach the receiver's own files.**
   - Titles like `../../.obsidian/plugins/x`, `CON`, `a/b`, `..` and empty land inside `Shared/<person>/`.
   - A received full map naming `Private/secret.md`, `atlas-vtt/assets/mine.png` or any other path the receiver did not write has those paths cleared before the file is saved.
   - Tests:
     - Task 5: `safePaths.test.ts`.
     - Task 5: `mapPull.test.ts`, "clears paths it did not write".
3. **Nothing lands without a pull.**
   - A push only shows a prompt. Listing writes nothing.
   - Auto merge and silent saves run only inside a pull the receiver started.
   - A map's linked notes land only when ticked in the receiver's pull.
   - Tests:
     - Task 5: `sharedWithMe.test.ts`, "a push writes nothing".
     - Task 5: `mapPull.test.ts`, "linked notes only when ticked".
     - Task 6: `noteUpdate.test.ts`, "auto merge only on pull".
4. **The GM forwards player-to-player items without storing them.**
   - The relay holds only handle mappings. It forwards each chunk as it arrives and holds no bytes after the call returns.
   - It drops mappings when either side leaves, writes nothing to the vault, and keeps every hop within the 1 MiB window.
   - Test: Task 4, `shareRelay.test.ts`, "forwards without storing".
5. **Identity cannot be taken over by typing a name or by a forged link.**
   - Typing a known name joins as **(new)** with the warning.
   - A proof bound to another host id is denied.
   - A player reconnecting with a known session key keeps their person id, and nobody else's.
   - An admitted proof from a different table key turns sharing off.
   - Tests:
     - Task 1: `identityProofs.test.ts`.
     - Task 1: `onlineJoinIdentity.test.ts`, "forged table proof".
     - Task 2: `identityDesk.test.ts`, "a typed name is not an identity".

## Rulings on spec ambiguities

1. **The player id is a key, not a secret string.**
   - The spec calls for "a long random secret kept on the player's device, presented on every join". Sent as a bearer value, such a secret would go to whoever's link names the table: a fellow player could send Ana a link to their own host carrying the real table id, collect her secret, and join the real table as "(known) Ana".
   - So each device keeps a private key per table and presents a signature instead. The signature is bound to the GM's host id, so it is worthless at any other host.
   - The GM also proves its table to the player, so a fake GM cannot pull what was shared with the real one.
   - `playerKey` stays 6a's per-host session key, used only to recognise reconnects within one session.
2. **Person ids are given by the GM, and the GM vouches for `from`.**
   - Player-to-player items pass through the GM, which stamps the sender's person id. Players trust their GM for who is who; the GM could impersonate anyone at its table anyway.
   - Shares apply only in a session whose table matches the person's table (keys `<tableId>/<personId>`).
3. **Names in notes, ids in maps.**
   - `atlas-share` and callouts name people, as the spec shows. A name resolves through the people list: a current name first, then former names.
   - Renaming keeps the old name in `formerNames`, so notes that say `Ana` still reach the renamed person. Map shares store person keys.
   - Names are unique per list, so a name never means two people.
4. **"Link" in the People dialog** merges one person into another, for the same person on two devices or at two tables. The kept entry gains the other's devices, former names and an alias for its key, and shares to either key reach it.
5. **Map shares live on the scene record** (`SceneAsset.data.sharing`, mirrored into the scene's JSON). The spec's "the scene's data" is read as that record, so the `.atlasmap` format, `partialize` and migrations are untouched. The vault check's `adoptSceneJson` already keeps unknown `data` fields; a test pins it. A copy made by `transferAssets` drops `data.sharing`.
6. **Item ids are random.**
   - Notes get a `randomId()` in the sender's `items.json`, which follows renames and deletions. Maps keep theirs in `data.sharing.item`.
   - Paths never leave the sender.
   - Images of a map are addressed as `<map item>/<fingerprint>` and served only to someone the map is shared with.
7. **Versions are hashes of what is sent**: SHA-256 of the filtered note, or of the map payload. `Updated` means the receiver's copy differs from what the sender would send them now.
8. **Links are rewritten by the sender**, who alone knows which notes the receiver gets. Embeds of non-note files become their file name as text: notes are Markdown text only.
9. **Map updates are replaced, not merged.** Re-pulling a map overwrites the received scene. If the receiver changed the received file since the last pull, they choose **Keep both** (a second scene) or **Take theirs**. Merging map data is not in the spec.
10. **"Pick one; the other set aside":**
    - **Take theirs** writes the sender's version and puts the replaced text in the merge history (undoable).
    - **Keep mine** leaves the file and keeps theirs as the new base, so a later pull compares against it.
11. **Auto merge's conflict default**: each note keeps a conflict default (`mine`, `theirs` or `both`, default `both`), set on the merge page. Auto merge applies one-sided changes, uses that default for conflicts, and shows the result in the merge page unless `Save auto merges without showing them` is on for the note.
12. **The People, Share with…, Shared with me and Merge "panels" are Obsidian modals** in Atlas's native modal style, with React content. They work outside map views (players live in the Online scene tab, the GM in any map), and the 6a Join dialog is one too.
13. **The GM's name** in players' lists is `normalizePlayerName(online.playerName) ?? 'GM'`, sent in the table proof.
14. **Who is "in my sessions"**: `public` reaches every person with a person id in the current session's table, that is every admitted Obsidian player and, for players, their GM. Web players have no person id and receive nothing.

## Items for the controller to decide

1. **The GM's private table key lives in Atlas's settings file** (`atlas-vtt/.atlas-data/settings.json`), which syncs with the vault. Anyone who can read the vault can act as that table. Moving it to local storage would make two machines of one GM two different tables.
2. **The GM sees relayed items.** Player-to-player items are encrypted on each hop, but the GM's Atlas handles them in clear while forwarding. The privacy note says so. End-to-end encryption between players is not in the spec.
3. **Seven tasks, not six.** Identity on the wire and the people list are split, because each is a reviewable unit with its own tests.
4. **Map merges** (ruling 9) and **plain-text previews** are simplifications that a later piece could revisit. The share preview shows the filtered Markdown as text, not rendered.
5. **The manual test (Task 7, step 7)** needs three vaults (GM and two players), run by the user.
6. **Image hashing on the sender**: `SenderCatalogue` reads and hashes a map's images on every list and every open, a single image pull included. A fingerprint cache by path and mtime (as `AssetRegistry` keeps per session) would help large maps; it is left out to keep the catalogue stateless.
7. **Ask to pull…** was added as the sending side of push requests, which the spec implies but does not name.

## File Structure

New, under `src/app/online/sharing/` unless noted. Each file has one job.

- `identity/identityCrypto.ts`: `IdentityCrypto` (generate, sign, verify, keyId), `webIdentityCrypto` (Web Crypto), `KeyPairJwk`, `TableIdentity`.
- `identity/proofs.ts`: proof texts; make and check device and table proofs.
- `identity/deviceKeys.ts`: a player's key per table in Obsidian local storage (`KeyValueStore`, `obsidianLocalStore`, `DeviceKeys`).
- `identity/tableKey.ts`: the GM's table key in Atlas's settings (`ensureTableIdentity`).
- `dataFile.ts`: `JsonDataFile`, a JSON file in `atlas-vtt/.atlas-data/sharing/` through the adapter, with serialized writes.
- `people/peopleTypes.ts`: `Person`, `GM_PERSON_ID`, `personKey`, `PeopleData` parsing.
- `people/peopleNames.ts`: `nameKey`, `uniqueName`.
- `people/PeopleBook.ts`: the people list: lookups, admit, link, seen, rename, merge, remove, persistence.
- `people/IdentityDesk.ts`: the GM's side of an Obsidian join: verify, known/new, admission proofs.
- `people/sessionPeople.ts`: a player records their GM and fellow players.
- `people/ui/PeopleModal.tsx`, `people/ui/PeopleList.tsx`, `people/ui/people.scss`: the People dialog.
- `model/shareRule.ts`: `atlas-share` parse and format.
- `model/audience.ts`: names to people; who a rule reaches.
- `model/frontmatterFilter.ts`: split frontmatter; keep whitelisted top-level properties.
- `model/noteFilter.ts`: callouts and comments, per recipient (fail-closed).
- `model/noteLinks.ts`: link rewriting.
- `model/ShareItems.ts`: random item ids for shared notes, following renames.
- `model/mapShare.ts`: `MapShare` on scene records; read, validate, write.
- `model/linkedNotes.ts`: notes linked from a map's pins and tokens.
- `model/mapPayload.ts`: the map payload wire types and their validation (shared by sender and receiver).
- `model/buildMapPayload.ts`: player-safe and full payloads from a map file.
- `model/SenderCatalogue.ts`: what one requester may list and open.
- `ui/ShareWithModal.tsx`, `ui/ShareWithForm.tsx`, `ui/sharing.scss`: the Share with… dialog and preview.
- `registerSharing.ts`: commands, the file menu, vault rename/delete hooks.
- `transport/shareLimits.ts`, `transport/shareProtocol.ts`: limits; `share-*` messages, validation, handle range.
- `transport/OutgoingTransfers.ts`, `transport/IncomingTransfers.ts`: windowed chunked sends; assembly with acks.
- `transport/ShareNode.ts`: one Atlas's endpoint in a session: serves the catalogue, pulls, pushes.
- `transport/ShareRelay.ts`: the GM's forwarding of player-to-player messages and chunks.
- `transport/GmShareHost.ts`: the GM's `SessionHandler`: routes to its own node or the relay.
- `transport/PlayerShareLink.ts`: the player's assets-channel handler for its node.
- `shareSessionStore.ts`: the current share session (node, table, people present) for the UI.
- `receive/safePaths.ts`: `safeFileName`, `isInside`, `freePath`.
- `receive/PulledItems.ts`: what was pulled from whom: paths, versions, choices, bases.
- `receive/notePull.ts`: write a pulled note; hand updates to the update policy.
- `receive/receivedMap.ts`: received map payload to an Atlas map file, with the path allowlist.
- `receive/mapPull.ts`: images, the map file and its scene record in `Shared with me`.
- `receive/SharedWithMe.ts`: per session, lists, statuses, pulls and push prompts.
- `receive/ui/SharedWithMeModal.tsx`, `receive/ui/pushPrompt.ts`, `receive/ui/shared-with-me.scss`.
- `merge/diffLines.ts`: Myers line diff.
- `merge/diff3.ts`: three-way chunks.
- `merge/mergeResult.ts`: chunks plus choices to text.
- `merge/MergeHistory.ts`: replaced texts, undo.
- `merge/noteUpdate.ts`: the update policy.
- `merge/ui/UpdateChoiceModal.tsx`, `merge/ui/MergeModal.tsx`, `merge/ui/merge.scss`.

Modified:
- `online/protocol.ts`, `online/joinLink.ts`, `online/onlineSettings.ts`, `online/gmSessionTypes.ts`, `online/GmSession.ts`, `online/PlayerSession.ts`, `online/OnlineSessionService.ts`, `online/onlineSessionStore.ts`, `online/obsidian/OnlineJoinService.ts`, `online/assets/AssetServer.ts`, `online/ui/joinRequestNotice.ts`, `online/ui/onlineCopy.ts`, `online/registerOnline.ts`.
- `react/components/online/OnlinePlayerList.tsx`, `react/components/online/online-panel.scss`.
- `settings/onlineSettingsSection.ts`, `services/assetTransfer/transferRecords.ts`, `styles/main.scss`, `main.ts`.
- `PRIVACY.md`, `README.md`, `docs/online-play-features.md`.

Tests go in `tests/unit/online/sharing/`, and the shared fixtures in `tests/unit/online/sharing/sharingFixtures.ts`.

---
### Task 1: Identity on the wire

The GM's Atlas gets a table key, and its join links carry the table id. An Obsidian player keeps a key per table on their device. Their `join` carries a proof made with it, bound to the GM's host id, and the GM's `admitted` carries a proof of the table, bound to the player's nonce and naming their person id. `SessionPlayer` and presence carry the person id. No secret is ever sent. Nothing in this task decides who is known: the GM's session passes the device proof out and admits with whatever person id it is given (Task 2 decides).

**Files:**
- Create: `src/app/online/sharing/identity/identityCrypto.ts`
- Create: `src/app/online/sharing/identity/proofs.ts`
- Create: `src/app/online/sharing/identity/deviceKeys.ts`
- Create: `src/app/online/sharing/identity/tableKey.ts`
- Modify: `src/app/online/protocol.ts` (`DeviceProof`, `TableProof`, `join.device`, `admitted.table`, `PresencePlayer.personId`, validators)
- Modify: `src/app/online/joinLink.ts` (`table=`)
- Modify: `src/app/online/onlineSettings.ts` (`table`)
- Modify: `src/app/online/gmSessionTypes.ts`, `src/app/online/GmSession.ts`
- Modify: `src/app/online/PlayerSession.ts` (`device` option, `table` getter)
- Modify: `src/app/online/obsidian/OnlineJoinService.ts` (device proof, verification, `identity`)
- Modify: `src/app/online/OnlineSessionService.ts` (table id in the link)
- Test: `tests/unit/online/sharing/sharingFixtures.ts`
- Test: `tests/unit/online/sharing/identityProofs.test.ts`
- Test: `tests/unit/online/sharing/deviceKeys.test.ts`
- Test: `tests/unit/online/sharing/identityWire.test.ts`
- Test: `tests/unit/online/sharing/gmSessionIdentity.test.ts`
- Test: `tests/unit/online/sharing/onlineJoinIdentity.test.ts`
- Modify (expectations): `tests/unit/online/joinLink.test.ts`, `tests/unit/online/onlineSessionService.test.ts`

**Interfaces:**
- Consumes: `randomId`, `base64Url` (`online/ids.ts`); `GmSession`, `PlayerSession`, `OnlineJoinService` from 6a; `MemoryNetwork`.
- Produces:
  - From `identityCrypto.ts`:
    - `interface KeyPairJwk { publicKey: string; privateKey: JsonWebKey }`
    - `interface TableIdentity { id: string; keys: KeyPairJwk }`
    - `interface IdentityCrypto { generate(): Promise<KeyPairJwk>; sign(privateKey, text): Promise<string>; verify(publicKey, text, signature): Promise<boolean>; keyId(publicKey): Promise<string> }`
    - `webIdentityCrypto`, `fromBase64Url(text): Uint8Array<ArrayBuffer>`
  - From `proofs.ts`: `deviceProofText`, `tableProofText`, `makeDeviceProof(crypto, keys, table, hostId, nonce)`, `checkDeviceProof(crypto, proof, table, hostId): Promise<string | null>` (the device id), `makeTableProof(crypto, table, nonce, personId, gmName)`, `checkTableProof(crypto, proof, tableId, nonce): Promise<boolean>`.
  - From `deviceKeys.ts`: `interface KeyValueStore { get(key): unknown; set(key, value): void }`, `memoryKeyValueStore()`, `obsidianLocalStore(app)`, `DEVICE_KEYS_STORAGE`, `class DeviceKeys { forTable(tableId): Promise<KeyPairJwk> }`.
  - From `tableKey.ts`: `ensureTableIdentity(settings, crypto): Promise<TableIdentity>`.
  - From `protocol.ts`:
    - `interface DeviceProof { table; key; nonce; sig }`
    - `interface TableProof { id; key; personId; gmName; sig }`
    - `isKeyId(value)`, `isPersonId(value)`
    - `PresencePlayer.personId?: string`
  - `JoinTarget.tableId: string | null`; `buildJoinUrl(pageUrl, hostId, settings, tableId?: string | null)`.
  - `OnlineSettings.table: StoredTable | null` with `StoredTable { id; publicKey; privateKey }`.
  - `SessionPlayer.personId?: string`; `GmSessionOptions.onJoinRequest(player, device: DeviceProof | null)`; `GmSession.allow(playerId, admission?: Admission)` with `Admission { personId: string; table: TableProof }`; `GmSession.personOf(playerId): string | null`.
  - `PlayerSessionOptions.device?: DeviceProof`; `PlayerSession.table: TableProof | null`.
  - `OnlineJoinService.identity: SessionIdentity | null` with `SessionIdentity { tableId; personId; gmName }`; `OnlineJoinService.onIdentity(listener): () => void`; `OnlineJoinDeps.identityCrypto?`, `OnlineJoinDeps.deviceKeys?`.
  - `OnlineSessionService` `Deps.table?: () => Promise<TableIdentity | null>` and `Deps.identityCrypto?: IdentityCrypto`; `OnlineSessionService.table: TableIdentity | null` (while hosting); `OnlineSessionService.hostId: string | null`.

- [ ] **Step 1: Write the shared fixtures**

Create `tests/unit/online/sharing/sharingFixtures.ts`:

```ts
/**
 * Fixtures for sharing tests. Node's crypto resolves at once, so tests driven by fake timers
 * never wait on Web Crypto, which finishes outside their control (as `nodeHash` for images).
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { IdentityCrypto, KeyPairJwk } from '../../../../src/app/online/sharing/identity/identityCrypto';

export const nodeIdentityCrypto: IdentityCrypto = {
  generate: (): Promise<KeyPairJwk> => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return Promise.resolve({
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
      privateKey: privateKey.export({ format: 'jwk' }) as JsonWebKey,
    });
  },
  sign: (privateKey: JsonWebKey, text: string): Promise<string> => Promise.resolve(
    sign('sha256', Buffer.from(text), { key: createPrivateKey({ key: privateKey as never, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
      .toString('base64url'),
  ),
  verify: (publicKey: string, text: string, signature: string): Promise<boolean> => {
    try {
      const key = createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' });
      return Promise.resolve(verify('sha256', Buffer.from(text), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
    } catch {
      return Promise.resolve(false);
    }
  },
  keyId: (publicKey: string): Promise<string> =>
    Promise.resolve(createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url')),
};

/** A table identity for tests: a fresh key and its id. */
export async function testTable(): Promise<{ id: string; keys: KeyPairJwk }> {
  const keys = await nodeIdentityCrypto.generate();
  return { id: await nodeIdentityCrypto.keyId(keys.publicKey), keys };
}
```

- [ ] **Step 2: Write the failing proof tests**

Create `tests/unit/online/sharing/identityProofs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { webIdentityCrypto } from '../../../../src/app/online/sharing/identity/identityCrypto';
import {
  checkDeviceProof, checkTableProof, deviceProofText, makeDeviceProof, makeTableProof,
} from '../../../../src/app/online/sharing/identity/proofs';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

describe('device proofs', () => {
  it('stand for the device key and check only for their table and host', async () => {
    const table = await testTable();
    const device = await crypto.generate();
    const proof = await makeDeviceProof(crypto, device, table.id, 'host-1', 'nonce-aaaaaaaaaaaaaaaa');
    const deviceId = await crypto.keyId(device.publicKey);
    expect(await checkDeviceProof(crypto, proof, table.id, 'host-1')).toBe(deviceId);
    // Made for another host: a forged link's host collects a proof worthless at the real GM.
    expect(await checkDeviceProof(crypto, proof, table.id, 'host-2')).toBeNull();
    expect(await checkDeviceProof(crypto, proof, (await testTable()).id, 'host-1')).toBeNull();
  });

  it('fail for a changed nonce, a signature of other text or another key', async () => {
    const table = await testTable();
    const device = await crypto.generate();
    const other = await crypto.generate();
    const proof = await makeDeviceProof(crypto, device, table.id, 'h', 'nonce-aaaaaaaaaaaaaaaa');
    expect(await checkDeviceProof(crypto, { ...proof, nonce: 'nonce-bbbbbbbbbbbbbbbb' }, table.id, 'h')).toBeNull();
    expect(await checkDeviceProof(crypto, { ...proof, key: other.publicKey }, table.id, 'h')).toBeNull();
    const wrongText = await crypto.sign(device.privateKey, `${deviceProofText(table.id, 'h', proof.nonce)}x`);
    expect(await checkDeviceProof(crypto, { ...proof, sig: wrongText }, table.id, 'h')).toBeNull();
    expect(await checkDeviceProof(crypto, { ...proof, key: 'not base64 !!' }, table.id, 'h')).toBeNull();
  });
});

describe('table proofs', () => {
  it('check against the link table id and the player nonce', async () => {
    const table = await testTable();
    const proof = await makeTableProof(crypto, table, 'nonce-aaaaaaaaaaaaaaaa', 'person-1', 'Morgan');
    expect(proof).toMatchObject({ id: table.id, personId: 'person-1', gmName: 'Morgan' });
    expect(await checkTableProof(crypto, proof, table.id, 'nonce-aaaaaaaaaaaaaaaa')).toBe(true);
    expect(await checkTableProof(crypto, proof, table.id, 'nonce-bbbbbbbbbbbbbbbb')).toBe(false);
    expect(await checkTableProof(crypto, { ...proof, personId: 'person-2' }, table.id, 'nonce-aaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('fail for a key that does not hash to the table id, even when signed with it', async () => {
    const real = await testTable();
    const fake = await testTable();
    // A fake GM signs with its own key but claims the real table id.
    const forged = { ...(await makeTableProof(crypto, fake, 'n-aaaaaaaaaaaaaaaaaaaa', 'p', 'GM')), id: real.id };
    expect(await checkTableProof(crypto, forged, real.id, 'n-aaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });
});

describe('Web Crypto', () => {
  it('signs what node verifies and the other way round, with the same key ids', async () => {
    const web = await webIdentityCrypto.generate();
    const node = await crypto.generate();
    expect(await webIdentityCrypto.keyId(web.publicKey)).toBe(await crypto.keyId(web.publicKey));
    expect(await crypto.verify(web.publicKey, 'hello', await webIdentityCrypto.sign(web.privateKey, 'hello'))).toBe(true);
    expect(await webIdentityCrypto.verify(node.publicKey, 'hello', await crypto.sign(node.privateKey, 'hello'))).toBe(true);
    expect(await webIdentityCrypto.verify(node.publicKey, 'hellO', await crypto.sign(node.privateKey, 'hello'))).toBe(false);
    expect(await webIdentityCrypto.verify('%%%', 'hello', 'AAAA')).toBe(false);
  });
});
```

Create `tests/unit/online/sharing/deviceKeys.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DEVICE_KEYS_STORAGE, DeviceKeys, memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { ensureTableIdentity } from '../../../../src/app/online/sharing/identity/tableKey';
import { DEFAULT_ONLINE_SETTINGS, resolveOnlineSettings, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import { nodeIdentityCrypto as crypto } from './sharingFixtures';

describe('device keys', () => {
  it('keeps one key per table on the device, made once', async () => {
    const store = memoryKeyValueStore();
    const generate = vi.spyOn(crypto, 'generate');
    const keys = new DeviceKeys(store, crypto);
    const [a, again] = await Promise.all([keys.forTable('table-a'), keys.forTable('table-a')]);
    expect(again).toEqual(a);
    expect(generate).toHaveBeenCalledTimes(1);
    const b = await keys.forTable('table-b');
    expect(b.publicKey).not.toBe(a.publicKey);
    // A new service on the same device finds them.
    expect(await new DeviceKeys(store, crypto).forTable('table-a')).toEqual(a);
    generate.mockRestore();
  });

  it('replaces a broken stored key', async () => {
    const store = memoryKeyValueStore();
    store.set(DEVICE_KEYS_STORAGE, { 'table-a': { publicKey: 1, privateKey: 'x' } });
    const keys = await new DeviceKeys(store, crypto).forTable('table-a');
    expect(typeof keys.publicKey).toBe('string');
    expect(keys.privateKey).toMatchObject({ kty: 'EC', crv: 'P-256' });
  });
});

describe('table key', () => {
  function settings(): { getOnlineSettings(): OnlineSettings; setOnlineSettings(partial: Partial<OnlineSettings>): void } {
    let online = { ...DEFAULT_ONLINE_SETTINGS };
    return { getOnlineSettings: () => online, setOnlineSettings: (partial) => { online = { ...online, ...partial }; } };
  }

  it('is made on first use, kept in the settings and stable', async () => {
    const source = settings();
    const first = await ensureTableIdentity(source, crypto);
    expect(first.id).toBe(await crypto.keyId(first.keys.publicKey));
    expect(source.getOnlineSettings().table).toEqual({ id: first.id, publicKey: first.keys.publicKey, privateKey: first.keys.privateKey });
    expect(await ensureTableIdentity(source, crypto)).toEqual(first);
  });

  it('survives stored settings of any shape', async () => {
    const source = settings();
    const made = await ensureTableIdentity(source, crypto);
    expect(resolveOnlineSettings(JSON.parse(JSON.stringify(source.getOnlineSettings()))).table).toEqual(source.getOnlineSettings().table);
    expect(resolveOnlineSettings({ table: { id: 'short', publicKey: made.keys.publicKey, privateKey: {} } }).table).toBeNull();
    expect(resolveOnlineSettings({}).table).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing wire tests**

Create `tests/unit/online/sharing/identityWire.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildJoinUrl, parseJoinFragment, parseJoinLink } from '../../../../src/app/online/joinLink';
import { DEFAULT_ONLINE_SETTINGS } from '../../../../src/app/online/onlineSettings';
import { decodeControl, encodeControl } from '../../../../src/app/online/protocol';

const TABLE = 'T'.repeat(43);
const KEY = 'K'.repeat(120);
const SIG = 'S'.repeat(86);
const NONCE = 'N'.repeat(22);

describe('join links with a table', () => {
  it('carry the table id after the host id and read it back', () => {
    const url = buildJoinUrl('https://example.org/atlas/', 'gm1', DEFAULT_ONLINE_SETTINGS, TABLE);
    expect(url).toBe(`https://example.org/atlas/#id=gm1&table=${TABLE}`);
    expect(parseJoinLink(url)).toMatchObject({ hostId: 'gm1', tableId: TABLE });
  });

  it('ignore a malformed table id and still join', () => {
    expect(parseJoinFragment('#id=gm1&table=short')).toMatchObject({ hostId: 'gm1', tableId: null });
    expect(parseJoinFragment(`#id=gm1&table=${TABLE}!`)).toMatchObject({ tableId: null });
    expect(buildJoinUrl('https://example.org/', 'gm1', DEFAULT_ONLINE_SETTINGS, 'bad')).toBe('https://example.org/#id=gm1');
  });

  it('still parse as the web page does: host and servers unchanged', () => {
    expect(parseJoinFragment(`#id=gm1&table=${TABLE}`)?.hostId).toBe('gm1');
    expect(parseJoinFragment('#id=gm1')).toMatchObject({ hostId: 'gm1', tableId: null });
  });
});

describe('identity fields on the wire', () => {
  const join = (device: unknown): string => JSON.stringify({
    v: 1, type: 'join', name: 'Ana', playerKey: 'k', client: { kind: 'obsidian', version: '1' }, ...(device === undefined ? {} : { device }),
  });

  it('accept a join with or without a well-formed device proof', () => {
    expect(decodeControl(join(undefined)).kind).toBe('message');
    expect(decodeControl(join({ table: TABLE, key: KEY, nonce: NONCE, sig: SIG }))).toMatchObject({ kind: 'message' });
    expect(decodeControl(join({ table: 'x', key: KEY, nonce: NONCE, sig: SIG }))).toEqual({ kind: 'invalid', reason: 'bad-join' });
    expect(decodeControl(join({ table: TABLE, key: 'K'.repeat(400), nonce: NONCE, sig: SIG }))).toEqual({ kind: 'invalid', reason: 'bad-join' });
    expect(decodeControl(join('device'))).toEqual({ kind: 'invalid', reason: 'bad-join' });
  });

  it('accept an admission with a table proof and presence with person ids', () => {
    const table = { id: TABLE, key: KEY, personId: 'p_1', gmName: 'Morgan', sig: SIG };
    expect(decodeControl(encodeControl({ v: 1, type: 'admitted', playerId: 'x', session: { title: 'V' }, table })).kind).toBe('message');
    expect(decodeControl(JSON.stringify({ v: 1, type: 'admitted', playerId: 'x', session: { title: 'V' }, table: { ...table, personId: 'bad id' } })).kind)
      .toBe('invalid');
    expect(decodeControl(encodeControl({ v: 1, type: 'presence', players: [{ playerId: 'a', name: 'Ana', connected: true, personId: 'p_1' }] })).kind)
      .toBe('message');
    expect(decodeControl(JSON.stringify({ v: 1, type: 'presence', players: [{ playerId: 'a', name: 'Ana', connected: true, personId: 7 }] })).kind)
      .toBe('invalid');
  });
});
```

Create `tests/unit/online/sharing/gmSessionIdentity.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmSession, type SessionPlayer } from '../../../../src/app/online/GmSession';
import { decodeControl, encodeControl, type ControlMessage, type DeviceProof, type TableProof } from '../../../../src/app/online/protocol';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';

const DEVICE: DeviceProof = { table: 'T'.repeat(43), key: 'K'.repeat(120), nonce: 'N'.repeat(22), sig: 'S'.repeat(86) };
const TABLE: TableProof = { id: 'T'.repeat(43), key: 'G'.repeat(120), personId: 'ana_1', gmName: 'Morgan', sig: 'S'.repeat(86) };

function setup() {
  const network = new MemoryNetwork();
  const requests: Array<{ player: SessionPlayer; device: DeviceProof | null }> = [];
  const session = new GmSession(network.host('gm'), {
    title: 'Vault', onJoinRequest: (player, device) => requests.push({ player, device }), onRequestClosed: () => {}, onPlayersChanged: () => {},
  });
  session.start();
  return { network, session, requests };
}

async function player(network: MemoryNetwork, key: string, device?: DeviceProof) {
  const link = await network.client().connect('gm');
  const received: ControlMessage[] = [];
  link.onMessage((channel, data) => {
    const decoded = decodeControl(data);
    if (channel === 'control' && decoded.kind === 'message') received.push(decoded.message);
  });
  link.send('control', encodeControl({ v: 1, type: 'join', name: 'Ana', playerKey: key, client: { kind: 'obsidian', version: '1' }, ...(device ? { device } : {}) }));
  return { link, received };
}

describe('GmSession identity', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('passes the device proof with the request, and none for a join without one', async () => {
    const { network, requests } = setup();
    await player(network, 'k1', DEVICE);
    await player(network, 'k2');
    expect(requests.map((request) => request.device)).toEqual([DEVICE, null]);
  });

  it('admits with a person id: the table proof goes to the player, the person id to presence', async () => {
    const { network, session, requests } = setup();
    const ana = await player(network, 'k1', DEVICE);
    session.allow(requests[0]!.player.playerId, { personId: 'ana_1', table: TABLE });
    expect(ana.received[0]).toEqual({ v: 1, type: 'admitted', playerId: requests[0]!.player.playerId, session: { title: 'Vault' }, table: TABLE });
    expect(ana.received[1]).toMatchObject({ type: 'presence', players: [{ name: 'Ana', personId: 'ana_1' }] });
    expect(session.getPlayers()[0]).toMatchObject({ personId: 'ana_1' });
    expect(session.personOf(requests[0]!.player.playerId)).toBe('ana_1');
  });

  it('re-admits a reconnect with the same proof and person, without asking again', async () => {
    const { network, session, requests } = setup();
    const first = await player(network, 'k1', DEVICE);
    session.allow(requests[0]!.player.playerId, { personId: 'ana_1', table: TABLE });
    first.link.close();
    const again = await player(network, 'k1', DEVICE);
    expect(requests).toHaveLength(1);
    expect(again.received[0]).toMatchObject({ type: 'admitted', table: TABLE });
    expect(session.getPlayers()[0]).toMatchObject({ personId: 'ana_1', status: 'admitted' });
  });

  it('admits as before without a person id: no table proof, no person in presence', async () => {
    const { network, session, requests } = setup();
    const web = await player(network, 'k1');
    session.allow(requests[0]!.player.playerId);
    expect(web.received[0]).toEqual({ v: 1, type: 'admitted', playerId: requests[0]!.player.playerId, session: { title: 'Vault' } });
    expect(web.received[1]).toEqual({ v: 1, type: 'presence', players: [{ playerId: requests[0]!.player.playerId, name: 'Ana', connected: true }] });
    expect(session.personOf(requests[0]!.player.playerId)).toBeNull();
  });
});
```

Create `tests/unit/online/sharing/onlineJoinIdentity.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { GmSession, type SessionPlayer } from '../../../../src/app/online/GmSession';
import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import { OnlineJoinService, type SessionIdentity } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import type { DeviceProof } from '../../../../src/app/online/protocol';
import { DeviceKeys, memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { checkDeviceProof, makeTableProof } from '../../../../src/app/online/sharing/identity/proofs';
import { RECONNECT_DELAYS_MS } from '../../../../src/app/online/PlayerSession';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import type { ClientTransport, PeerLink } from '../../../../src/app/online/transport/types';
import { nodeHash } from '../assetFixtures';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

function settings() {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS };
  return {
    getOnlineSettings: (): OnlineSettings => online,
    setOnlineSettings: (partial: Partial<OnlineSettings>): void => { online = { ...online, ...partial }; },
    onChange: (): (() => void) => () => {},
  };
}

async function world(client: (network: MemoryNetwork) => ClientTransport = (network) => network.client()) {
  const network = new MemoryNetwork();
  const requests: Array<{ player: SessionPlayer; device: DeviceProof | null }> = [];
  const gm = new GmSession(network.host('gm'), {
    title: 'Table', onJoinRequest: (player, device) => requests.push({ player, device }), onRequestClosed: () => {}, onPlayersChanged: () => {},
  });
  gm.start();
  const table = await testTable();
  const identities: Array<SessionIdentity | null> = [];
  const service = new OnlineJoinService({} as App, settings(), '0.5.0', {
    createClient: () => client(network), openStore: async () => null, decode: async () => null, hash: nodeHash,
    openSceneTab: async () => {}, isHosting: () => false,
    identityCrypto: crypto, deviceKeys: new DeviceKeys(memoryKeyValueStore(), crypto),
  });
  service.onIdentity((identity) => identities.push(identity));
  return { gm, table, service, requests, identities };
}

describe('joining with an identity', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    joinedSessionStore.setState({ session: null });
    vi.useRealTimers();
  });

  it('presents a device proof for the link table and the GM host, and takes the verified table identity', async () => {
    const { gm, table, service, requests, identities } = await world();
    expect(service.join(`https://example.org/#id=gm&table=${table.id}`, 'Ana')).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    const device = requests[0]!.device!;
    expect(await checkDeviceProof(crypto, device, table.id, 'gm')).not.toBeNull();
    gm.allow(requests[0]!.player.playerId, { personId: 'ana_1', table: await makeTableProof(crypto, table, device.nonce, 'ana_1', 'Morgan') });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.identity).toEqual({ tableId: table.id, personId: 'ana_1', gmName: 'Morgan' });
    expect(identities.at(-1)).toEqual(service.identity);
    service.leave();
    expect(service.identity).toBeNull();
    expect(identities.at(-1)).toBeNull();
  });

  it('turns sharing off for a forged table proof, but plays on', async () => {
    const { gm, table, service, requests } = await world();
    service.join(`https://example.org/#id=gm&table=${table.id}`, 'Ana');
    await vi.advanceTimersByTimeAsync(0);
    const fake = await testTable();
    const forged = { ...(await makeTableProof(crypto, fake, requests[0]!.device!.nonce, 'ana_1', 'Morgan')), id: table.id };
    gm.allow(requests[0]!.player.playerId, { personId: 'ana_1', table: forged });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state?.status).toBe('admitted');
    expect(service.identity).toBeNull();
  });

  it('presents no device and has no identity for a link without a table', async () => {
    const { gm, service, requests } = await world();
    service.join('https://example.org/#id=gm', 'Ana');
    await vi.advanceTimersByTimeAsync(0);
    expect(requests[0]!.device).toBeNull();
    gm.allow(requests[0]!.player.playerId);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state?.status).toBe('admitted');
    expect(service.identity).toBeNull();
  });

  it('reconnects with the same proof: the GM re-admits without asking and the identity stays', async () => {
    const links: PeerLink[] = [];
    const { gm, table, service, requests } = await world((network) => ({
      connect: async (hostId) => {
        const link = await network.client().connect(hostId);
        links.push(link);
        return link;
      },
    }));
    service.join(`https://example.org/#id=gm&table=${table.id}`, 'Ana');
    await vi.advanceTimersByTimeAsync(0);
    const nonce = requests[0]!.device!.nonce;
    gm.allow(requests[0]!.player.playerId, { personId: 'ana_1', table: await makeTableProof(crypto, table, nonce, 'ana_1', 'Morgan') });
    await vi.advanceTimersByTimeAsync(0);
    links[0]!.close();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(links).toHaveLength(2);
    expect(requests).toHaveLength(1);
    expect(gm.getPlayers()[0]).toMatchObject({ status: 'admitted', personId: 'ana_1' });
    expect(service.identity?.personId).toBe('ana_1');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing`
Expected: FAIL. The modules `identityCrypto`, `proofs`, `deviceKeys` and `tableKey` are not found, and `parseJoinLink(...).tableId` is undefined.

- [ ] **Step 5: Implement the key helpers**

Create `src/app/online/sharing/identity/identityCrypto.ts`:

```ts
/**
 * Keys that prove who is who at a table without any secret leaving a device: ECDSA P-256
 * with SHA-256 (Web Crypto, in Obsidian and every browser). Public keys travel as base64url
 * SPKI, signatures as base64url raw (r‖s, IEEE P1363), and a key's id is the base64url
 * SHA-256 of its SPKI bytes: a table id for the GM's key, a device id for a player's.
 */
import { base64Url } from '../../ids';

export interface KeyPairJwk {
  /** Base64url SPKI. */
  publicKey: string;
  privateKey: JsonWebKey;
}

/** The GM's table: its id (the key's id) and its keys. */
export interface TableIdentity {
  id: string;
  keys: KeyPairJwk;
}

export interface IdentityCrypto {
  generate(): Promise<KeyPairJwk>;
  sign(privateKey: JsonWebKey, text: string): Promise<string>;
  /** False for a bad signature and for a key or signature that cannot be read. */
  verify(publicKey: string, text: string, signature: string): Promise<boolean>;
  /** Rejects for a key that is not base64url. */
  keyId(publicKey: string): Promise<string>;
}

const KEY_ALGORITHM: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGNATURE: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

export const webIdentityCrypto: IdentityCrypto = {
  async generate(): Promise<KeyPairJwk> {
    const pair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    return { publicKey: base64Url(new Uint8Array(spki)), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) };
  },
  async sign(privateKey: JsonWebKey, text: string): Promise<string> {
    const key = await crypto.subtle.importKey('jwk', privateKey, KEY_ALGORITHM, false, ['sign']);
    return base64Url(new Uint8Array(await crypto.subtle.sign(SIGNATURE, key, utf8(text))));
  },
  async verify(publicKey: string, text: string, signature: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey('spki', fromBase64Url(publicKey), KEY_ALGORITHM, false, ['verify']);
      return await crypto.subtle.verify(SIGNATURE, key, fromBase64Url(signature), utf8(text));
    } catch {
      return false;
    }
  },
  async keyId(publicKey: string): Promise<string> {
    return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64Url(publicKey))));
  },
};
```

Create `src/app/online/sharing/identity/proofs.ts`:

```ts
/**
 * What each side of a join signs. A device proof binds the player's device key to one GM's
 * table and current host id, so a proof collected by any other host is worthless. A table
 * proof binds the GM's table key to the player's nonce and the person id it gives them, so a
 * fake GM cannot pose as the table. Neither carries a secret.
 */
import { isKeyId, type DeviceProof, type TableProof } from '../../protocol';
import type { IdentityCrypto, KeyPairJwk, TableIdentity } from './identityCrypto';

export function deviceProofText(table: string, hostId: string, nonce: string): string {
  return `atlas-device-v1|${table}|${hostId}|${nonce}`;
}

export function tableProofText(table: string, nonce: string, personId: string): string {
  return `atlas-table-v1|${table}|${nonce}|${personId}`;
}

export async function makeDeviceProof(
  crypto: IdentityCrypto, keys: KeyPairJwk, table: string, hostId: string, nonce: string,
): Promise<DeviceProof> {
  return { table, key: keys.publicKey, nonce, sig: await crypto.sign(keys.privateKey, deviceProofText(table, hostId, nonce)) };
}

/** The device id the proof stands for; null unless it was made for this table and host and its signature checks. */
export async function checkDeviceProof(crypto: IdentityCrypto, proof: DeviceProof, table: string, hostId: string): Promise<string | null> {
  if (proof.table !== table) return null;
  try {
    if (!(await crypto.verify(proof.key, deviceProofText(table, hostId, proof.nonce), proof.sig))) return null;
    const id = await crypto.keyId(proof.key);
    return isKeyId(id) ? id : null;
  } catch {
    return null;
  }
}

export async function makeTableProof(
  crypto: IdentityCrypto, table: TableIdentity, nonce: string, personId: string, gmName: string,
): Promise<TableProof> {
  return {
    id: table.id, key: table.keys.publicKey, personId, gmName,
    sig: await crypto.sign(table.keys.privateKey, tableProofText(table.id, nonce, personId)),
  };
}

/** Whether the proof's key is the link's table (its id) and it signed this player's nonce. */
export async function checkTableProof(crypto: IdentityCrypto, proof: TableProof, tableId: string, nonce: string): Promise<boolean> {
  if (proof.id !== tableId) return false;
  try {
    if ((await crypto.keyId(proof.key)) !== tableId) return false;
    return await crypto.verify(proof.key, tableProofText(tableId, nonce, proof.personId), proof.sig);
  } catch {
    return false;
  }
}
```

Create `src/app/online/sharing/identity/deviceKeys.ts`:

```ts
/**
 * A player's device key per table, kept in Obsidian's local storage: on this device only,
 * never in the vault (which may sync to other devices) and never sent. One key is made per
 * table, the first time this device joins it.
 */
import type { App } from 'obsidian';
import type { IdentityCrypto, KeyPairJwk } from './identityCrypto';

export const DEVICE_KEYS_STORAGE = 'atlas-online-device-keys';

export interface KeyValueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A stored key pair of the right shape: a P-256 private JWK and a public key string. */
export function isKeyPairJwk(value: unknown): value is KeyPairJwk {
  if (!isRecord(value) || typeof value.publicKey !== 'string' || value.publicKey.length > 200) return false;
  const key = value.privateKey;
  return isRecord(key) && key.kty === 'EC' && key.crv === 'P-256' && typeof key.d === 'string';
}

export function memoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, unknown>();
  return { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); } };
}

export function obsidianLocalStore(app: App): KeyValueStore {
  return {
    get: (key): unknown => {
      try {
        return app.loadLocalStorage(key) as unknown;
      } catch {
        return null;
      }
    },
    set: (key, value): void => {
      try {
        app.saveLocalStorage(key, value);
      } catch (error) {
        console.error('[Atlas online] Could not keep the device key:', error);
      }
    },
  };
}

export class DeviceKeys {
  private readonly making = new Map<string, Promise<KeyPairJwk>>();

  constructor(private readonly store: KeyValueStore, private readonly crypto: IdentityCrypto) {}

  /** This device's key for the table; made and stored on first use, once even when asked twice at once. */
  forTable(tableId: string): Promise<KeyPairJwk> {
    const stored = this.stored()[tableId];
    if (isKeyPairJwk(stored)) return Promise.resolve(stored);
    const running = this.making.get(tableId);
    if (running) return running;
    const made = this.crypto.generate().then((keys) => {
      this.store.set(DEVICE_KEYS_STORAGE, { ...this.stored(), [tableId]: keys });
      this.making.delete(tableId);
      return keys;
    }, (error: unknown) => {
      this.making.delete(tableId);
      throw error;
    });
    this.making.set(tableId, made);
    return made;
  }

  private stored(): Record<string, unknown> {
    const value = this.store.get(DEVICE_KEYS_STORAGE);
    return isRecord(value) ? value : {};
  }
}
```

Create `src/app/online/sharing/identity/tableKey.ts`:

```ts
/** The GM's table key, kept in Atlas's settings: made the first time this Atlas hosts, then stable. */
import type { OnlineSettings } from '../../onlineSettings';
import type { IdentityCrypto, TableIdentity } from './identityCrypto';

export interface TableSettings {
  getOnlineSettings(): OnlineSettings;
  setOnlineSettings(settings: Partial<OnlineSettings>): void;
}

export async function ensureTableIdentity(settings: TableSettings, crypto: IdentityCrypto): Promise<TableIdentity> {
  const stored = settings.getOnlineSettings().table;
  if (stored) return { id: stored.id, keys: { publicKey: stored.publicKey, privateKey: stored.privateKey } };
  const keys = await crypto.generate();
  const id = await crypto.keyId(keys.publicKey);
  settings.setOnlineSettings({ table: { id, publicKey: keys.publicKey, privateKey: keys.privateKey } });
  return { id, keys };
}
```

- [ ] **Step 6: Extend the wire format, the link and the settings**

In `src/app/online/protocol.ts`, after `MAX_CONTROLLED_TOKENS`, add:

```ts
/** A player's device key, proven for one GM table and host: its id is the device id. Sent by Obsidian players only. */
export interface DeviceProof {
  /** The table id from the join link. */
  table: string;
  /** Base64url SPKI of the device key. */
  key: string;
  /** Random, one per join; the GM's table proof signs it. */
  nonce: string;
  /** Base64url signature of `atlas-device-v1|table|host id|nonce`. */
  sig: string;
}

/** The GM's table, proven to one joining player: it signs their nonce and the person id it gives them. */
export interface TableProof {
  id: string;
  key: string;
  personId: string;
  gmName: string;
  sig: string;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PERSON_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const B64_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** A table or device id: base64url SHA-256, 43 characters. */
export const isKeyId = (value: unknown): value is string => typeof value === 'string' && KEY_ID_PATTERN.test(value);
/** A person id the GM gives (`randomId()`), or `gm`. */
export const isPersonId = (value: unknown): value is string => typeof value === 'string' && PERSON_ID_PATTERN.test(value);
const isB64 = (value: unknown): value is string => typeof value === 'string' && B64_PATTERN.test(value);
```

Change `PresencePlayer` to:

```ts
export interface PresencePlayer {
  playerId: string;
  name: string;
  connected: boolean;
  /** The person the GM admitted them as; absent for web players. */
  personId?: string;
}
```

Change the `join` and `admitted` members of `ControlMessage` to:

```ts
  | { v: 1; type: 'join'; name: string; playerKey: string; client: { kind: 'web' | 'obsidian'; version: string }; device?: DeviceProof }
  | { v: 1; type: 'admitted'; playerId: string; session: { title: string }; table?: TableProof }
```

Below `isRecord`, add:

```ts
function isDeviceProof(value: unknown): value is DeviceProof {
  return isRecord(value) && isKeyId(value.table) && isB64(value.key) && typeof value.nonce === 'string'
    && NONCE_PATTERN.test(value.nonce) && isB64(value.sig);
}

function isTableProof(value: unknown): value is TableProof {
  return isRecord(value) && isKeyId(value.id) && isB64(value.key) && isPersonId(value.personId)
    && isString(value.gmName, 200) && isB64(value.sig);
}
```

Replace the `join`, `admitted` and `presence` validators:

```ts
  join: (m) => isString(m.name, 200) && isString(m.playerKey, 64) && m.playerKey.length > 0
    && isRecord(m.client) && (m.client.kind === 'web' || m.client.kind === 'obsidian') && isString(m.client.version, 32)
    && (m.device === undefined || isDeviceProof(m.device)),
  admitted: (m) => isString(m.playerId, 64) && isRecord(m.session) && isString(m.session.title, 200)
    && (m.table === undefined || isTableProof(m.table)),
  presence: (m) => Array.isArray(m.players) && m.players.length <= 64 && m.players.every((p) =>
    isRecord(p) && isString(p.playerId, 64) && isString(p.name, 200) && typeof p.connected === 'boolean'
    && (p.personId === undefined || isPersonId(p.personId))),
```

In `src/app/online/joinLink.ts`, change the header comment's first line to ``Join links: `<page>#id=<gm id>[&table=<table id>][&signal=...][&ice=...]`.``, and change `JoinTarget` and the two functions:

```ts
export interface JoinTarget {
  hostId: string;
  server: PeerServerOptions;
  /** The GM's table id (sharing between Obsidian clients); null for older links or a malformed value. */
  tableId: string | null;
}

const TABLE_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
```

```ts
export function buildJoinUrl(pageUrl: string, hostId: string, settings: OnlineSettings, tableId: string | null = null): string {
  if (!validHostId(hostId)) throw new Error('Invalid host id');
  const base = pageUrl.split('#')[0];
  const { iceServers, ...server } = peerServerOptions(settings);
  const params = [`id=${hostId}`];
  if (tableId && TABLE_ID_PATTERN.test(tableId)) params.push(`table=${tableId}`);
  if (Object.keys(server).length) params.push(`signal=${toBase64Url(server)}`);
  const relays = iceServers.filter((ice) => ice.urls !== DEFAULT_STUN);
  if (relays.length) params.push(`ice=${toBase64Url(relays)}`);
  return `${base}#${params.join('&')}`;
}
```

In `parseJoinFragment`, return the table too:

```ts
    if (!server || !relays) return null;
    const table = params.get('table');
    return {
      hostId,
      server: { ...server, iceServers: [{ urls: DEFAULT_STUN }, ...relays] },
      tableId: table && TABLE_ID_PATTERN.test(table) ? table : null,
    };
```

Update the expectations in `tests/unit/online/joinLink.test.ts`: the two `toEqual({ hostId: …, server: … })` objects gain `tableId: null`.

In `src/app/online/onlineSettings.ts`, add to `OnlineSettings`:

```ts
  /** The GM's table key (sharing between Obsidian clients): made the first time this Atlas hosts; null before. */
  table: StoredTable | null;
```

and above it:

```ts
export interface StoredTable {
  /** The table id: the key's id, carried in join links. */
  id: string;
  publicKey: string;
  privateKey: JsonWebKey;
}

/** A stored table key of the right shape; null for anything else. */
function validStoredTable(value: unknown): StoredTable | null {
  if (!isRecord(value)) return null;
  const { id, publicKey, privateKey } = value;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  if (typeof publicKey !== 'string' || publicKey.length > 200) return null;
  if (!isRecord(privateKey) || privateKey.kty !== 'EC' || privateKey.crv !== 'P-256' || typeof privateKey.d !== 'string') return null;
  return { id, publicKey, privateKey: privateKey as JsonWebKey };
}
```

(`isRecord` is a function declaration further down, so it is hoisted.) Add `table: null,` to `DEFAULT_ONLINE_SETTINGS`, and `table: validStoredTable(source.table),` to the object `resolveOnlineSettings` returns.

- [ ] **Step 7: Pass identity through the GM's session**

In `src/app/online/gmSessionTypes.ts`:

```ts
import type { ControlMessage, DeviceProof, TableProof } from './protocol';
```

Add to `SessionPlayer`:

```ts
  /** The person the GM admitted them as (Obsidian players with a verified device); absent otherwise. */
  personId?: string;
```

Add below `SessionPlayer`:

```ts
/** Who the GM admits a player as: the person id, and the table proof that tells the player. */
export interface Admission {
  personId: string;
  table: TableProof;
}
```

Change `onJoinRequest` in `GmSessionOptions` to:

```ts
  /** A new player is waiting; answer with `allow` or `deny`. `device` is the Obsidian player's device proof, unchecked. */
  onJoinRequest(player: SessionPlayer, device: DeviceProof | null): void;
```

In `src/app/online/GmSession.ts`:
- Import `Admission` and `DeviceProof`/`TableProof` types.
- Re-export `Admission` with the other types.
- Add `device: DeviceProof | null` and `table: TableProof | null` to `Entry`.

Then make these changes:

```ts
  /** Admits a waiting player; `admission` gives them a person id and tells them with the table proof. */
  allow(playerId: string, admission?: Admission): void {
    const entry = this.entries.get(playerId);
    if (this.stopped || !entry || entry.player.status !== 'pending' || !entry.link) return;
    this.closeRequest(entry);
    if (this.countStatus('admitted') >= SESSION_LIMITS.maxPlayers) {
      this.entries.delete(playerId);
      this.refuse(this.release(entry), 'full');
      this.changed();
      return;
    }
    if (admission) {
      entry.player.personId = admission.personId;
      entry.table = admission.table;
    }
    this.admit(entry);
  }

  /** The person an admitted or gone player was admitted as; null for web players and unknown ids. */
  personOf(playerId: string): string | null {
    return this.entries.get(playerId)?.player.personId ?? null;
  }
```

In `join`, the new entry gains `device: message.device ?? null, table: null,` and the request passes it:

```ts
    this.options.onJoinRequest({ ...entry.player }, entry.device);
```

In `admit`, the message carries the stored proof:

```ts
    entry.link?.send('control', encodeControl({
      v: 1, type: 'admitted', playerId: entry.player.playerId, session: { title: this.options.title },
      ...(entry.table ? { table: entry.table } : {}),
    }));
```

In `broadcastPresence`, the map becomes:

```ts
      .map((entry): PresencePlayer => ({
        playerId: entry.player.playerId, name: entry.player.name, connected: entry.link !== null,
        ...(entry.player.personId ? { personId: entry.player.personId } : {}),
      }));
```

The reconnect path (`known`) is unchanged. It re-admits through `admit`, which resends the entry's table proof; the player's nonce is the same for the whole join.

- [ ] **Step 8: Carry the proofs on the player's side**

In `src/app/online/PlayerSession.ts`, import `DeviceProof` and `TableProof`, and add to `PlayerSessionOptions`:

```ts
  /** An Obsidian player's device proof for the link's table, sent with every join of this session. */
  device?: DeviceProof;
```

Add a field `private tableProof: TableProof | null = null;` and a getter:

```ts
  /** The GM's table proof from the latest admission; null before one or from a GM without a table. */
  get table(): TableProof | null {
    return this.tableProof;
  }
```

In `connect`, the join message spreads `...(this.options.device ? { device: this.options.device } : {})`. In `receive`, the `admitted` case sets `this.tableProof = message.table ?? null;` before `this.update(...)`.

In `src/app/online/obsidian/OnlineJoinService.ts`:

```ts
import { randomId } from '../ids';
import type { DeviceProof } from '../protocol';
import { DeviceKeys, obsidianLocalStore } from '../sharing/identity/deviceKeys';
import { webIdentityCrypto, type IdentityCrypto } from '../sharing/identity/identityCrypto';
import { checkTableProof, makeDeviceProof } from '../sharing/identity/proofs';

/** Who this Atlas is in the joined session, once the GM's table proof checked: sharing works only then. */
export interface SessionIdentity {
  tableId: string;
  /** This player's person id at that table. */
  personId: string;
  gmName: string;
}
```

Add to `OnlineJoinDeps`:

```ts
  identityCrypto?: IdentityCrypto;
  /** This device's keys per table; Obsidian's local storage unless a test passes its own. */
  deviceKeys?: Pick<DeviceKeys, 'forTable'>;
```

Add to `Joined`:

```ts
  /** One per join; every join message of it carries the same proof. */
  nonce: string;
  /** The device proof for the link's table; null without a table, or while it is made. */
  device: DeviceProof | null;
  identity: SessionIdentity | null;
  /** The table proof of this join was checked (it is the same on every re-admission). */
  tableChecked: boolean;
```

New fields and constructor lines:

```ts
  private readonly identityCrypto: IdentityCrypto;
  private readonly deviceKeys: Pick<DeviceKeys, 'forTable'>;
  private readonly identityListeners = new Set<(identity: SessionIdentity | null) => void>();
```

```ts
    this.identityCrypto = deps.identityCrypto ?? webIdentityCrypto;
    this.deviceKeys = deps.deviceKeys ?? new DeviceKeys(obsidianLocalStore(app), this.identityCrypto);
```

New members:

```ts
  /** Who this Atlas is in the joined session; null without a joined session or a verified table. */
  get identity(): SessionIdentity | null {
    return this.joined?.identity ?? null;
  }

  onIdentity(listener: (identity: SessionIdentity | null) => void): () => void {
    this.identityListeners.add(listener);
    return () => { this.identityListeners.delete(listener); };
  }
```

In `join`, the `Joined` literal gains `nonce: randomId(), device: null, identity: null, tableChecked: false`. A link with a table starts after the proof is made; one without starts at once, as in 6a:

```ts
    this.joined = joined;
    if (target.tableId) void this.prepare(joined);
    else this.startSession(joined);
    return null;
```

```ts
  /** Makes the device proof for the link's table, then starts; on failure it starts without one (no sharing). */
  private async prepare(joined: Joined): Promise<void> {
    const tableId = joined.target.tableId;
    if (!tableId) return;
    try {
      const keys = await this.deviceKeys.forTable(tableId);
      joined.device = await makeDeviceProof(this.identityCrypto, keys, tableId, joined.target.hostId, joined.nonce);
    } catch (error) {
      console.error('[Atlas online] Could not prove this device; joining without sharing:', error);
    }
    if (this.joined === joined) this.startSession(joined);
  }
```

In `startSession`, pass `...(joined.device ? { device: joined.device } : {}),` to `createJoinSession`. In `changed`, check the table once per join:

```ts
  private changed(joined: Joined, state: PlayerSessionState): void {
    joinedSessionStore.setState({ session: state });
    this.sink?.session(state);
    if (state.status === 'admitted' && !joined.tableChecked) void this.verify(joined);
    if (state.status !== 'admitted' || joined.opened) return;
    joined.opened = true;
    this.openSceneTab().catch((error: unknown) => {
      console.error('[Atlas online] Could not open the online scene:', error);
    });
  }

  /** Takes the GM's table proof when it is for the link's table and this join's nonce; otherwise sharing stays off. */
  private async verify(joined: Joined): Promise<void> {
    joined.tableChecked = true;
    const proof = joined.session?.table ?? null;
    const tableId = joined.target.tableId;
    if (!proof || !tableId || !joined.device) return;
    if (!(await checkTableProof(this.identityCrypto, proof, tableId, joined.nonce))) return;
    if (this.joined !== joined || joined.identity) return;
    joined.identity = { tableId, personId: proof.personId, gmName: proof.gmName };
    this.identityListeners.forEach((listener) => listener(joined.identity));
  }
```

In `leave`, after `this.joined = null;`, tell the listeners when there was an identity:

```ts
    if (joined.identity) this.identityListeners.forEach((listener) => listener(null));
```

`reconnect` already reuses `joined`, so the same nonce and device go out again.

- [ ] **Step 9: Put the table id in the GM's link**

In `src/app/online/OnlineSessionService.ts`:

```ts
import { webIdentityCrypto, type IdentityCrypto, type TableIdentity } from './sharing/identity/identityCrypto';
import { ensureTableIdentity } from './sharing/identity/tableKey';
```

Add to `Deps`:

```ts
  /** The GM's table key; made in the settings on first use unless a test passes its own (or none). */
  table?: () => Promise<TableIdentity | null>;
  identityCrypto?: IdentityCrypto;
```

New fields, set in the constructor:

```ts
  private readonly loadTable: () => Promise<TableIdentity | null>;
  private readonly identityCrypto: IdentityCrypto;
  private currentTable: TableIdentity | null = null;
  private currentHostId: string | null = null;
```

```ts
    this.identityCrypto = deps.identityCrypto ?? webIdentityCrypto;
    this.loadTable = deps.table ?? ((): Promise<TableIdentity | null> => ensureTableIdentity(this.settings, this.identityCrypto));
```

and getters:

```ts
  /** This Atlas's table while hosting; null otherwise or when it has none. */
  get table(): TableIdentity | null { return this.current ? this.currentTable : null; }

  /** The current host id while hosting. */
  get hostId(): string | null { return this.current ? this.currentHostId : null; }
```

In `host`, after the generation check, before building the link:

```ts
    let table: TableIdentity | null = null;
    try {
      table = await this.loadTable();
    } catch (error) {
      console.error('[Atlas online] Could not prepare the table key; hosting without sharing:', error);
    }
    if (generation !== this.generation) {
      host.close();
      return;
    }
    this.currentTable = table;
    this.currentHostId = host.id;
```

and `joinUrl = buildJoinUrl(online.playerPageUrl, host.id, online, table?.id ?? null);`.

In `tests/unit/online/onlineSessionService.test.ts`, the `service()` helper passes `table: async () => null` (its link expectations stay). Add this test to that file:

```ts
  it('puts the table id in the link when it has a table key', async () => {
    const network = new MemoryNetwork();
    const host = network.host('gm-id');
    const svc = new OnlineSessionService(app, settings, {
      createHost: async () => host, presented: new PresentedScene(), showRequest: () => ({ hide: () => {} }),
      table: async () => ({ id: 'T'.repeat(43), keys: { publicKey: 'k', privateKey: {} } }),
    });
    await svc.start();
    expect(onlineSessionStore.getState().joinUrl).toBe(`https://evoljoaobento.github.io/atlas-vtt/#id=gm-id&table=${'T'.repeat(43)}`);
    expect(svc.table?.id).toBe('T'.repeat(43));
    expect(svc.hostId).toBe('gm-id');
    svc.stop();
    expect(svc.table).toBeNull();
  });
```

- [ ] **Step 10: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing tests/unit/online/joinLink.test.ts tests/unit/online/onlineSessionService.test.ts tests/unit/online/gmSession.test.ts tests/unit/online/playerSession.test.ts tests/unit/online/obsidian/onlineJoinService.test.ts tests/unit/online/protocol.test.ts`
Expected: PASS.

- [ ] **Step 11: The full check and the web page build**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:online`
Expected: no errors; all tests pass; `dist-online/` builds (the page imports the changed `protocol.ts` and `joinLink.ts`).

- [ ] **Step 12: Commit**

```bash
git add src/app/online/sharing/identity src/app/online/protocol.ts src/app/online/joinLink.ts src/app/online/onlineSettings.ts \
  src/app/online/gmSessionTypes.ts src/app/online/GmSession.ts src/app/online/PlayerSession.ts \
  src/app/online/obsidian/OnlineJoinService.ts src/app/online/OnlineSessionService.ts \
  tests/unit/online/sharing tests/unit/online/joinLink.test.ts tests/unit/online/onlineSessionService.test.ts
git commit -m "feat(online): table and device keys prove who joins, without secrets"
```

---
### Task 2: The people list and admitting by identity

Every Atlas keeps a people list. The GM's `IdentityDesk` checks an Obsidian player's device proof and finds the person by device id. It marks the request **(known)** or **(new)**, and warns when a new device uses a known name. The GM then allows, links or denies; only the GM links.

Players record their GM (from the verified table proof) and their fellow players (from presence). The **People** dialog renames, links and removes people.

**Files:**
- Create: `src/app/online/sharing/dataFile.ts`
- Create: `src/app/online/sharing/people/peopleTypes.ts`
- Create: `src/app/online/sharing/people/peopleNames.ts`
- Create: `src/app/online/sharing/people/PeopleBook.ts`
- Create: `src/app/online/sharing/people/IdentityDesk.ts`
- Create: `src/app/online/sharing/people/sessionPeople.ts`
- Create: `src/app/online/sharing/people/ui/PeopleList.tsx`
- Create: `src/app/online/sharing/people/ui/PeopleModal.tsx`
- Create: `src/app/online/sharing/people/ui/people.scss`
- Create: `src/app/online/sharing/registerSharing.ts`
- Modify: `src/app/online/onlineSessionStore.ts` (`requests`)
- Modify: `src/app/online/OnlineSessionService.ts` (desk, `link`, async admission)
- Modify: `src/app/online/ui/joinRequestNotice.ts`, `src/app/online/ui/onlineCopy.ts`
- Modify: `src/app/react/components/online/OnlinePlayerList.tsx`, `src/app/react/components/online/OnlinePanel.tsx`, `src/app/react/components/online/online-panel.scss`
- Modify: `styles/main.scss`, `main.ts`
- Test: `tests/unit/online/sharing/peopleBook.test.ts`
- Test: `tests/unit/online/sharing/identityDesk.test.ts`
- Test: `tests/unit/online/sharing/onlineSessionIdentity.test.ts`
- Test: `tests/unit/online/sharing/sessionPeople.test.ts`
- Test: `tests/unit/online/sharing/peopleUi.test.tsx`

**Interfaces:**
- Consumes (Task 1): `checkDeviceProof`, `makeTableProof`, `TableIdentity`, `IdentityCrypto`, `DeviceProof`, `Admission`, `SessionIdentity`, `OnlineJoinService.onIdentity`, `OnlineSessionService.table` and `.hostId`.
- Produces:
  - From `dataFile.ts`:
    - `SHARING_DATA_DIR = 'atlas-vtt/.atlas-data/sharing'`, `type DataAdapterLike`
    - `class JsonDataFile<T>(adapter, path, parse)` with `load(): Promise<T>` and `save(value): Promise<void>`
    - `readText`, `writeText`, `removeFile`
  - From `peopleTypes.ts`: `Person`, `PeopleData`, `GM_PERSON_ID = 'gm'`, `personKey(tableId, personId)`, `keyOf(person)`, `parsePeopleData`.
  - From `peopleNames.ts`: `nameKey(name)`, `uniqueName(name, taken)`.
  - `class PeopleBook` with:
    - `static forApp(app)`, `ready()`, `list()`, `get(tableId, personId)`, `byKey(key)`
    - `byDevice(tableId, deviceId)`, `byName(name, tableId?)`
    - `admit(tableId, name, deviceId)`, `linkDevice(tableId, personId, deviceId)`, `seen(tableId, personId, name)`
    - `rename(key, name): string | null`, `merge(fromKey, intoKey): string | null`, `remove(key)`
    - `subscribe(listener)`
  - `type JoinIdentity = { kind: 'known'; personId; name } | { kind: 'new'; sameName: { personId; name } | null }`.
  - `class IdentityDesk(options)` with `identify(player, device): Promise<JoinIdentity | null>`, `admission(playerId, linkTo?): Promise<Admission | null>`, `identityOf(playerId)` and `closed(playerId)`.
  - `recordSessionPeople(people, identity, players)` (`sessionPeople.ts`).
  - `OnlineSessionState.requests: Record<string, JoinIdentity>`; `OnlineSessionService.link(playerId, personId)`.
  - `JoinRequestInfo { identity: JoinIdentity | null; link: (() => void) | null }`; `showJoinRequestNotice(player, answer, info?)`.
  - `registerSharing(plugin, services)` (`registerSharing.ts`; Tasks 3–6 add to it), with `SharingServices { joins: OnlineJoinService; people: PeopleBook }`.
  - `openPeopleModal(app)`.

- [ ] **Step 1: Write the failing people list tests**

Create `tests/unit/online/sharing/peopleBook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { GM_PERSON_ID, parsePeopleData, personKey } from '../../../../src/app/online/sharing/people/peopleTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const T = 'T'.repeat(43);
const U = 'U'.repeat(43);
const D1 = 'a'.repeat(43);
const D2 = 'b'.repeat(43);

function book(app = createInMemoryApp().app, now = (): number => 1000): PeopleBook {
  return new PeopleBook(new JsonDataFile(app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData), now);
}

describe('PeopleBook', () => {
  it('admits new people with unique names and finds them by device, name and key', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    const second = people.admit(T, 'ana', D2);
    expect(second.name).toBe('ana (2)');
    expect(people.byDevice(T, D1)).toEqual(ana);
    expect(people.byDevice(U, D1)).toBeNull();
    expect(people.byName('ANA')?.personId).toBe(ana.personId);
    expect(people.byKey(personKey(T, ana.personId))?.name).toBe('Ana');
    expect(ana.personId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('links a new device to a known person', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    expect(people.linkDevice(T, ana.personId, D2)?.devices).toEqual([D1, D2]);
    expect(people.byDevice(T, D2)?.personId).toBe(ana.personId);
    expect(people.linkDevice(T, 'nobody', D2)).toBeNull();
  });

  it('records people seen in a session without renaming known ones', async () => {
    const people = book();
    await people.ready();
    people.seen(T, GM_PERSON_ID, 'Morgan');
    people.seen(T, GM_PERSON_ID, 'Someone else');
    expect(people.get(T, GM_PERSON_ID)?.name).toBe('Morgan');
    // The same name at another table is another person.
    expect(people.seen(U, GM_PERSON_ID, 'Morgan').name).toBe('Morgan (2)');
  });

  it('renames by key, keeps the former name, and refuses a taken or bad name', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    people.admit(T, 'Ben', D2);
    const key = personKey(T, ana.personId);
    expect(people.rename(key, 'Ben')).toBe('Someone in your people list is already called Ben.');
    expect(people.rename(key, '   ')).toBe('Enter a name of up to 40 characters.');
    expect(people.rename(key, 'Anna')).toBeNull();
    expect(people.byName('Anna')?.formerNames).toEqual(['Ana']);
    // Notes that still say Ana reach her.
    expect(people.byName('Ana')?.personId).toBe(ana.personId);
  });

  it('merges one person into another and removes', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    const laptop = people.admit(T, 'Ana laptop', D2);
    expect(people.merge(personKey(T, laptop.personId), personKey(T, ana.personId))).toBeNull();
    const merged = people.get(T, ana.personId)!;
    expect(merged.devices).toEqual([D1, D2]);
    expect(merged.aliases).toEqual([personKey(T, laptop.personId)]);
    expect(merged.formerNames).toEqual(['Ana laptop']);
    expect(people.byKey(personKey(T, laptop.personId))?.personId).toBe(ana.personId);
    expect(people.list()).toHaveLength(1);
    people.remove(personKey(T, ana.personId));
    expect(people.list()).toEqual([]);
  });

  it('keeps the list in Atlas data, and survives a broken file', async () => {
    const { app, files } = createInMemoryApp();
    const first = book(app);
    await first.ready();
    first.admit(T, 'Ana', D1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(files.get(`${SHARING_DATA_DIR}/people.json`)!).people[0]).toMatchObject({ name: 'Ana', devices: [D1] });
    const second = book(app);
    await second.ready();
    expect(second.byDevice(T, D1)?.name).toBe('Ana');
    files.set(`${SHARING_DATA_DIR}/people.json`, '{not json');
    const third = book(app);
    await third.ready();
    expect(third.list()).toEqual([]);
    expect(parsePeopleData({ version: 1, people: [{ tableId: T, personId: 'bad id!', name: 'X' }, 7] }).people).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing desk tests**

Create `tests/unit/online/sharing/identityDesk.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { checkTableProof, makeDeviceProof } from '../../../../src/app/online/sharing/identity/proofs';
import { IdentityDesk } from '../../../../src/app/online/sharing/people/IdentityDesk';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData } from '../../../../src/app/online/sharing/people/peopleTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

const player = (playerId: string, name: string): SessionPlayer => ({ playerId, name, status: 'pending', client: 'obsidian' });

async function setup() {
  const table = await testTable();
  const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
  const desk = new IdentityDesk({ people, crypto, table, hostId: 'host-1', gmName: 'Morgan' });
  const device = async (hostId = 'host-1', tableId = table.id) => {
    const keys = await crypto.generate();
    return { keys, proof: (nonce: string) => makeDeviceProof(crypto, keys, tableId, hostId, nonce) };
  };
  return { table, people, desk, device };
}

describe('IdentityDesk', () => {
  it('calls a new device new, admits it as a new person with a table proof for its nonce, and knows it next time', async () => {
    const { table, people, desk, device } = await setup();
    const ana = await device();
    const proof = await ana.proof('nonce-aaaaaaaaaaaaaaaa');
    expect(await desk.identify(player('p1', 'Ana'), proof)).toEqual({ kind: 'new', sameName: null });
    const admission = (await desk.admission('p1'))!;
    expect(await checkTableProof(crypto, admission.table, table.id, 'nonce-aaaaaaaaaaaaaaaa')).toBe(true);
    expect(admission.table.personId).toBe(admission.personId);
    expect(people.get(table.id, admission.personId)?.name).toBe('Ana');
    expect(await desk.identify(player('p2', 'Whatever'), await ana.proof('nonce-bbbbbbbbbbbbbbbb')))
      .toEqual({ kind: 'known', personId: admission.personId, name: 'Ana' });
    expect((await desk.admission('p2'))?.personId).toBe(admission.personId);
  });

  it('a typed name is not an identity: a known name on a new device is new, with a warning', async () => {
    const { desk, device } = await setup();
    await desk.identify(player('p1', 'Ana'), await (await device()).proof('n1-aaaaaaaaaaaaaaaaaa'));
    const ana = (await desk.admission('p1'))!;
    const impostor = await device();
    expect(await desk.identify(player('p2', 'Ana'), await impostor.proof('n2-aaaaaaaaaaaaaaaaaa')))
      .toEqual({ kind: 'new', sameName: { personId: ana.personId, name: 'Ana' } });
    // Allowing makes them another person, never Ana.
    expect((await desk.admission('p2'))?.personId).not.toBe(ana.personId);
  });

  it('links a new device to a known person when the GM says so', async () => {
    const { table, people, desk, device } = await setup();
    await desk.identify(player('p1', 'Ana'), await (await device()).proof('n1-aaaaaaaaaaaaaaaaaa'));
    const ana = (await desk.admission('p1'))!;
    const laptop = await device();
    await desk.identify(player('p2', 'Ana'), await laptop.proof('n2-aaaaaaaaaaaaaaaaaa'));
    expect((await desk.admission('p2', ana.personId))?.personId).toBe(ana.personId);
    expect(people.get(table.id, ana.personId)?.devices).toHaveLength(2);
  });

  it('refuses a proof for another host or table, and forgets closed requests', async () => {
    const { desk, device } = await setup();
    expect(await desk.identify(player('p1', 'Ana'), await (await device('other-host')).proof('n1-aaaaaaaaaaaaaaaaaa'))).toBeNull();
    expect(await desk.identify(player('p2', 'Ana'), await (await device('host-1', 'X'.repeat(43))).proof('n2-aaaaaaaaaaaaaaaaaa'))).toBeNull();
    await desk.identify(player('p3', 'Ana'), await (await device()).proof('n3-aaaaaaaaaaaaaaaaaa'));
    desk.closed('p3');
    expect(await desk.admission('p3')).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing service, player and UI tests**

Create `tests/unit/online/sharing/onlineSessionIdentity.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { OnlineSessionService } from '../../../../src/app/online/OnlineSessionService';
import { onlineSessionStore, resetOnlineSessionStore } from '../../../../src/app/online/onlineSessionStore';
import { DEFAULT_ONLINE_SETTINGS } from '../../../../src/app/online/onlineSettings';
import { decodeControl, encodeControl, type ControlMessage } from '../../../../src/app/online/protocol';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { checkTableProof, makeDeviceProof } from '../../../../src/app/online/sharing/identity/proofs';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData } from '../../../../src/app/online/sharing/people/peopleTypes';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { PresentedScene } from '../../../../src/app/services/PresentedScene';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

const app = { vault: { getName: () => 'Vault', getAbstractFileByPath: () => null, on: () => ({}), offref: () => {} } } as never;
const settings = {
  getOnlineSettings: () => ({ ...DEFAULT_ONLINE_SETTINGS, playerName: 'Morgan' }),
  getLocalPlayerViewSettings: () => ({ showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: false, showWidgets: true, showInitiative: true }),
  onChange: () => () => {},
} as never;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { resetOnlineSessionStore(); });

async function hosting() {
  const network = new MemoryNetwork();
  const host = network.host('gm-id');
  const table = await testTable();
  const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
  const shown: Array<{ name: string; identity: unknown; link: (() => void) | null; answer: (allow: boolean) => void }> = [];
  const svc = new OnlineSessionService(app, settings, {
    createHost: async () => host, presented: new PresentedScene(), table: async () => table, identityCrypto: crypto, people,
    showRequest: (player, answer, info) => {
      shown.push({ name: player.name, identity: info?.identity ?? null, link: info?.link ?? null, answer });
      return { hide: () => {} };
    },
  });
  await svc.start();
  const join = async (name: string, keys?: Awaited<ReturnType<typeof crypto.generate>>, nonce = 'nonce-aaaaaaaaaaaaaaaa', hostId = 'gm-id') => {
    const link = await network.client().connect('gm-id');
    const received: ControlMessage[] = [];
    link.onMessage((channel, data) => {
      const decoded = decodeControl(data);
      if (channel === 'control' && decoded.kind === 'message') received.push(decoded.message);
    });
    const device = await makeDeviceProof(crypto, keys ?? await crypto.generate(), table.id, hostId, nonce);
    link.send('control', encodeControl({ v: 1, type: 'join', name, playerKey: `key-${name}-${nonce}`, client: { kind: 'obsidian', version: '1' }, device }));
    await flush();
    return { link, received };
  };
  return { svc, table, people, shown, join };
}

describe('OnlineSessionService admitting by identity', () => {
  it('shows a new device as new, and Allow admits with a table proof the player can check', async () => {
    const { svc, table, shown, join } = await hosting();
    const ana = await join('Ana');
    expect(shown[0]).toMatchObject({ name: 'Ana', identity: { kind: 'new', sameName: null }, link: null });
    const playerId = onlineSessionStore.getState().players[0]!.playerId;
    expect(onlineSessionStore.getState().requests[playerId]).toEqual({ kind: 'new', sameName: null });
    shown[0]!.answer(true);
    await flush();
    const admitted = ana.received.find((message) => message.type === 'admitted');
    expect(admitted?.type === 'admitted' && admitted.table && await checkTableProof(crypto, admitted.table, table.id, 'nonce-aaaaaaaaaaaaaaaa')).toBe(true);
    expect(admitted?.type === 'admitted' && admitted.table?.gmName).toBe('Morgan');
    expect(onlineSessionStore.getState().requests).toEqual({});
    svc.stop();
  });

  it('offers Link to Ana for a new device with her name, and links it', async () => {
    const { svc, table, people, shown, join } = await hosting();
    await join('Ana');
    shown[0]!.answer(true);
    await flush();
    const ana = people.byName('Ana')!;
    await join('Ana', undefined, 'nonce-bbbbbbbbbbbbbbbb');
    expect(shown[1]).toMatchObject({ identity: { kind: 'new', sameName: { personId: ana.personId, name: 'Ana' } } });
    shown[1]!.link!();
    await flush();
    expect(people.get(table.id, ana.personId)?.devices).toHaveLength(2);
    expect(onlineSessionStore.getState().players.filter((player) => player.personId === ana.personId)).toHaveLength(2);
    svc.stop();
  });

  it('denies a join whose device proof was made for another host', async () => {
    const { svc, shown, join } = await hosting();
    const eve = await join('Eve', undefined, 'nonce-cccccccccccccccc', 'other-host');
    expect(shown).toEqual([]);
    expect(eve.received).toEqual([{ v: 1, type: 'denied', reason: 'denied' }]);
    svc.stop();
  });
});
```

Create `tests/unit/online/sharing/sessionPeople.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { GM_PERSON_ID, parsePeopleData } from '../../../../src/app/online/sharing/people/peopleTypes';
import { recordSessionPeople } from '../../../../src/app/online/sharing/people/sessionPeople';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

describe('recording the people of a joined session', () => {
  it('adds the GM and everyone with a person id, never me or web players', async () => {
    const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
    await people.ready();
    const identity = { tableId: 'T'.repeat(43), personId: 'me', gmName: 'Morgan' };
    recordSessionPeople(people, identity, [
      { playerId: 'a', name: 'Me', connected: true, personId: 'me' },
      { playerId: 'b', name: 'Ben', connected: true, personId: 'ben' },
      { playerId: 'c', name: 'Web', connected: true },
    ]);
    expect(people.list().map((person) => [person.personId, person.name]).sort()).toEqual([[GM_PERSON_ID, 'Morgan'], ['ben', 'Ben']]);
  });
});
```

Create `tests/unit/online/sharing/peopleUi.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnlinePlayerList } from '../../../../src/app/react/components/online/OnlinePlayerList';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData, personKey } from '../../../../src/app/online/sharing/people/peopleTypes';
import { PeopleList } from '../../../../src/app/online/sharing/people/ui/PeopleList';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const T = 'T'.repeat(43);

describe('waiting players with identities', () => {
  it('shows known and new, the warning, and Link to Ana', () => {
    const service = { allow: vi.fn(), deny: vi.fn(), kick: vi.fn(), link: vi.fn() };
    render(<OnlinePlayerList
      players={[
        { playerId: 'p1', name: 'Ana', status: 'pending', client: 'obsidian' },
        { playerId: 'p2', name: 'Ben', status: 'pending', client: 'obsidian' },
      ]}
      requests={{ p1: { kind: 'new', sameName: { personId: 'ana_1', name: 'Ana' } }, p2: { kind: 'known', personId: 'ben_1', name: 'Ben' } }}
      control={null}
      service={service}
    />);
    expect(screen.getByText('(new)')).toBeTruthy();
    expect(screen.getByText('(known)')).toBeTruthy();
    expect(screen.getByText('Someone named Ana is already in your people list')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Link to Ana' }));
    expect(service.link).toHaveBeenCalledWith('p1', 'ana_1');
    expect(screen.getAllByRole('button', { name: 'Link to Ana' })).toHaveLength(1);
  });
});

describe('People list', () => {
  it('renames on Enter, shows a refused name, links and removes', async () => {
    const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
    await people.ready();
    const ana = people.admit(T, 'Ana', 'a'.repeat(43));
    const ben = people.admit(T, 'Ben', 'b'.repeat(43));
    render(<PeopleList people={people} ownTableId={T} confirmRemove={async () => true} />);
    const input = screen.getByLabelText('Name of Ana') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ben' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Someone in your people list is already called Ben.');
    fireEvent.change(input, { target: { value: 'Anna' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(people.get(T, ana.personId)?.name).toBe('Anna');
    fireEvent.change(screen.getByLabelText('Link Ben to'), { target: { value: personKey(T, ana.personId) } });
    expect(people.list()).toHaveLength(1);
    expect(people.byKey(personKey(T, ben.personId))?.personId).toBe(ana.personId);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Anna' })); });
    expect(people.list()).toEqual([]);
    expect(screen.getByText('Nobody yet. People are added when you let them into your session or join someone else’s.')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing`
Expected: FAIL. The modules `dataFile`, `PeopleBook`, `IdentityDesk`, `sessionPeople` and `PeopleList` are not found, and `OnlinePlayerList` has no `requests`.

- [ ] **Step 5: Implement Atlas data files and the people list**

Create `src/app/online/sharing/dataFile.ts`:

```ts
/**
 * Atlas's sharing data, in `atlas-vtt/.atlas-data/sharing/`: a dot folder, which Obsidian does
 * not index, so neither the vault check nor search ever sees it. Read and written through the
 * adapter. A file's writes are queued, so it always ends as the last value saved.
 */
import type { DataAdapter } from 'obsidian';

export const SHARING_DATA_DIR = 'atlas-vtt/.atlas-data/sharing';

export type DataAdapterLike = Pick<DataAdapter, 'exists' | 'read' | 'write' | 'mkdir' | 'remove'>;

const parentOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

async function ensureFolder(adapter: DataAdapterLike, folder: string): Promise<void> {
  if (!folder || (await adapter.exists(folder))) return;
  await ensureFolder(adapter, parentOf(folder));
  await adapter.mkdir(folder);
}

export async function writeText(adapter: DataAdapterLike, path: string, text: string): Promise<void> {
  await ensureFolder(adapter, parentOf(path));
  await adapter.write(path, text);
}

/** The file's text; null when there is none or it cannot be read. */
export async function readText(adapter: DataAdapterLike, path: string): Promise<string | null> {
  try {
    return (await adapter.exists(path)) ? await adapter.read(path) : null;
  } catch {
    return null;
  }
}

export async function removeFile(adapter: DataAdapterLike, path: string): Promise<void> {
  if (await adapter.exists(path)) await adapter.remove(path);
}

export class JsonDataFile<T> {
  private queue: Promise<void> = Promise.resolve();

  /** `parse` turns whatever is stored (null for nothing) into a value, dropping what it cannot read. */
  constructor(private readonly adapter: DataAdapterLike, readonly path: string, private readonly parse: (value: unknown) => T) {}

  async load(): Promise<T> {
    const text = await readText(this.adapter, this.path);
    if (text === null) return this.parse(null);
    try {
      return this.parse(JSON.parse(text));
    } catch (error) {
      console.error(`[Atlas sharing] ${this.path} is not readable; starting from empty.`, error);
      return this.parse(null);
    }
  }

  save(value: T): Promise<void> {
    const text = JSON.stringify(value, null, 2);
    this.queue = this.queue
      .then(() => writeText(this.adapter, this.path, text))
      .catch((error: unknown) => console.error(`[Atlas sharing] Could not save ${this.path}:`, error));
    return this.queue;
  }
}
```

Create `src/app/online/sharing/people/peopleTypes.ts`:

```ts
/** The people list: who this Atlas knows from online sessions, by table and person id. */
import { isKeyId, isPersonId } from '../../protocol';

/** The GM's own person id at their table, in every player's list. */
export const GM_PERSON_ID = 'gm';

export interface Person {
  tableId: string;
  /** Given by the table's GM; `gm` for the GM. */
  personId: string;
  /** Unique in this list (case-insensitive). */
  name: string;
  /** Names before a rename, so a note that still says the old name reaches them. */
  formerNames: string[];
  /** The GM's list: the device ids admitted as this person. */
  devices: string[];
  /** Keys of people merged into this one; shares to those keys reach this person. */
  aliases: string[];
  lastSeen: number;
}

export interface PeopleData {
  version: 1;
  people: Person[];
}

export const personKey = (tableId: string, personId: string): string => `${tableId}/${personId}`;
export const keyOf = (person: Pick<Person, 'tableId' | 'personId'>): string => personKey(person.tableId, person.personId);

const strings = (value: unknown, valid: (text: string) => boolean): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && valid(item)).slice(0, 64) : [];

function parsePerson(value: unknown): Person | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { tableId, personId, name, lastSeen } = record;
  if (!isKeyId(tableId) || !isPersonId(personId) || typeof name !== 'string' || !name.trim() || name.length > 80) return null;
  return {
    tableId, personId, name,
    formerNames: strings(record.formerNames, (text) => text.length <= 80),
    devices: strings(record.devices, isKeyId),
    aliases: strings(record.aliases, (text) => text.length <= 120),
    lastSeen: typeof lastSeen === 'number' && Number.isFinite(lastSeen) ? lastSeen : 0,
  };
}

/** The stored list; entries of the wrong shape are dropped. */
export function parsePeopleData(value: unknown): PeopleData {
  const people = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).people : null;
  return { version: 1, people: Array.isArray(people) ? people.flatMap((entry) => parsePerson(entry) ?? []) : [] };
}
```

Create `src/app/online/sharing/people/peopleNames.ts`:

```ts
/** Names in the people list are compared like this: trimmed, case-insensitive. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** `name`, or `name (2)`, `name (3)`, … while `taken` says the name is used. */
export function uniqueName(name: string, taken: (key: string) => boolean): string {
  if (!taken(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken(nameKey(candidate))) return candidate;
  }
}
```

Create `src/app/online/sharing/people/PeopleBook.ts`:

```ts
/**
 * The people list of this Atlas, kept in `people.json` in Atlas's sharing data. People are
 * added when the GM admits them or when a player meets them in a session; their device and
 * person ids, never their names, decide who they are. Names stay unique in the list.
 */
import type { App } from 'obsidian';
import { randomId } from '../../ids';
import { normalizePlayerName } from '../../protocol';
import { JsonDataFile, SHARING_DATA_DIR } from '../dataFile';
import { nameKey, uniqueName } from './peopleNames';
import { keyOf, parsePeopleData, type PeopleData, type Person } from './peopleTypes';

export const PEOPLE_FILE = `${SHARING_DATA_DIR}/people.json`;
const NAME_PROBLEM = 'Enter a name of up to 40 characters.';

export class PeopleBook {
  private static readonly instances = new WeakMap<App, PeopleBook>();
  static forApp(app: App): PeopleBook {
    let book = this.instances.get(app);
    if (!book) {
      book = new PeopleBook(new JsonDataFile(app.vault.adapter, PEOPLE_FILE, parsePeopleData));
      this.instances.set(app, book);
    }
    return book;
  }

  private people: Person[] = [];
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly file: JsonDataFile<PeopleData>, private readonly now: () => number = Date.now) {}

  /** Reads the stored list once; every other method expects it read. */
  ready(): Promise<void> {
    this.loading ??= this.file.load().then((data) => {
      this.people = data.people;
      this.listeners.forEach((listener) => listener());
    });
    return this.loading;
  }

  list(): readonly Person[] {
    return this.people;
  }

  get(tableId: string, personId: string): Person | null {
    return this.byKey(`${tableId}/${personId}`);
  }

  /** The person with this key, or the one it was merged into. */
  byKey(key: string): Person | null {
    return this.people.find((person) => keyOf(person) === key) ?? this.people.find((person) => person.aliases.includes(key)) ?? null;
  }

  byDevice(tableId: string, deviceId: string): Person | null {
    return this.people.find((person) => person.tableId === tableId && person.devices.includes(deviceId)) ?? null;
  }

  /** The person called `name` now, else the one who was called that most recently; optionally at one table. */
  byName(name: string, tableId?: string): Person | null {
    const key = nameKey(name);
    const candidates = tableId ? this.people.filter((person) => person.tableId === tableId) : this.people;
    return candidates.find((person) => nameKey(person.name) === key)
      ?? [...candidates].sort((a, b) => b.lastSeen - a.lastSeen).find((person) => person.formerNames.some((former) => nameKey(former) === key))
      ?? null;
  }

  /** The GM admits a new device as a new person. */
  admit(tableId: string, name: string, deviceId: string): Person {
    const person: Person = {
      tableId, personId: randomId(), name: this.freeName(name), formerNames: [], devices: [deviceId], aliases: [], lastSeen: this.now(),
    };
    this.people = [...this.people, person];
    this.changed();
    return person;
  }

  /** The GM links a new device to a known person; null when there is no such person. */
  linkDevice(tableId: string, personId: string, deviceId: string): Person | null {
    const person = this.get(tableId, personId);
    if (!person) return null;
    return this.replace(person, { devices: person.devices.includes(deviceId) ? person.devices : [...person.devices, deviceId], lastSeen: this.now() });
  }

  /** Someone met in a session: added under a free name if new, otherwise only their last-seen time changes. */
  seen(tableId: string, personId: string, name: string): Person {
    const known = this.get(tableId, personId);
    if (known) return this.replace(known, { lastSeen: this.now() });
    const person: Person = { tableId, personId, name: this.freeName(name), formerNames: [], devices: [], aliases: [], lastSeen: this.now() };
    this.people = [...this.people, person];
    this.changed();
    return person;
  }

  /** Renames; the old name stays a former name. Returns what is wrong with the name, or null. */
  rename(key: string, name: string): string | null {
    const person = this.byKey(key);
    const cleaned = normalizePlayerName(name);
    if (!person) return null;
    if (!cleaned) return NAME_PROBLEM;
    if (nameKey(cleaned) === nameKey(person.name)) {
      this.replace(person, { name: cleaned });
      return null;
    }
    if (this.people.some((other) => other !== person && nameKey(other.name) === nameKey(cleaned))) {
      return `Someone in your people list is already called ${cleaned}.`;
    }
    this.replace(person, { name: cleaned, formerNames: [...person.formerNames.filter((former) => nameKey(former) !== nameKey(cleaned)), person.name] });
    return null;
  }

  /** Merges `fromKey` into `intoKey`: one person on two devices or at two tables. */
  merge(fromKey: string, intoKey: string): string | null {
    const from = this.byKey(fromKey);
    const into = this.byKey(intoKey);
    if (!from || !into || from === into) return 'Pick another person.';
    const people = this.people.filter((person) => person !== from);
    const merged: Person = {
      ...into,
      devices: [...new Set([...into.devices, ...from.devices])],
      formerNames: [...new Set([...into.formerNames, from.name, ...from.formerNames])],
      aliases: [...new Set([...into.aliases, keyOf(from), ...from.aliases])],
      lastSeen: Math.max(into.lastSeen, from.lastSeen),
    };
    this.people = people.map((person) => (person === into ? merged : person));
    this.changed();
    return null;
  }

  remove(key: string): void {
    const person = this.byKey(key);
    if (!person) return;
    this.people = this.people.filter((other) => other !== person);
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private freeName(name: string): string {
    const cleaned = normalizePlayerName(name) ?? 'Someone';
    return uniqueName(cleaned, (key) => this.people.some((person) => nameKey(person.name) === key));
  }

  private replace(person: Person, changes: Partial<Person>): Person {
    const updated = { ...person, ...changes };
    this.people = this.people.map((other) => (other === person ? updated : other));
    this.changed();
    return updated;
  }

  private changed(): void {
    void this.file.save({ version: 1, people: this.people });
    this.listeners.forEach((listener) => listener());
  }
}
```

- [ ] **Step 6: Implement the desk and the player's records**

Create `src/app/online/sharing/people/IdentityDesk.ts`:

```ts
/**
 * The GM's side of an Obsidian player's join. It checks the device proof (made for this table
 * and host) and finds the person by device id, so a typed name never decides who someone is.
 * A new device with a known name is flagged; only the GM links it to that person. Admitting
 * signs the player's nonce and the person id with the table key.
 */
import type { Admission, SessionPlayer } from '../../gmSessionTypes';
import type { DeviceProof } from '../../protocol';
import type { IdentityCrypto, TableIdentity } from '../identity/identityCrypto';
import { checkDeviceProof, makeTableProof } from '../identity/proofs';
import type { PeopleBook } from './PeopleBook';
import type { Person } from './peopleTypes';

export type JoinIdentity =
  | { kind: 'known'; personId: string; name: string }
  | { kind: 'new'; sameName: { personId: string; name: string } | null };

export interface IdentityDeskOptions {
  people: Pick<PeopleBook, 'ready' | 'byDevice' | 'byName' | 'admit' | 'linkDevice' | 'seen'>;
  crypto: IdentityCrypto;
  table: TableIdentity;
  /** This session's host id: device proofs must be made for it. */
  hostId: string;
  gmName: string;
}

interface Pending {
  deviceId: string;
  nonce: string;
  name: string;
  identity: JoinIdentity;
}

export class IdentityDesk {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly options: IdentityDeskOptions) {}

  /** The request's identity; null when the proof is not for this table and host or does not check (deny it). */
  async identify(player: SessionPlayer, device: DeviceProof): Promise<JoinIdentity | null> {
    const { people, crypto, table, hostId } = this.options;
    const deviceId = await checkDeviceProof(crypto, device, table.id, hostId);
    if (!deviceId) return null;
    await people.ready();
    const known = people.byDevice(table.id, deviceId);
    const named = known ? null : people.byName(player.name, table.id);
    const identity: JoinIdentity = known
      ? { kind: 'known', personId: known.personId, name: known.name }
      : { kind: 'new', sameName: named ? { personId: named.personId, name: named.name } : null };
    this.pending.set(player.playerId, { deviceId, nonce: device.nonce, name: player.name, identity });
    return identity;
  }

  identityOf(playerId: string): JoinIdentity | null {
    return this.pending.get(playerId)?.identity ?? null;
  }

  /**
   * Admits an identified player: as the known person, as `linkTo` (a known person on a new
   * device), or as a new person. Null for a request this desk does not hold.
   */
  async admission(playerId: string, linkTo: string | null = null): Promise<Admission | null> {
    const pending = this.pending.get(playerId);
    if (!pending) return null;
    this.pending.delete(playerId);
    const { people, crypto, table, gmName } = this.options;
    let person: Person | null;
    if (linkTo) person = people.linkDevice(table.id, linkTo, pending.deviceId);
    else if (pending.identity.kind === 'known') person = people.seen(table.id, pending.identity.personId, pending.name);
    else person = people.admit(table.id, pending.name, pending.deviceId);
    if (!person) return null;
    return { personId: person.personId, table: await makeTableProof(crypto, table, pending.nonce, person.personId, gmName) };
  }

  closed(playerId: string): void {
    this.pending.delete(playerId);
  }
}
```

Create `src/app/online/sharing/people/sessionPeople.ts`:

```ts
/** A player meets people in a joined session: the GM (from the checked table proof) and everyone with a person id. */
import type { SessionIdentity } from '../../obsidian/OnlineJoinService';
import type { PresencePlayer } from '../../protocol';
import type { PeopleBook } from './PeopleBook';
import { GM_PERSON_ID } from './peopleTypes';

export function recordSessionPeople(
  people: Pick<PeopleBook, 'seen'>, identity: SessionIdentity, players: readonly PresencePlayer[],
): void {
  people.seen(identity.tableId, GM_PERSON_ID, identity.gmName);
  for (const player of players) {
    if (player.personId && player.personId !== identity.personId) people.seen(identity.tableId, player.personId, player.name);
  }
}
```

- [ ] **Step 7: Wire the desk into hosting**

In `src/app/online/onlineSessionStore.ts`:

```ts
import type { JoinIdentity } from './sharing/people/IdentityDesk';
```

Add the field to the state:

```ts
  /** Who each waiting Obsidian player is, by player id, once their device proof checked. */
  requests: Record<string, JoinIdentity>;
```

and `requests: {}` to `INITIAL_STATE`.

In `src/app/online/ui/onlineCopy.ts`, add:

```ts
export const KNOWN_PERSON_MARK = '(known)';
export const NEW_PERSON_MARK = '(new)';
export const sameNameWarning = (name: string): string => `Someone named ${name} is already in your people list`;
export const linkToLabel = (name: string): string => `Link to ${name}`;
export const PEOPLE_LABEL = 'People';
```

Replace `src/app/online/ui/joinRequestNotice.ts`:

```ts
import { Notice } from 'obsidian';
import type { SessionPlayer } from '../GmSession';
import type { JoinIdentity } from '../sharing/people/IdentityDesk';
import { KNOWN_PERSON_MARK, NEW_PERSON_MARK, linkToLabel, sameNameWarning } from './onlineCopy';

/** Who a waiting player is, and the Link answer when a new device uses a known name. */
export interface JoinRequestInfo {
  identity: JoinIdentity | null;
  link: (() => void) | null;
}

/**
 * "Anna wants to join your online session. (new)", with Allow, Link to Anna and Deny, until
 * answered or hidden. Names are text, never HTML.
 */
export function showJoinRequestNotice(player: SessionPlayer, answer: (allow: boolean) => void, info?: JoinRequestInfo): { hide(): void } {
  const fragment = createFragment();
  const body = fragment.createDiv({ cls: 'atlas-online-request' });
  const text = body.createDiv({ cls: 'atlas-online-request__text' });
  text.appendText(`${player.name} wants to join your online session.`);
  const identity = info?.identity ?? null;
  if (identity) text.createSpan({ cls: 'atlas-online-request__mark', text: ` ${identity.kind === 'known' ? KNOWN_PERSON_MARK : NEW_PERSON_MARK}` });
  const sameName = identity?.kind === 'new' ? identity.sameName : null;
  if (sameName) body.createDiv({ cls: 'atlas-online-request__warning', text: sameNameWarning(sameName.name) });
  const actions = body.createDiv({ cls: 'atlas-online-request__actions' });
  const notice = new Notice(fragment, 0);
  // Obsidian hides a notice on any click: only the answers may close this one.
  body.addEventListener('click', (event) => event.stopPropagation());
  const reply = (act: () => void) => (event: MouseEvent): void => {
    event.stopPropagation();
    act();
    notice.hide();
  };
  actions.createEl('button', { cls: 'mod-cta', text: 'Allow' }).addEventListener('click', reply(() => answer(true)));
  const link = info?.link ?? null;
  if (sameName && link) actions.createEl('button', { text: linkToLabel(sameName.name) }).addEventListener('click', reply(link));
  actions.createEl('button', { text: 'Deny' }).addEventListener('click', reply(() => answer(false)));
  return { hide: () => notice.hide() };
}
```

In `src/app/online/OnlineSessionService.ts`:

```ts
import { normalizePlayerName } from './protocol';
import type { DeviceProof } from './protocol';
import { IdentityDesk } from './sharing/people/IdentityDesk';
import { PeopleBook } from './sharing/people/PeopleBook';
import type { JoinRequestInfo } from './ui/joinRequestNotice';
```

Change `Deps.showRequest` and add `people`:

```ts
  showRequest?: (player: SessionPlayer, answer: (allow: boolean) => void, info?: JoinRequestInfo) => { hide(): void };
  /** The people list; this vault's unless a test passes its own. */
  people?: PeopleBook;
```

Add fields `private desk: IdentityDesk | null = null;` and `private readonly people: PeopleBook;`. In the constructor: `this.people = deps.people ?? PeopleBook.forApp(app);`.

In `host`, after `this.currentHostId = host.id;`:

```ts
    this.desk = table ? new IdentityDesk({
      people: this.people, crypto: this.identityCrypto, table, hostId: host.id,
      gmName: normalizePlayerName(online.playerName) ?? 'GM',
    }) : null;
```

The session's `onJoinRequest` and `onRequestClosed` become:

```ts
      onJoinRequest: (player, device) => {
        if (device && player.client === 'obsidian' && this.desk) void this.identify(player, device, this.desk);
        else this.showJoinRequest(player, null);
      },
      onRequestClosed: (playerId) => {
        this.desk?.closed(playerId);
        this.notices.get(playerId)?.hide();
        this.notices.delete(playerId);
        const requests = Object.fromEntries(Object.entries(onlineSessionStore.getState().requests).filter(([id]) => id !== playerId));
        onlineSessionStore.setState({ requests });
      },
```

New private methods:

```ts
  private showJoinRequest(player: SessionPlayer, identity: JoinIdentity | null): void {
    const sameName = identity?.kind === 'new' ? identity.sameName : null;
    const info: JoinRequestInfo = { identity, link: sameName ? () => this.link(player.playerId, sameName.personId) : null };
    this.notices.set(player.playerId, this.showRequest(player, (allow) => (allow ? this.allow(player.playerId) : this.deny(player.playerId)), info));
  }

  /** Checks an Obsidian player's device; a proof that fails is denied, the others are asked about. */
  private async identify(player: SessionPlayer, device: DeviceProof, desk: IdentityDesk): Promise<void> {
    const identity = await desk.identify(player, device);
    const waiting = this.current?.getPlayers().some((other) => other.playerId === player.playerId && other.status === 'pending');
    if (this.desk !== desk || !waiting) return;
    if (!identity) {
      this.current?.deny(player.playerId);
      return;
    }
    onlineSessionStore.setState({ requests: { ...onlineSessionStore.getState().requests, [player.playerId]: identity } });
    this.showJoinRequest(player, identity);
  }

  /** Admits with the desk's identity when it holds one (a new or known person, or linked), else as before. */
  private async admit(playerId: string, linkTo: string | null): Promise<void> {
    const session = this.current;
    const desk = this.desk;
    if (!session) return;
    const admission = desk?.identityOf(playerId) ? await desk.admission(playerId, linkTo) : null;
    if (this.current === session) session.allow(playerId, admission ?? undefined);
  }
```

(import `JoinIdentity` from `./sharing/people/IdentityDesk`). Replace the public `allow` and add `link`:

```ts
  allow(playerId: string): void { void this.admit(playerId, null); }
  /** Admits a new device as a known person: only the GM links. */
  link(playerId: string, personId: string): void { void this.admit(playerId, personId); }
```

In `teardown`, add `this.desk = null; this.currentTable = null; this.currentHostId = null;`.

Web joins and joins without a table are still admitted synchronously: `admit` awaits only when the desk holds an identity, and an async function runs synchronously until its first `await`. So the existing tests in `onlineSessionService.test.ts` need no change.

- [ ] **Step 8: Show identities in the online panel**

In `src/app/react/components/online/OnlinePlayerList.tsx`:
- The props gain `requests: Readonly<Record<string, JoinIdentity>>`.
- `service` becomes `Pick<OnlineSessionService, 'allow' | 'deny' | 'kick' | 'link'>`.
- Replace the waiting `<li>`'s row with:

```tsx
              <li key={player.playerId} className="atlas-online-panel__player" aria-label={player.name}>
                <div className="atlas-online-panel__player-row">
                  <span className="atlas-online-panel__name">{player.name}</span>
                  {player.client === 'obsidian' && <ObsidianMark />}
                  <IdentityMark identity={requests[player.playerId] ?? null} />
                  <Button variant="default" size="sm" onClick={() => service.allow(player.playerId)}>Allow</Button>
                  <Button variant="outline" size="sm" onClick={() => service.deny(player.playerId)}>Deny</Button>
                </div>
                <SameNameRow identity={requests[player.playerId] ?? null} onLink={(personId) => service.link(player.playerId, personId)} />
              </li>
```

with, above the component:

```tsx
/** `(known)` or `(new)` for an Obsidian player whose device checked; nothing for web players. */
function IdentityMark({ identity }: { identity: JoinIdentity | null }): React.ReactElement | null {
  if (!identity) return null;
  return <span className="atlas-online-panel__identity">{identity.kind === 'known' ? KNOWN_PERSON_MARK : NEW_PERSON_MARK}</span>;
}

/** The warning for a new device using a known name, with Link to that person. */
function SameNameRow({ identity, onLink }: { identity: JoinIdentity | null; onLink: (personId: string) => void }): React.ReactElement | null {
  const sameName = identity?.kind === 'new' ? identity.sameName : null;
  if (!sameName) return null;
  return (
    <div className="atlas-online-panel__player-row atlas-online-panel__same-name">
      <span className="atlas-online-panel__warning" role="note">{sameNameWarning(sameName.name)}</span>
      <Button variant="outline" size="sm" onClick={() => onLink(sameName.personId)}>{linkToLabel(sameName.name)}</Button>
    </div>
  );
}
```

Imports: `JoinIdentity` from `../../../online/sharing/people/IdentityDesk`; `KNOWN_PERSON_MARK`, `NEW_PERSON_MARK`, `linkToLabel` and `sameNameWarning` from `onlineCopy`. In `OnlinePanel.tsx`'s `HostingView`, pass `requests={session.requests}`.

Append to `src/app/react/components/online/online-panel.scss`:

```scss
.atlas-online-panel__identity {
  color: var(--text-muted);
  font-size: $font-ui-smaller;
}

.atlas-online-panel__same-name {
  align-items: flex-start;
}

.atlas-online-panel__warning {
  flex: 1;
  color: var(--text-warning);
  font-size: $font-ui-smaller;
}
```

- [ ] **Step 9: The People dialog**

Create `src/app/online/sharing/people/ui/PeopleList.tsx`:

```tsx
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { PeopleBook } from '../PeopleBook';
import { GM_PERSON_ID, keyOf, type Person } from '../peopleTypes';

export const NO_PEOPLE_TEXT = 'Nobody yet. People are added when you let them into your session or join someone else’s.';

interface PeopleListProps {
  people: Pick<PeopleBook, 'list' | 'rename' | 'merge' | 'remove' | 'subscribe'>;
  /** This Atlas's own table, shown as "Your table". */
  ownTableId: string | null;
  confirmRemove(person: Person): Promise<boolean>;
}

/** The heading of a table's group: yours, or the GM's name at theirs. */
function tableTitle(tableId: string, people: readonly Person[], ownTableId: string | null): string {
  if (tableId === ownTableId) return 'Your table';
  const gm = people.find((person) => person.tableId === tableId && person.personId === GM_PERSON_ID);
  return gm ? `${gm.name}’s table` : 'Another table';
}

function lastSeenText(time: number): string {
  return time > 0 ? `Last seen ${new Date(time).toLocaleDateString()}` : 'Not seen yet';
}

function PersonRow({ person, others, people, confirmRemove }: {
  person: Person; others: readonly Person[]; people: PeopleListProps['people']; confirmRemove: PeopleListProps['confirmRemove'];
}): React.ReactElement {
  const [name, setName] = useState(person.name);
  const [problem, setProblem] = useState<string | null>(null);
  const commit = (): void => {
    const result = people.rename(keyOf(person), name);
    setProblem(result);
    if (!result) setName(name.trim());
  };
  return (
    <li className="atlas-people__person">
      <div className="atlas-people__row">
        <input
          className="atlas-people__name"
          value={name}
          aria-label={`Name of ${person.name}`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
        />
        <select
          className="atlas-people__link dropdown"
          aria-label={`Link ${person.name} to`}
          value=""
          onChange={(event) => { if (event.target.value) setProblem(people.merge(keyOf(person), event.target.value)); }}
        >
          <option value="">Link to…</option>
          {others.map((other) => <option key={keyOf(other)} value={keyOf(other)}>{other.name}</option>)}
        </select>
        <LabelTooltip label={`Remove ${person.name}`}>
          <Button
            variant="ghost" size="icon" aria-label={`Remove ${person.name}`}
            onClick={() => { void confirmRemove(person).then((yes) => { if (yes) people.remove(keyOf(person)); }); }}
          >
            <X />
          </Button>
        </LabelTooltip>
      </div>
      <span className="atlas-people__seen">{lastSeenText(person.lastSeen)}</span>
      {problem && <span className="atlas-people__problem" role="alert">{problem}</span>}
    </li>
  );
}

/** Everyone this Atlas knows, by table: rename, link one person into another, remove. */
export function PeopleList({ people, ownTableId, confirmRemove }: PeopleListProps): React.ReactElement {
  // `list()` returns the same array until a change, as `useSyncExternalStore` requires.
  const subscribe = useCallback((onChange: () => void) => people.subscribe(onChange), [people]);
  const list = useSyncExternalStore(subscribe, () => people.list());
  if (list.length === 0) return <p className="atlas-people__empty">{NO_PEOPLE_TEXT}</p>;
  const tables = [...new Set(list.map((person) => person.tableId))];
  return (
    <div className="atlas-people">
      {tables.map((tableId) => (
        <section key={tableId} className="atlas-people__table" aria-label={tableTitle(tableId, list, ownTableId)}>
          <h3 className="atlas-people__heading">{tableTitle(tableId, list, ownTableId)}</h3>
          <ul className="atlas-people__list">
            {list.filter((person) => person.tableId === tableId).map((person) => (
              <PersonRow key={keyOf(person)} person={person} others={list.filter((other) => other !== person)} people={people} confirmRemove={confirmRemove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

Create `src/app/online/sharing/people/ui/PeopleModal.tsx`:

```tsx
import React from 'react';
import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../../ui/nativeModal';
import { confirmAction } from '../../../../ui/confirmDialog';
import { PEOPLE_LABEL } from '../../../ui/onlineCopy';
import { PeopleBook } from '../PeopleBook';
import { PeopleList } from './PeopleList';

/** The People dialog: Atlas's native modal with the people list. */
export class PeopleModal extends Modal {
  private root: Root | null = null;

  constructor(app: App, private readonly people: PeopleBook, private readonly ownTableId: string | null) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-people-modal');
  }

  onOpen(): void {
    this.setTitle(PEOPLE_LABEL);
    this.root = createRoot(this.contentEl);
    void this.people.ready().then(() => {
      this.root?.render(
        <PeopleList
          people={this.people}
          ownTableId={this.ownTableId}
          confirmRemove={(person) => confirmAction({
            title: `Remove ${person.name}?`,
            message: ['They join as new next time, and what you share with them by name stops reaching them.'],
            confirmLabel: 'Remove', destructive: true,
          })}
        />,
      );
    });
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}

/** Opens the People dialog; `ownTableId` (this Atlas's table, from the settings) heads its own group. */
export function openPeopleModal(app: App, ownTableId: string | null): void {
  new PeopleModal(app, PeopleBook.forApp(app), ownTableId).open();
}
```

Create `src/app/online/sharing/people/ui/people.scss`:

```scss
// The People dialog. Imported inside the `.atlas-vtt-plugin` scope of styles/main.scss.
@use '../../../../../../styles/tokens' as *;
@use '../../../../../../styles/mixins' as *;

.atlas-people {
  @include atlas-flex-col($spacing-m);
}

.atlas-people__table {
  @include atlas-flex-col($spacing-s);
}

.atlas-people__heading {
  margin: 0;
  font-size: $font-ui-smaller;
  font-weight: $font-weight-semibold;
  color: var(--text-muted);
}

.atlas-people__list {
  @include atlas-flex-col($spacing-s);
  margin: 0;
  padding: 0;
  list-style: none;
}

.atlas-people__person {
  @include atlas-flex-col($spacing-xs);
}

.atlas-people__row {
  @include atlas-flex-row($spacing-s);
}

.atlas-people__name {
  @include atlas-text-input;
  flex: 1;
  min-width: 0;
}

.atlas-people__seen,
.atlas-people__empty {
  @include atlas-help-text;
  margin: 0;
}

.atlas-people__problem {
  color: var(--text-error);
  font-size: $font-ui-smaller;
}
```

In `styles/main.scss`, inside the `.atlas-vtt-plugin` block after the online imports, add `@import '../src/app/online/sharing/people/ui/people.scss';`.

- [ ] **Step 10: Register the command and the player's records**

Create `src/app/online/sharing/registerSharing.ts`:

```ts
/** Sharing between Obsidian clients: commands, and what each session teaches the people list. Tasks 3–6 add to it. */
import type { Plugin } from 'obsidian';
import { joinedSessionStore } from '../obsidian/joinedSessionStore';
import type { OnlineJoinService } from '../obsidian/OnlineJoinService';
import type { SettingsService } from '../../services/SettingsService';
import type { PeopleBook } from './people/PeopleBook';
import { recordSessionPeople } from './people/sessionPeople';
import { openPeopleModal } from './people/ui/PeopleModal';

export interface SharingServices {
  joins: OnlineJoinService;
  people: PeopleBook;
  settings: SettingsService;
}

export function registerSharing(plugin: Plugin, services: SharingServices): void {
  const { joins, people, settings } = services;
  plugin.addCommand({
    id: 'people', name: 'People…',
    callback: () => openPeopleModal(plugin.app, settings.getOnlineSettings().table?.id ?? null),
  });
  // A joined session with a checked table: record the GM and everyone with a person id, now and on every presence.
  const record = (): void => {
    const identity = joins.identity;
    const players = joinedSessionStore.getState().session?.players ?? [];
    if (identity) void people.ready().then(() => recordSessionPeople(people, identity, players));
  };
  plugin.register(joins.onIdentity(record));
  plugin.register(joinedSessionStore.subscribe(record));
}
```

In `main.ts`, after `registerOnline(this, onlineSessions);`:

```ts
    registerSharing(this, { joins: onlineJoins, people: PeopleBook.forApp(this.app), settings: this.settingsService });
```

with the imports `import { registerSharing } from './src/app/online/sharing/registerSharing';` and `import { PeopleBook } from './src/app/online/sharing/people/PeopleBook';`.

- [ ] **Step 11: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing tests/unit/online/onlineSessionService.test.ts tests/unit/online/onlineUi.test.ts`
Expected: PASS.

- [ ] **Step 12: The full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/app/online/sharing/dataFile.ts src/app/online/sharing/people src/app/online/sharing/registerSharing.ts \
  src/app/online/onlineSessionStore.ts src/app/online/OnlineSessionService.ts src/app/online/ui/joinRequestNotice.ts \
  src/app/online/ui/onlineCopy.ts src/app/react/components/online/OnlinePlayerList.tsx src/app/react/components/online/OnlinePanel.tsx \
  src/app/react/components/online/online-panel.scss styles/main.scss main.ts \
  tests/unit/online/sharing tests/unit/online/onlineSessionService.test.ts
git commit -m "feat(online): a people list, known and new join requests, linking by the GM"
```

---
### Task 3: The sharing model, filtering and the Share with… dialog

This task covers what is shared with whom, and what each person gets.
- Notes carry `atlas-share`, and maps carry `data.sharing` on their scene record.
- A filter on the sender's machine removes `[!private]`, `[!only|…]`, `[!except|…]` and comments per recipient, fail-closed. It keeps whitelisted properties and turns links to notes the recipient does not get into text.
- Map payloads are built for player-safe and full shares.
- A catalogue answers "what may this person list and open".
- **Share with…** writes the property or the scene record and previews per person.

Nothing here sends anything; Task 4 serves the catalogue.

**Files:**
- Create: `src/app/online/sharing/model/shareRule.ts`
- Create: `src/app/online/sharing/model/audience.ts`
- Create: `src/app/online/sharing/model/frontmatterFilter.ts`
- Create: `src/app/online/sharing/model/noteFilter.ts`
- Create: `src/app/online/sharing/model/noteLinks.ts`
- Create: `src/app/online/sharing/model/ShareItems.ts`
- Create: `src/app/online/sharing/model/mapShare.ts`
- Create: `src/app/online/sharing/model/linkedNotes.ts`
- Create: `src/app/online/sharing/model/mapPayload.ts`
- Create: `src/app/online/sharing/model/buildMapPayload.ts`
- Create: `src/app/online/sharing/model/catalogueAccess.ts`
- Create: `src/app/online/sharing/model/SenderCatalogue.ts`
- Create: `src/app/online/sharing/model/catalogueSources.ts`
- Create: `src/app/online/sharing/model/shareWriting.ts`
- Create: `src/app/online/sharing/ui/ShareWithForm.tsx`, `src/app/online/sharing/ui/ShareWithModal.tsx`, `src/app/online/sharing/ui/sharing.scss`
- Modify: `src/app/online/sharing/registerSharing.ts` (command, file menu, renames)
- Modify: `src/app/online/onlineSettings.ts` (`shareableProperties`), `src/app/settings/onlineSettingsSection.ts`
- Modify: `src/app/services/AssetService.ts` (`SceneAssetData.sharing`), `src/app/services/assetTransfer/transferRecords.ts`
- Modify: `styles/main.scss`
- Test: `tests/unit/online/sharing/shareRule.test.ts`
- Test: `tests/unit/online/sharing/noteFilter.test.ts`
- Test: `tests/unit/online/sharing/noteLinks.test.ts`
- Test: `tests/unit/online/sharing/shareItems.test.ts`
- Test: `tests/unit/online/sharing/mapShare.test.ts`
- Test: `tests/unit/online/sharing/mapPayload.test.ts`
- Test: `tests/unit/online/sharing/senderCatalogue.test.ts`
- Test: `tests/unit/online/sharing/shareWithForm.test.tsx`

**Interfaces:**
- Consumes:
  - Task 2: `PeopleBook` (`byName`, `byKey`, `list`), `Person`, `personKey`, `keyOf`, `JsonDataFile`, `SHARING_DATA_DIR`.
  - Existing:
    - `projectForPlayers`, `ProjectedState`, `projectFog`, `createProjectionMemo`, `FogCoverage`;
    - `sceneAssetIds`, `sha256Id`, `mimeForPath`, `ASSET_LIMITS`, `ImageFiles`;
    - `migrateMapFile`, `isPersistedMapEnvelope`, `MapFile`, `mapStrings`, `pickPlayerViewRules`, `collectionGridDefaultsFor`, `imageDimensions`.
- Produces:
  - `SHARE_PROPERTY = 'atlas-share'`, `ShareRule`, `ShareChoice`, `parseShareRule(value)`, `formatShareRule(choice)`, `unknownRuleNames(rule, people)`.
  - `Recipient { tableId; personId }`, `NameResolver`, `isPerson(person, recipient)`, `ruleReaches(rule, recipient, people)`, `calloutAllows(rule, recipient, people)`.
  - `CalloutRule`, `filterNoteFor(source, context): string`, `unknownNamesIn(source, people): string[]`, `NoteFilterContext`.
  - `LinkResolver`, `rewriteLinks(text, resolve)`.
  - `ShareItems` with `forApp`, `ready`, `idFor(path)`, `pathOf(item)`, `renamed(from, to)` and `deleted(path)`.
  - `MapShareMode`, `MapShare`, `mapShareOf(scene)`, `parseMapShare`, `mapShareReaches`, `withoutSharing`, `writeMapShare`.
  - `LinkedNote`, `linkedNotesOf(map)`, `offeredNotes(map, mode)`.
  - From `mapPayload.ts`:
    - `MAP_PAYLOAD_FORMAT`, `IMAGE_REF_PREFIX`, `NOTE_REF_PREFIX`
    - `SharedPin`, `PlayerSafeMapPayload`, `FullMapPayload`, `MapPayload`
    - `parseMapPayload(value)`
  - From `buildMapPayload.ts`: `SharedMapSource`, `MapImages`, `PayloadContext`, `imagePathsOf`, `hashMapImages`, `playerSafePayload`, `fullPayload`, `readSharedMap(read, mapPath)`.
  - From `SenderCatalogue.ts`:
    - `CatalogueItem { item; kind: 'note' | 'map'; title; version; size; mode?; linked? }`
    - `SharePayload { kind: 'note' | 'map' | 'image'; bytes: ArrayBuffer; version; mime? }`
    - `CatalogueSources`, `MAX_CATALOGUE_ITEMS`
    - `class SenderCatalogue` with `list(recipient)`, `open(recipient, ref)` and `previewNote(recipient, path)`
  - `obsidianCatalogueSources(app, settings)`.
  - `writeNoteShare(app, file, value): Promise<ShareRule>`.
  - `openShareWithModal(app, file, deps)`; `OnlineSettings.shareableProperties: string[]`.

- [ ] **Step 1: Write the failing rule and filter tests**

Create `tests/unit/online/sharing/shareRule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calloutAllows, ruleReaches } from '../../../../src/app/online/sharing/model/audience';
import { formatShareRule, parseShareRule, unknownRuleNames } from '../../../../src/app/online/sharing/model/shareRule';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const person = (personId: string, name: string, extra: Partial<Person> = {}): Person =>
  ({ tableId: T, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0, ...extra });
const ana = person('ana', 'Ana', { formerNames: ['Annie'] });
const ben = person('ben', 'Ben');
const cara = person('cara', 'Cara');
const people = { byName: (name: string): Person | null => [ana, ben, cara].find((p) => p.name === name || p.formerNames.includes(name)) ?? null };
const as = (p: Person) => ({ tableId: p.tableId, personId: p.personId });

describe('atlas-share', () => {
  it('reads every form of the spec', () => {
    expect(parseShareRule('public')).toEqual({ private: false, public: true, only: [], except: [] });
    expect(parseShareRule('private')).toMatchObject({ private: true });
    expect(parseShareRule(undefined)).toEqual({ private: false, public: false, only: [], except: [] });
    expect(parseShareRule(['Ana', 'Ben'])).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule(['only Ana', 'ONLY Ben'])).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule(['public', 'except Cara'])).toMatchObject({ public: true, except: ['Cara'] });
    expect(parseShareRule('Ana, Ben')).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule([7, '  ', 'Ana'])).toMatchObject({ only: ['Ana'] });
  });

  it('decides who it reaches: private wins over everything, except over a name, unknown except reaches nobody', () => {
    expect(ruleReaches(parseShareRule('public'), as(cara), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'Ben']), as(ana), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'Ben']), as(cara), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Cara']), as(cara), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Cara']), as(ben), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'except Ana']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'private']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Zed']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule('Annie'), as(ana), people)).toBe(true); // a former name still reaches her
    expect(ruleReaches(parseShareRule('Ana'), { tableId: 'U'.repeat(43), personId: 'ana' }, people)).toBe(false); // another table
    expect(unknownRuleNames(parseShareRule(['Ana', 'except Zed', 'Yan']), people)).toEqual(['Yan', 'Zed']);
  });

  it('writes what the dialog chose', () => {
    expect(formatShareRule({ everyone: true, people: [], except: [] })).toBe('public');
    expect(formatShareRule({ everyone: true, people: ['Ana'], except: ['Cara'] })).toEqual(['public', 'except Cara']);
    expect(formatShareRule({ everyone: false, people: ['Ana', 'Ben'], except: ['Cara'] })).toEqual(['Ana', 'Ben']);
    expect(formatShareRule({ everyone: false, people: [], except: [] })).toBeNull();
  });

  it('checks callouts: private never, only those, except all but those, unknown names fail closed', () => {
    expect(calloutAllows({ kind: 'private' }, as(ana), people)).toBe(false);
    expect(calloutAllows({ kind: 'only', names: ['Ana', 'Zed'] }, as(ana), people)).toBe(true);
    expect(calloutAllows({ kind: 'only', names: ['Zed'] }, as(ana), people)).toBe(false);
    expect(calloutAllows({ kind: 'except', names: ['Cara'] }, as(ana), people)).toBe(true);
    expect(calloutAllows({ kind: 'except', names: ['Cara'] }, as(cara), people)).toBe(false);
    expect(calloutAllows({ kind: 'except', names: ['Zed'] }, as(ana), people)).toBe(false);
  });
});
```

Create `tests/unit/online/sharing/noteFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterNoteFor, unknownNamesIn } from '../../../../src/app/online/sharing/model/noteFilter';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const person = (personId: string, name: string): Person => ({ tableId: T, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0 });
const list = [person('ana', 'Ana'), person('ben', 'Ben'), person('cara', 'Cara')];
const people = { byName: (name: string): Person | null => list.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null };
const forPerson = (personId: string, source: string, shareable: string[] = ['tags']): string =>
  filterNoteFor(source, { recipient: { tableId: T, personId }, people, shareable, links: () => null });

describe('filtering a note for one person', () => {
  it('never sends private callouts', () => {
    const source = 'Open.\n\n> [!private]\n> Secret.\n> More secret.\n\nAfter.';
    expect(forPerson('ana', source)).toBe('Open.\n\n\nAfter.');
  });

  it('sends only and except sections to the right people, case-insensitively', () => {
    const source = '> [!ONLY|ana, Ben]\n> For two.\n\n> [!except|Cara]\n> Not Cara.\n\nAll.';
    expect(forPerson('ana', source)).toBe(source);
    expect(forPerson('cara', source)).toBe('\n\nAll.');
    expect(forPerson('ben', source)).toContain('For two.');
  });

  it('nested sections must pass every rule', () => {
    const source = '> [!only|Ana, Ben]\n> Both.\n> > [!except|Ben]\n> > Ana only.\n>\n> Both again.';
    expect(forPerson('ana', source)).toBe(source);
    expect(forPerson('ben', source)).toBe('> [!only|Ana, Ben]\n> Both.\n>\n> Both again.');
    expect(forPerson('cara', source)).toBe('');
  });

  it('lazy continuation stays private: only a blank line, a heading or a fence ends a callout', () => {
    expect(forPerson('ana', '> [!private]\n> Secret.\nStill secret, rendered inside.\n\nPublic.')).toBe('\nPublic.');
    expect(forPerson('ana', '> [!private]\n> Secret.\n# Heading\nPublic.')).toBe('# Heading\nPublic.');
    expect(forPerson('ana', '> [!private]\n> Secret.\n```\ncode\n```')).toBe('```\ncode\n```');
    // A deeper callout continues lazily onto a shallower quote line, and a callout header inside one is text of it.
    expect(forPerson('ana', '> > [!private]\n> > Secret.\n> lazy secret\n> [!only|Ana]\n>\n> shown')).toBe('>\n> shown');
  });

  it('removes comments inline and across lines, but not inside code fences', () => {
    const source = 'A %%hidden%% B\n%%\nhidden\n%%\nC\n```\n%% kept in code %%\n```';
    expect(forPerson('ana', source)).toBe('A  B\nC\n```\n%% kept in code %%\n```');
    expect(forPerson('ana', 'x %% open to the end\nstill hidden')).toBe('x');
  });

  it('unknown names: only reaches nobody, except hides from everyone, and the sender is told', () => {
    const source = '> [!only|Zed]\n> Z.\n\n> [!except|Yan]\n> Y.\n\nRest.';
    expect(forPerson('ana', source)).toBe('\n\nRest.');
    expect(unknownNamesIn(source, people)).toEqual(['Yan', 'Zed']);
    expect(unknownNamesIn('---\natlas-share: [Ana, except Quin]\n---\nx', people)).toEqual(['Quin']);
  });

  it('keeps only shareable properties and never atlas-share', () => {
    const source = '---\natlas-share: [Ana]\ntags:\n  - npc\nsecret: gold\naliases: [Bob]\n# comment\n---\nBody';
    expect(forPerson('ana', source, ['tags', 'atlas-share'])).toBe('---\ntags:\n  - npc\n---\nBody');
    expect(forPerson('ana', source, [])).toBe('Body');
    expect(forPerson('ana', '---\nunclosed\nBody')).toBe('---\nunclosed\nBody');
  });
});
```

Create `tests/unit/online/sharing/noteLinks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rewriteLinks } from '../../../../src/app/online/sharing/model/noteLinks';

const shared = (path: string): string | null => (path === 'Cave' || path === 'Places/Cave.md' ? 'Cave' : null);

describe('links in shared notes', () => {
  it('keeps links to notes the receiver gets, by their shared title', () => {
    expect(rewriteLinks('See [[Cave]], [[Cave#Entrance|the entrance]] and ![[Cave]].', shared))
      .toBe('See [[Cave]], [[Cave#Entrance|the entrance]] and ![[Cave]].');
    expect(rewriteLinks('[into](Places/Cave.md)', shared)).toBe('[[Cave|into]]');
  });

  it('turns other links into their text', () => {
    expect(rewriteLinks('[[Secret lair]] and [[Folder/Secret lair|the lair]] and [[#Heading]]', shared))
      .toBe('Secret lair and the lair and Heading');
    expect(rewriteLinks('![[map.png]] [x](Notes/Hidden%20one.md)', shared)).toBe('map.png x');
  });

  it('leaves web links alone', () => {
    expect(rewriteLinks('[site](https://example.org) ![](https://example.org/a.png)', shared))
      .toBe('[site](https://example.org) ![](https://example.org/a.png)');
  });
});
```

- [ ] **Step 2: Write the failing items, map share and payload tests**

Create `tests/unit/online/sharing/shareItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ShareItems, ITEMS_FILE } from '../../../../src/app/online/sharing/model/ShareItems';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

describe('ShareItems', () => {
  it('gives each note a random id that follows renames and goes with deletions', async () => {
    const { app, files } = createInMemoryApp();
    const items = ShareItems.create(app.vault.adapter);
    await items.ready();
    const id = items.idFor('Notes/Cave.md');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).not.toContain('Cave');
    expect(items.idFor('Notes/Cave.md')).toBe(id);
    items.renamed('Notes/Cave.md', 'Places/Cave.md');
    expect(items.pathOf(id)).toBe('Places/Cave.md');
    items.renamed('Places', 'World/Places');
    expect(items.pathOf(id)).toBe('World/Places/Cave.md');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(files.get(ITEMS_FILE)!).notes).toEqual({ 'World/Places/Cave.md': id });
    items.deleted('World');
    expect(items.pathOf(id)).toBeNull();
  });
});
```

Create `tests/unit/online/sharing/mapShare.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AssetMetadata, SceneAsset } from '../../../../src/app/services/AssetService';
import { transferredRecord } from '../../../../src/app/services/assetTransfer/transferRecords';
import { adoptUnindexedFiles } from '../../../../src/app/services/vault-sync/assetAdoption';
import { mapShareOf, mapShareReaches, parseMapShare, writeMapShare, type MapShare } from '../../../../src/app/online/sharing/model/mapShare';
import { linkedNotesOf, offeredNotes } from '../../../../src/app/online/sharing/model/linkedNotes';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const share: MapShare = { item: 'i'.repeat(22), everyone: false, people: [`${T}/ana`], except: [], mode: 'player-safe', notes: ['Notes/Inn.md'] };
const scene = (data: SceneAsset['data']): SceneAsset => ({ id: 's1', type: 'scene', name: 'Inn', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, ...(data ? { data } : {}) });

describe('map shares on scene records', () => {
  it('reads only well-formed shares', () => {
    expect(mapShareOf(scene({ mapPath: 'm.atlasmap', sharing: share }))).toEqual(share);
    expect(parseMapShare({ ...share, mode: 'everything' })).toBeNull();
    expect(parseMapShare({ ...share, item: 'short' })).toBeNull();
    expect(mapShareOf(scene({ mapPath: 'm.atlasmap' }))).toBeNull();
  });

  it('reaches people by key, aliases included, and never the excepted', () => {
    const ana: Person = { tableId: T, personId: 'ana', name: 'Ana', formerNames: [], devices: [], aliases: [`${T}/old`], lastSeen: 0 };
    const people = { byKey: (key: string): Person | null => (key === `${T}/ana` || key === `${T}/old` ? ana : null) };
    expect(mapShareReaches(share, { tableId: T, personId: 'ana' }, people)).toBe(true);
    expect(mapShareReaches({ ...share, people: [`${T}/old`] }, { tableId: T, personId: 'ana' }, people)).toBe(true);
    expect(mapShareReaches(share, { tableId: T, personId: 'ben' }, people)).toBe(false);
    expect(mapShareReaches({ ...share, everyone: true, except: [`${T}/ana`] }, { tableId: T, personId: 'ana' }, people)).toBe(false);
  });

  it('writes and clears through the scene record, keeping its other data', async () => {
    const assets = { updateAsset: vi.fn(async () => {}) };
    await writeMapShare(assets, scene({ mapPath: 'm.atlasmap' }), share);
    expect(assets.updateAsset).toHaveBeenLastCalledWith('s1', { data: { mapPath: 'm.atlasmap', sharing: share } });
    await writeMapShare(assets, scene({ mapPath: 'm.atlasmap', sharing: share }), null);
    expect(assets.updateAsset).toHaveBeenLastCalledWith('s1', { data: { mapPath: 'm.atlasmap' } });
  });

  it('survives the vault check and is dropped from copies', () => {
    const json = 'atlas-vtt/collections/c/scenes/s1.json';
    const map = 'atlas-vtt/collections/c/scenes/Inn.atlasmap';
    const metadata = { assets: {}, collections: {} } as unknown as AssetMetadata;
    adoptUnindexedFiles(metadata, new Set([json, map]), new Map([[json, { name: 'Inn', mapPath: map, sharing: share }]]), new Set(), 1);
    expect((Object.values(metadata.assets)[0] as SceneAsset).data?.sharing).toEqual(share);
    const plan = { steps: [], rewrites: new Map<string, string>(), recordPaths: new Map<string, string>() };
    const copy = transferredRecord(scene({ mapPath: map, sharing: share }), { targetCollectionId: 'd', newIds: new Map([['s1', 's2']]), plan, now: 2 });
    expect((copy as SceneAsset).data).toEqual({ mapPath: map });
    const moved = transferredRecord(scene({ mapPath: map, sharing: share }), { targetCollectionId: 'd', newIds: new Map(), plan, now: 2 });
    expect((moved as SceneAsset).data?.sharing).toEqual(share);
  });
});

describe('linked notes of a map', () => {
  const map = migrateMapFile({
    background: 'maps/inn.png',
    objects: {
      pins: { p1: { id: 'p1', kind: 'pin', x: 1, y: 1, notePath: 'Notes/Inn.md' }, p2: { id: 'p2', kind: 'pin', x: 2, y: 2, notePath: 'Notes/Plot.md', gmOnly: true } },
      tokens: {
        t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: 'a.png', notePath: 'Notes/Hero.md' },
        t2: { id: 't2', kind: 'character', x: 0, y: 0, imagePath: 'b.png', statblockPath: 'Monsters/Ogre.md', isHidden: true },
      },
    },
  });

  it('lists pins and tokens, and player-safe shares never offer what players cannot see', () => {
    expect(linkedNotesOf(map).map((note) => [note.path, note.hidden])).toEqual([
      ['Notes/Inn.md', false], ['Notes/Plot.md', true], ['Notes/Hero.md', false], ['Monsters/Ogre.md', true],
    ]);
    expect(offeredNotes(map, 'player-safe').map((note) => note.path)).toEqual(['Notes/Inn.md', 'Notes/Hero.md']);
    expect(offeredNotes(map, 'full')).toHaveLength(4);
  });
});
```

Create `tests/unit/online/sharing/mapPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fullPayload, playerSafePayload, type PayloadContext, type SharedMapSource } from '../../../../src/app/online/sharing/model/buildMapPayload';
import { IMAGE_REF_PREFIX, NOTE_REF_PREFIX, parseMapPayload } from '../../../../src/app/online/sharing/model/mapPayload';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';

const state = {
  background: 'maps/inn.png',
  grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
  objects: {
    tokens: {
      hero: { id: 'hero', kind: 'character', x: 70, y: 70, imagePath: 'art/hero.png', name: 'Hero', notePath: 'Notes/Hero.md' },
      spy: { id: 'spy', kind: 'character', x: 140, y: 70, imagePath: 'art/spy.png', isHidden: true, notePath: 'Notes/Spy.md' },
    },
    pins: {
      inn: { id: 'inn', kind: 'pin', x: 10, y: 10, notePath: 'Notes/Inn.md' },
      plot: { id: 'plot', kind: 'pin', x: 20, y: 20, notePath: 'Notes/Plot.md', gmOnly: true },
    },
    walls: { w: { id: 'w' } },
  },
  dmNotePath: 'GM/Prep.md',
};

function source(): SharedMapSource {
  const map = migrateMapFile(state);
  return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: { dmNotePath: 'GM/Prep.md' } };
}

const context = (ticked: string[]): PayloadContext => ({
  rules: { showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: true, showWidgets: true, showInitiative: true },
  collectionGrid: null,
  images: { fingerprints: new Map([['maps/inn.png', 'M'.repeat(43)], ['art/hero.png', 'H'.repeat(43)], ['art/spy.png', 'S'.repeat(43)]]), size: { width: 700, height: 700 } },
  noteItem: (path) => (ticked.includes(path) ? `item-${path.length}`.padEnd(22, 'x') : null),
  linked: ticked.map((path) => `item-${path.length}`.padEnd(22, 'x')),
  isFile: (path) => /\.(md|png)$/.test(path),
});

describe('map payloads', () => {
  it('player-safe: what players see, pins that are not GM-only, notes only when ticked', () => {
    const payload = playerSafePayload(source(), 'Inn', context(['Notes/Inn.md', 'Notes/Plot.md', 'Notes/Hero.md']));
    expect(Object.keys(payload.scene.tokens)).toEqual(['hero']);
    expect(payload.scene.map.asset).toBe('M'.repeat(43));
    expect(payload.pins.map((pin) => pin.x)).toEqual([10]);
    expect(Object.keys(payload.tokenNotes)).toEqual(['hero']);
    expect(payload.images.sort()).toEqual(['H'.repeat(43), 'M'.repeat(43)]);
    expect(JSON.stringify(payload)).not.toMatch(/Notes\/|art\/|maps\/|GM\//);
    expect(parseMapPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it('full: everything, with images and ticked notes as references and every other path cleared', () => {
    const payload = fullPayload(source(), 'Inn', context(['Notes/Inn.md']));
    const text = JSON.stringify(payload);
    expect(text).toContain(`${IMAGE_REF_PREFIX}${'S'.repeat(43)}`);
    expect(text).toContain(NOTE_REF_PREFIX);
    expect(text).not.toMatch(/Notes\/|art\/|maps\/|GM\//);
    expect(payload.map).toMatchObject({ objects: { walls: { w: { id: 'w' } } } });
    expect(parseMapPayload(JSON.parse(text))).toEqual(payload);
  });

  it('refuses payloads of the wrong shape', () => {
    expect(parseMapPayload({ format: 'other' })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'player-safe', name: 'x', scene: {}, pins: [], tokenNotes: {}, notes: [], images: [] })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'full', name: 'x', map: [], notes: [], images: [] })).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing catalogue and dialog tests**

Create `tests/unit/online/sharing/senderCatalogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SenderCatalogue, type CatalogueSources } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { parseShareRule } from '../../../../src/app/online/sharing/model/shareRule';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';
import { memoryImageFiles, nodeHash } from '../assetFixtures';

const T = 'T'.repeat(43);
const person = (personId: string, name: string): Person => ({ tableId: T, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0 });
const list = [person('ana', 'Ana'), person('ben', 'Ben')];
const people = {
  byName: (name: string): Person | null => list.find((p) => p.name === name) ?? null,
  byKey: (key: string): Person | null => list.find((p) => `${p.tableId}/${p.personId}` === key) ?? null,
};
const ana = { tableId: T, personId: 'ana' };
const ben = { tableId: T, personId: 'ben' };

function catalogue() {
  const notes: Record<string, string> = {
    'Notes/Cave.md': '---\natlas-share: [Ana]\n---\nThe cave. [[Lair]] and [[Inn]].\n> [!private]\n> Dragon.',
    'Notes/Lair.md': 'No property: private by default.',
    'Notes/Inn.md': 'The inn.',
  };
  const ids = new Map<string, string>();
  const items = {
    idFor: (path: string): string => { if (!ids.has(path)) ids.set(path, `id${ids.size}`.padEnd(22, '0')); return ids.get(path)!; },
    pathOf: (item: string): string | null => [...ids].find(([, id]) => id === item)?.[0] ?? null,
  };
  const map = migrateMapFile({ background: 'maps/inn.png', objects: { pins: { p: { id: 'p', kind: 'pin', x: 1, y: 1, notePath: 'Notes/Inn.md' } } } });
  const sources: CatalogueSources = {
    notes: () => [{ path: 'Notes/Cave.md', title: 'Cave', rule: parseShareRule(['Ana']) }],
    note: (path) => (notes[path] !== undefined ? { path, title: path.slice(6, -3), rule: parseShareRule(undefined) } : null),
    read: async (path) => notes[path] ?? '',
    maps: async () => [{ name: 'Inn', mapPath: 'm.atlasmap', share: { item: 'm'.repeat(22), everyone: false, people: [`${T}/ben`], except: [], mode: 'player-safe', notes: ['Notes/Inn.md'] } }],
    readMap: async () => ({ map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: {} }),
    images: memoryImageFiles({ 'maps/inn.png': 'png-bytes' }).source,
    isFile: (path) => path in notes || path === 'maps/inn.png',
    resolveLink: (linkpath) => (`Notes/${linkpath}.md` in notes ? `Notes/${linkpath}.md` : null),
    shareable: () => [],
    rules: () => ({ showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: false, showWidgets: true, showInitiative: true }),
    collectionGrid: () => null,
  };
  return { catalogue: new SenderCatalogue(sources, items, people, nodeHash, async () => ({ width: 100, height: 100 })), items };
}

const text = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

describe('SenderCatalogue', () => {
  it('lists per person: Ana gets the cave, Ben the map and its ticked note', async () => {
    const { catalogue } = catalogue();
    expect((await catalogue.list(ana)).map((item) => [item.kind, item.title])).toEqual([['note', 'Cave']]);
    const forBen = await catalogue.list(ben);
    expect(forBen.map((item) => [item.kind, item.title])).toEqual([['note', 'Inn'], ['map', 'Inn']]);
    expect(forBen[1]).toMatchObject({ mode: 'player-safe', linked: [forBen[0]!.item] });
  });

  it('opens only what the person may have, filtered for them, versioned by the filtered text', async () => {
    const { catalogue, items } = catalogue();
    const [cave] = await catalogue.list(ana);
    const payload = (await catalogue.open(ana, cave!.item))!;
    expect(text(payload.bytes)).toBe('The cave. Lair and Inn.');
    expect(payload.version).toBe(cave!.version);
    expect(await catalogue.open(ben, cave!.item)).toBeNull();
    expect(await catalogue.open(ana, items.idFor('Notes/Lair.md'))).toBeNull();
  });

  it('serves a shared map’s image by fingerprint, checked, and nothing else', async () => {
    const { catalogue } = catalogue();
    const map = (await catalogue.list(ben)).find((item) => item.kind === 'map')!;
    const payload = JSON.parse(text((await catalogue.open(ben, map.item))!.bytes));
    const image = await catalogue.open(ben, `${map.item}/${payload.images[0]}`);
    expect(image).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(text(image!.bytes)).toBe('png-bytes');
    expect(await catalogue.open(ana, `${map.item}/${payload.images[0]}`)).toBeNull();
    expect(await catalogue.open(ben, `${map.item}/${'X'.repeat(43)}`)).toBeNull();
  });
});
```

Create `tests/unit/online/sharing/shareWithForm.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareWithForm, type ShareRow } from '../../../../src/app/online/sharing/ui/ShareWithForm';

const rows: ShareRow[] = [{ key: 'k/ana', name: 'Ana', known: true }, { key: 'k/ben', name: 'Ben', known: true }, { key: 'name:Zed', name: 'Zed', known: false }];

describe('Share with form', () => {
  it('ticks people or everyone with exceptions, warns about unknown names and previews per person', async () => {
    const save = vi.fn();
    const preview = vi.fn(async (key: string) => `text for ${key}`);
    render(<ShareWithForm rows={rows} initial={{ everyone: false, people: ['k/ana', 'name:Zed'], except: [] }} map={null}
      preview={preview} warnings={['Not in your people list: Zed.']} onSave={save} onCancel={() => {}} />);
    expect(screen.getByText('Not in your people list: Zed.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Preview as'), { target: { value: 'k/ben' } });
    expect(await screen.findByText('text for k/ben')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Everyone in my sessions'));
    fireEvent.click(screen.getByLabelText('Except Ben'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith({ everyone: true, people: ['k/ana', 'name:Zed'], except: ['k/ben'], mode: 'player-safe', notes: [] });
  });

  it('for maps: player-safe or full, and linked notes, private ones disabled', () => {
    const save = vi.fn();
    render(<ShareWithForm rows={rows} initial={{ everyone: false, people: [], except: [] }}
      map={{ mode: 'player-safe', notes: [{ path: 'Notes/Inn.md', label: 'Inn', private: false }, { path: 'Notes/Plot.md', label: 'Plot', private: true }], ticked: [] }}
      preview={null} warnings={[]} onSave={save} onCancel={() => {}} />);
    fireEvent.click(screen.getByLabelText('Ana'));
    fireEvent.click(screen.getByLabelText('Full'));
    fireEvent.click(screen.getByLabelText('Inn'));
    expect((screen.getByLabelText('Plot') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Private')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith({ everyone: false, people: ['k/ana'], except: [], mode: 'full', notes: ['Notes/Inn.md'] });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing`
Expected: FAIL. The new `model/*` modules and `ShareWithForm` are not found.

- [ ] **Step 5: Implement rules, audience, filtering and links**

Create `src/app/online/sharing/model/shareRule.ts`:

```ts
/**
 * The `atlas-share` property: who a note is shared with. `public` is everyone in a session
 * with me, `private` (and no property) nobody, names only those people, `except Name`
 * everyone but them. `private` wins over everything and `except` over a name. Commas separate
 * names in a text value too. The property itself is never sent.
 */
import type { NameResolver } from './audience';

export const SHARE_PROPERTY = 'atlas-share';

export interface ShareRule {
  /** Set only by an explicit `private`. */
  private: boolean;
  public: boolean;
  only: string[];
  except: string[];
}

/** What the Share with… dialog chose: names for notes, person keys for maps. */
export interface ShareChoice {
  everyone: boolean;
  people: string[];
  except: string[];
}

function entriesOf(value: unknown): string[] {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return values.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [])).map((entry) => entry.trim()).filter(Boolean);
}

export function parseShareRule(value: unknown): ShareRule {
  const rule: ShareRule = { private: false, public: false, only: [], except: [] };
  for (const entry of entriesOf(value)) {
    const lower = entry.toLowerCase();
    if (lower === 'private') rule.private = true;
    else if (lower === 'public') rule.public = true;
    else if (/^except\s+/i.test(entry)) rule.except.push(entry.replace(/^except\s+/i, '').trim());
    else rule.only.push(entry.replace(/^only\s+/i, '').trim());
  }
  return rule;
}

/** The property value for a choice; null removes the property (nobody). */
export function formatShareRule(choice: ShareChoice): string | string[] | null {
  if (choice.everyone) return choice.except.length ? ['public', ...choice.except.map((name) => `except ${name}`)] : 'public';
  return choice.people.length ? [...choice.people] : null;
}

/** Names in the rule that are not in the people list, sorted. */
export function unknownRuleNames(rule: ShareRule, people: NameResolver): string[] {
  return [...new Set([...rule.only, ...rule.except].filter((name) => !people.byName(name)))].sort();
}
```

Create `src/app/online/sharing/model/audience.ts`:

```ts
/** Who a rule or a callout reaches. A recipient is a person at a table; names resolve through the people list. */
import { keyOf, personKey, type Person } from '../people/peopleTypes';
import type { CalloutRule } from './noteFilter';
import type { ShareRule } from './shareRule';

export interface Recipient {
  tableId: string;
  personId: string;
}

export interface NameResolver {
  byName(name: string): Person | null;
}

/** Whether `person` is the recipient, or was merged with them. */
export function isPerson(person: Person, recipient: Recipient): boolean {
  const key = personKey(recipient.tableId, recipient.personId);
  return keyOf(person) === key || person.aliases.includes(key);
}

function resolve(names: readonly string[], people: NameResolver): { known: Person[]; unknown: number } {
  const known: Person[] = [];
  let unknown = 0;
  for (const name of names) {
    const person = people.byName(name);
    if (person) known.push(person);
    else unknown++;
  }
  return { known, unknown };
}

/** An unknown name in `except` reaches nobody (fail closed); in `only` it matches nobody. */
export function ruleReaches(rule: ShareRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.private) return false;
  const except = resolve(rule.except, people);
  if (except.unknown > 0 || except.known.some((person) => isPerson(person, recipient))) return false;
  if (rule.public) return true;
  return resolve(rule.only, people).known.some((person) => isPerson(person, recipient));
}

export function calloutAllows(rule: CalloutRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.kind === 'private') return false;
  const names = resolve(rule.names, people);
  if (rule.kind === 'only') return names.known.some((person) => isPerson(person, recipient));
  return names.unknown === 0 && !names.known.some((person) => isPerson(person, recipient));
}
```

Create `src/app/online/sharing/model/frontmatterFilter.ts`:

```ts
/** A note's frontmatter, split off and reduced to the properties that may be shared. Text only, never parsed as YAML. */
import { SHARE_PROPERTY } from './shareRule';

export function splitFrontmatter(text: string): { frontmatter: string[] | null; body: string } {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { frontmatter: null, body: text };
  const end = lines.findIndex((line, index) => index > 0 && (line.trimEnd() === '---' || line.trimEnd() === '...'));
  if (end < 0) return { frontmatter: null, body: text };
  return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

const TOP_LEVEL_KEY = /^("[^"]+"|'[^']+'|[^\s#:'"-][^:]*?):(?:\s|$)/;

/** The lines of the top-level properties named in `keep` (case-insensitive), never `atlas-share`; comments and unreadable lines go. */
export function keepProperties(lines: readonly string[], keep: readonly string[]): string[] {
  const wanted = new Set(keep.map((key) => key.trim().toLowerCase()).filter((key) => key && key !== SHARE_PROPERTY));
  const out: string[] = [];
  let keeping = false;
  for (const line of lines) {
    const key = TOP_LEVEL_KEY.exec(line)?.[1];
    if (key !== undefined) {
      keeping = wanted.has(key.replace(/^["']|["']$/g, '').trim().toLowerCase());
      if (keeping) out.push(line);
    } else if (/^\S/.test(line) && !/^-(\s|$)/.test(line)) {
      keeping = false; // a comment or a line we cannot read at the top level
    } else if (keeping) {
      out.push(line);
    }
  }
  return out;
}
```

Create `src/app/online/sharing/model/noteFilter.ts`:

```ts
/**
 * What of a note one recipient gets, decided on the sender's machine before anything is
 * hashed or sent. Comments (`%% … %%`, outside code fences) go first, then callouts:
 * `[!private]` never, `[!only|names]` only those people, `[!except|names]` everyone but them,
 * and a section nested in another must pass every rule. A callout ends only at a blank line,
 * a heading or a fence at a lower quote depth: Obsidian continues a callout's paragraph onto
 * the following lines lazily, so anything else stays inside it (fail-closed). Then only
 * shareable properties stay and links to notes the recipient does not get become text.
 */
import { calloutAllows, type NameResolver, type Recipient } from './audience';
import { keepProperties, splitFrontmatter } from './frontmatterFilter';
import { rewriteLinks, type LinkResolver } from './noteLinks';
import { parseShareRule, SHARE_PROPERTY, unknownRuleNames } from './shareRule';

export type CalloutRule = { kind: 'private' } | { kind: 'only' | 'except'; names: string[] };

export interface NoteFilterContext {
  recipient: Recipient;
  people: NameResolver;
  /** Properties that may be shared (`online.shareableProperties`). */
  shareable: readonly string[];
  links: LinkResolver;
}

const CALLOUT_HEADER = /^\[!(private|only|except)(?:\|([^\]]*))?\]/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;

export function calloutRuleOf(content: string): CalloutRule | null {
  const match = CALLOUT_HEADER.exec(content.trimStart());
  if (!match) return null;
  const kind = (match[1] ?? '').toLowerCase();
  if (kind === 'private') return { kind: 'private' };
  const names = (match[2] ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  return { kind: kind === 'only' ? 'only' : 'except', names };
}

/** A line's blockquote depth and what follows its markers. */
function quoteOf(line: string): { depth: number; content: string } {
  let depth = 0;
  let rest = line;
  for (let marker = /^ {0,3}>/.exec(rest); marker; marker = /^ {0,3}>/.exec(rest)) {
    depth++;
    rest = rest.slice(marker[0].length);
    if (rest.startsWith(' ')) rest = rest.slice(1);
  }
  return { depth, content: rest };
}

/** Removes `%% … %%`; a line left with nothing (or only quote markers) goes, so no blank line appears where there was none. */
function stripComments(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inComment = false;
  let fence: string | null = null;
  for (const line of lines) {
    if (!inComment) {
      const marker = FENCE.exec(quoteOf(line).content)?.[1] ?? null;
      if (fence !== null) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
        out.push(line);
        continue;
      }
      if (marker) {
        fence = marker;
        out.push(line);
        continue;
      }
    }
    let kept = '';
    let rest = line;
    let touched = inComment;
    for (let at = rest.indexOf('%%'); ; at = rest.indexOf('%%')) {
      if (at < 0) {
        if (!inComment) kept += rest;
        break;
      }
      touched = true;
      if (!inComment) kept += rest.slice(0, at);
      inComment = !inComment;
      rest = rest.slice(at + 2);
    }
    if (!touched) out.push(line);
    else if (quoteOf(kept).content.trim() !== '') out.push(kept.trimEnd());
  }
  return out;
}

function filterCallouts(lines: readonly string[], allows: (rule: CalloutRule) => boolean): string[] {
  let open: Array<{ depth: number; allowed: boolean }> = [];
  const out: string[] = [];
  for (const line of lines) {
    const { depth, content } = quoteOf(line);
    const interrupts = content.trim() === '' || HEADING.test(content) || FENCE.test(content);
    // Only an interrupting line ends callouts, and only those deeper than it; anything else continues them lazily.
    if (interrupts) open = open.filter((callout) => callout.depth <= depth);
    // A header inside an open callout at the same or a lower depth is text of it: it nests, never replaces.
    const rule = depth > 0 ? calloutRuleOf(content) : null;
    if (rule) open.push({ depth, allowed: allows(rule) });
    if (open.every((callout) => callout.allowed)) out.push(line);
  }
  return out;
}

export function filterNoteFor(source: string, context: NoteFilterContext): string {
  const { frontmatter, body } = splitFrontmatter(source.replace(/\r\n?/g, '\n'));
  const properties = frontmatter ? keepProperties(frontmatter, context.shareable) : [];
  const lines = filterCallouts(stripComments(body.split('\n')), (rule) => calloutAllows(rule, context.recipient, context.people));
  const head = properties.length > 0 ? `---\n${properties.join('\n')}\n---\n` : '';
  return rewriteLinks(head + lines.join('\n'), context.links);
}

/** Names in the note's callouts and `atlas-share` that are not in the people list: the sender's warning. */
export function unknownNamesIn(source: string, people: NameResolver): string[] {
  const text = source.replace(/\r\n?/g, '\n');
  const { frontmatter, body } = splitFrontmatter(text);
  const names = new Set<string>();
  for (const line of body.split('\n')) {
    const rule = calloutRuleOf(quoteOf(line).content);
    if (rule && rule.kind !== 'private') rule.names.filter((name) => !people.byName(name)).forEach((name) => names.add(name));
  }
  const property = frontmatter?.find((line) => line.startsWith(`${SHARE_PROPERTY}:`));
  if (property) {
    const value = property.slice(SHARE_PROPERTY.length + 1).trim().replace(/^\[|\]$/g, '');
    unknownRuleNames(parseShareRule(value), people).forEach((name) => names.add(name));
  }
  return [...names].sort();
}
```

`unknownNamesIn` reads a one-line property only. The dialog checks the parsed property with `unknownRuleNames`, which also covers lists written across lines.

Create `src/app/online/sharing/model/noteLinks.ts`:

```ts
/**
 * Links in a shared note. A link to a note the receiver also gets points at that note's shared
 * title; every other link (and every embed of a file that is not a note) becomes its text, so
 * no name of an unshared note or file leaves the sender. Web links stay.
 */

/** The title the receiver knows a link target by; null when they do not get it. */
export type LinkResolver = (linkpath: string) => string | null;

const WIKI_LINK = /(!?)\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g;
const MARKDOWN_LINK = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

const nameOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/i, '');

function splitTarget(raw: string): { path: string; sub: string } {
  const at = raw.search(/[#^]/);
  return at < 0 ? { path: raw, sub: '' } : { path: raw.slice(0, at), sub: raw.slice(at) };
}

export function rewriteLinks(text: string, resolve: LinkResolver): string {
  const wiki = text.replace(WIKI_LINK, (_all: string, bang: string, raw: string, alias: string | undefined): string => {
    const { path, sub } = splitTarget(raw.trim());
    const title = path ? resolve(path) : null;
    if (title) return `${bang}[[${title}${sub}${alias !== undefined ? `|${alias}` : ''}]]`;
    return alias ?? (path ? nameOf(path) : sub.replace(/^[#^]/, ''));
  });
  return wiki.replace(MARKDOWN_LINK, (all: string, bang: string, label: string, raw: string): string => {
    const target = raw.trim().replace(/^<|>$/g, '').replace(/\s+"[^"]*"$/, '');
    if (EXTERNAL.test(target)) return all;
    let decoded = target;
    try {
      decoded = decodeURI(target);
    } catch {
      // keep the raw target
    }
    const { path, sub } = splitTarget(decoded);
    const title = path ? resolve(path) : null;
    if (!title) return label;
    return bang ? `![[${title}${sub}]]` : `[[${title}${sub}|${label}]]`;
  });
}
```

- [ ] **Step 6: Implement item ids, map shares and linked notes**

Create `src/app/online/sharing/model/ShareItems.ts`:

```ts
/**
 * Random ids for the sender's shared notes, kept in `items.json` in Atlas's sharing data, so no
 * path ever leaves the sender and a renamed note keeps its id (and the receiver's updates).
 * Follows the vault's renames (files and folders) and deletions.
 */
import type { App } from 'obsidian';
import { randomId } from '../../ids';
import { JsonDataFile, SHARING_DATA_DIR, type DataAdapterLike } from '../dataFile';

export const ITEMS_FILE = `${SHARING_DATA_DIR}/items.json`;

interface ItemsData {
  version: 1;
  notes: Record<string, string>;
}

function parseItems(value: unknown): ItemsData {
  const notes = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).notes : null;
  const entries = typeof notes === 'object' && notes !== null ? Object.entries(notes as Record<string, unknown>) : [];
  return { version: 1, notes: Object.fromEntries(entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && /^[A-Za-z0-9_-]{22}$/.test(entry[1]))) };
}

const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

export class ShareItems {
  private static readonly instances = new WeakMap<App, ShareItems>();
  static forApp(app: App): ShareItems {
    let items = this.instances.get(app);
    if (!items) {
      items = ShareItems.create(app.vault.adapter);
      this.instances.set(app, items);
    }
    return items;
  }

  static create(adapter: DataAdapterLike): ShareItems {
    return new ShareItems(new JsonDataFile(adapter, ITEMS_FILE, parseItems));
  }

  private notes: Record<string, string> = {};
  private loading: Promise<void> | null = null;

  constructor(private readonly file: JsonDataFile<ItemsData>) {}

  ready(): Promise<void> {
    this.loading ??= this.file.load().then((data) => { this.notes = { ...data.notes, ...this.notes }; });
    return this.loading;
  }

  idFor(path: string): string {
    const known = this.notes[path];
    if (known) return known;
    const id = randomId();
    this.notes = { ...this.notes, [path]: id };
    this.save();
    return id;
  }

  pathOf(item: string): string | null {
    return Object.entries(this.notes).find(([, id]) => id === item)?.[0] ?? null;
  }

  /** A file or folder moved: every id inside it follows. */
  renamed(from: string, to: string): void {
    let changed = false;
    const notes = Object.fromEntries(Object.entries(this.notes).map(([path, id]) => {
      if (!within(path, from)) return [path, id];
      changed = true;
      return [to + path.slice(from.length), id];
    }));
    if (!changed) return;
    this.notes = notes;
    this.save();
  }

  deleted(path: string): void {
    const notes = Object.fromEntries(Object.entries(this.notes).filter(([note]) => !within(note, path)));
    if (Object.keys(notes).length === Object.keys(this.notes).length) return;
    this.notes = notes;
    this.save();
  }

  private save(): void {
    void this.file.save({ version: 1, notes: this.notes });
  }
}
```

Create `src/app/online/sharing/model/mapShare.ts`:

```ts
/**
 * A map's share, kept on its scene record (`SceneAsset.data.sharing`, mirrored into the scene's
 * JSON), so it moves with the scene and the map file stays as it is. People by key, so renames
 * keep it; `notes` are the linked notes the sender ticked.
 */
import type { AssetService, SceneAsset, SceneAssetData } from '../../../services/AssetService';
import type { PeopleBook } from '../people/PeopleBook';
import { personKey } from '../people/peopleTypes';
import { isPerson, type Recipient } from './audience';

export type MapShareMode = 'player-safe' | 'full';

export interface MapShare {
  /** The map's random item id. */
  item: string;
  everyone: boolean;
  people: string[];
  except: string[];
  mode: MapShareMode;
  /** Vault paths of the ticked linked notes. */
  notes: string[];
}

const keys = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 500 && value.every((key) => typeof key === 'string' && key.length <= 300);

export function parseMapShare(value: unknown): MapShare | null {
  if (typeof value !== 'object' || value === null) return null;
  const share = value as Record<string, unknown>;
  if (typeof share.item !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(share.item)) return null;
  if (typeof share.everyone !== 'boolean' || (share.mode !== 'player-safe' && share.mode !== 'full')) return null;
  if (!keys(share.people) || !keys(share.except) || !keys(share.notes)) return null;
  return { item: share.item, everyone: share.everyone, people: [...share.people], except: [...share.except], mode: share.mode, notes: [...share.notes] };
}

export function mapShareOf(scene: SceneAsset): MapShare | null {
  return parseMapShare(scene.data?.sharing);
}

function keyReaches(key: string, recipient: Recipient, people: Pick<PeopleBook, 'byKey'>): boolean {
  const person = people.byKey(key);
  return person ? isPerson(person, recipient) : key === personKey(recipient.tableId, recipient.personId);
}

export function mapShareReaches(share: MapShare, recipient: Recipient, people: Pick<PeopleBook, 'byKey'>): boolean {
  if (share.except.some((key) => keyReaches(key, recipient, people))) return false;
  return share.everyone || share.people.some((key) => keyReaches(key, recipient, people));
}

export function withoutSharing(data: SceneAssetData | undefined): SceneAssetData {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => key !== 'sharing')) as SceneAssetData;
}

/** Writes or clears the share on the scene record; its JSON follows (`updateAsset`). */
export async function writeMapShare(assets: Pick<AssetService, 'updateAsset'>, scene: SceneAsset, share: MapShare | null): Promise<void> {
  const data = withoutSharing(scene.data);
  await assets.updateAsset(scene.id, { data: share ? { ...data, sharing: share } : data });
}
```

In `src/app/services/AssetService.ts`, add `import type { MapShare } from '../online/sharing/model/mapShare';` with the other imports. `SceneAssetData` gains:

```ts
  /** Who the map is shared with in online sessions (`online/sharing/model/mapShare.ts`); copies drop it. */
  sharing?: MapShare;
```

In `src/app/services/assetTransfer/transferRecords.ts`, import `withoutSharing` from `../../online/sharing/model/mapShare`. In `transferredRecord`, inside the `record.type === 'scene'` branch, add:

```ts
    // A copy is another map: the original's share stays with the original.
    if (newId && record.data?.sharing) record.data = withoutSharing(record.data);
```

Create `src/app/online/sharing/model/linkedNotes.ts`:

```ts
/** The notes a map links to: pins' notes, tokens' notes and statblocks. Hidden: only behind GM-only pins or hidden tokens. */
import type { MapFile } from '../../../services/MapPersistence';
import type { MapShareMode } from './mapShare';

export interface LinkedNote {
  path: string;
  label: string;
  /** Every reference to it is a GM-only pin or a hidden token. */
  hidden: boolean;
}

const labelOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/i, '');

export function linkedNotesOf(map: MapFile): LinkedNote[] {
  const notes = new Map<string, LinkedNote>();
  const add = (path: string | undefined, hidden: boolean): void => {
    if (!path) return;
    const known = notes.get(path);
    notes.set(path, { path, label: labelOf(path), hidden: (known?.hidden ?? true) && hidden });
  };
  for (const pin of Object.values(map.objects.pins)) add(pin.notePath, pin.gmOnly === true);
  for (const token of Object.values(map.objects.tokens)) {
    const hidden = token.isHidden === true;
    if ('notePath' in token) add(token.notePath, hidden);
    if ('statblockPath' in token) add(token.statblockPath, hidden);
  }
  return [...notes.values()];
}

/** What the dialog offers: a player-safe share never offers notes only GM-only pins or hidden tokens link to. */
export function offeredNotes(map: MapFile, mode: MapShareMode): LinkedNote[] {
  const all = linkedNotesOf(map);
  return mode === 'full' ? all : all.filter((note) => !note.hidden);
}
```

- [ ] **Step 7: Implement map payloads**

Create `src/app/online/sharing/model/mapPayload.ts`:

```ts
/**
 * A shared map on the wire. Player-safe: the scene as online players get it (`PlayerScene`)
 * plus visible pins with ticked notes. Full: the map file with images and ticked notes as
 * references and every other path cleared. Validated like received scenes.
 */
import { isLegacyMapFile } from '../../../services/MapPersistence';
import { isAssetId } from '../../assets/assetIds';
import { isDrawingRecords, isFogRecords, isPlayerSceneBody, isSceneId } from '../../scene/sceneValidation';
import { SCENE_LIMITS, type PlayerScene } from '../../scene/sceneTypes';

export const MAP_PAYLOAD_FORMAT = 'atlas-share-map-v1';
export const IMAGE_REF_PREFIX = 'atlas-share-image:';
export const NOTE_REF_PREFIX = 'atlas-share-note:';

export interface SharedPin {
  x: number;
  y: number;
  /** The ticked note's item id. */
  note: string;
  icon?: string;
  label?: string;
  hex?: boolean;
}

export interface PlayerSafeMapPayload {
  format: typeof MAP_PAYLOAD_FORMAT;
  mode: 'player-safe';
  name: string;
  scene: PlayerScene;
  pins: SharedPin[];
  /** Token id → item id of its ticked note. */
  tokenNotes: Record<string, string>;
  /** Item ids of every ticked note. */
  notes: string[];
  /** Fingerprints of the images the scene shows. */
  images: string[];
}

export interface FullMapPayload {
  format: typeof MAP_PAYLOAD_FORMAT;
  mode: 'full';
  name: string;
  map: Record<string, unknown>;
  notes: string[];
  images: string[];
}

export type MapPayload = PlayerSafeMapPayload | FullMapPayload;

const ITEM_ID = /^[A-Za-z0-9_-]{22}$/;
const isItemId = (value: unknown): value is string => typeof value === 'string' && ITEM_ID.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const ids = (value: unknown, valid: (item: unknown) => boolean): value is string[] =>
  Array.isArray(value) && value.length <= SCENE_LIMITS.records && value.every(valid);

function isPin(value: unknown): value is SharedPin {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !isItemId(value.note)) return false;
  return (value.icon === undefined || (typeof value.icon === 'string' && value.icon.length <= 64))
    && (value.label === undefined || (typeof value.label === 'string' && value.label.length <= 64))
    && (value.hex === undefined || value.hex === true);
}

export function parseMapPayload(value: unknown): MapPayload | null {
  if (!isRecord(value) || value.format !== MAP_PAYLOAD_FORMAT || !isName(value.name)) return null;
  if (!ids(value.notes, isItemId) || !ids(value.images, isAssetId)) return null;
  if (value.mode === 'player-safe') {
    const scene = value.scene;
    if (!isRecord(scene) || !isPlayerSceneBody(scene) || !isFogRecords(scene.fog) || !isDrawingRecords(scene.drawings)) return null;
    if (!ids(value.pins, isPin) || !isRecord(value.tokenNotes)) return null;
    if (!Object.entries(value.tokenNotes).every(([id, note]) => isSceneId(id) && isItemId(note))) return null;
    return value as unknown as PlayerSafeMapPayload;
  }
  if (value.mode === 'full') return isRecord(value.map) && isLegacyMapFile(value.map) ? (value as unknown as FullMapPayload) : null;
  return null;
}
```

Create `src/app/online/sharing/model/buildMapPayload.ts`:

```ts
/**
 * Builds a map's payload on the sender's machine, from the saved map file. Images are hashed
 * first (and the background's size read), so the payload never goes out without its art.
 */
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { isPersistedMapEnvelope, migrateMapFile, type MapFile } from '../../../services/MapPersistence';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import { mapStrings } from '../../../utils/mapStrings';
import { ASSET_LIMITS, mimeForPath, sceneAssetIds, type Hasher } from '../../assets/assetIds';
import type { ImageFiles } from '../../scene/AssetRegistry';
import { FogCoverage } from '../../scene/FogCoverage';
import type { PlayerViewRules } from '../../scene/playerViewRules';
import { projectForPlayers, type ProjectedState } from '../../scene/projectForPlayers';
import { createProjectionMemo, projectFog } from '../../scene/projectRecords';
import { setOwn } from '../../scene/sceneDiff';
import type { MapSize } from '../../scene/sceneTypes';
import { IMAGE_REF_PREFIX, MAP_PAYLOAD_FORMAT, NOTE_REF_PREFIX, type FullMapPayload, type PlayerSafeMapPayload, type SharedPin } from './mapPayload';

/** A saved map: its file's map data, the state the projection reads, and the scene settings a full share carries. */
export interface SharedMapSource {
  map: MapFile;
  state: ProjectedState;
  extra: Record<string, unknown>;
}

export interface MapImages {
  /** Vault path → fingerprint, for the background and token images that could be hashed. */
  fingerprints: ReadonlyMap<string, string>;
  size: MapSize;
}

export interface PayloadContext {
  rules: PlayerViewRules;
  collectionGrid: CollectionGridDefaults | null;
  images: MapImages;
  /** The item id of a ticked note this recipient gets; null for any other path. */
  noteItem(path: string): string | null;
  /** Item ids of every ticked note this recipient gets. */
  linked: string[];
  /** Whether a string is a path in the sender's vault (cleared from full shares unless it is an image or a ticked note). */
  isFile(path: string): boolean;
}

const SHARED_SCENE_ID = 'shared-map';
const FULL_FIELDS = ['widgetSettings', 'widgetValues', 'initiative', 'initiativeTrackerOpen', 'tokenSettings'] as const;

/** Reads a map file: its envelope, migrated; null when it cannot be read. */
export async function readSharedMap(read: (path: string) => Promise<string>, mapPath: string): Promise<SharedMapSource | null> {
  try {
    const envelope: unknown = JSON.parse(await read(mapPath));
    if (!isPersistedMapEnvelope(envelope)) return null;
    const stored = (envelope.state ?? {}) as Record<string, unknown>;
    const map = migrateMapFile(stored);
    // The projection checks every field it reads, as for a live store.
    const state = {
      background: map.background, grid: map.grid, objects: { ...map.objects, audios: {} },
      widgetSettings: stored.widgetSettings, widgetValues: stored.widgetValues ?? {},
      initiative: stored.initiative ?? null, initiativeTrackerOpen: stored.initiativeTrackerOpen === true,
    } as unknown as ProjectedState;
    const extra = Object.fromEntries(FULL_FIELDS.flatMap((key) => (stored[key] === undefined ? [] : [[key, stored[key]]])));
    return { map, state, extra };
  } catch {
    return null;
  }
}

/** The background and token images of a map. */
export function imagePathsOf(map: MapFile): string[] {
  const paths = new Set<string>();
  if (map.background) paths.add(map.background);
  for (const token of Object.values(map.objects.tokens)) if (token.imagePath) paths.add(token.imagePath);
  return [...paths];
}

export async function hashMapImages(
  map: MapFile, files: ImageFiles, hash: Hasher,
  dimensions: (bytes: ArrayBuffer) => Promise<MapSize | null> = (bytes) => imageDimensions(new Blob([bytes])),
): Promise<MapImages> {
  const fingerprints = new Map<string, string>();
  let size: MapSize = { width: 0, height: 0 };
  for (const path of imagePathsOf(map)) {
    const stat = files.stat(path);
    if (!stat || stat.size > ASSET_LIMITS.fileBytes || !mimeForPath(path)) continue;
    try {
      const bytes = await files.read(path);
      fingerprints.set(path, await hash(bytes));
      if (path === map.background) size = (await dimensions(bytes)) ?? size;
    } catch {
      // an unreadable image is left out, as online play does
    }
  }
  return { fingerprints, size };
}

export function playerSafePayload(source: SharedMapSource, name: string, context: PayloadContext): PlayerSafeMapPayload {
  const memo = createProjectionMemo();
  const coverage = FogCoverage.fromPlayerFog(projectFog(source.map.objects.fog, memo));
  const scene = projectForPlayers(source.state, {
    sceneId: SHARED_SCENE_ID, rules: context.rules, coverage, memo, mapSize: context.images.size,
    assets: { idFor: (path) => (path ? context.images.fingerprints.get(path) ?? null : null) },
    collectionGrid: context.collectionGrid,
  });
  const pins: SharedPin[] = Object.values(source.map.objects.pins).flatMap((pin): SharedPin[] => {
    if (pin.gmOnly || coverage.isCovered({ x: pin.x, y: pin.y, width: 1, height: 1 })) return [];
    const note = context.noteItem(pin.notePath);
    if (!note) return [];
    return [{ x: pin.x, y: pin.y, note, ...(pin.icon ? { icon: pin.icon } : {}), ...(pin.label ? { label: pin.label } : {}), ...(pin.hex ? { hex: true } : {}) }];
  });
  const tokenNotes: Record<string, string> = {};
  for (const id of Object.keys(scene.tokens)) {
    const token = source.map.objects.tokens[id];
    const path = token && 'notePath' in token && token.notePath ? token.notePath : token && 'statblockPath' in token ? token.statblockPath : undefined;
    const note = path ? context.noteItem(path) : null;
    if (note) setOwn(tokenNotes, id, note);
  }
  return { format: MAP_PAYLOAD_FORMAT, mode: 'player-safe', name, scene, pins, tokenNotes, notes: [...context.linked], images: sceneAssetIds(scene) };
}

export function fullPayload(source: SharedMapSource, name: string, context: PayloadContext): FullMapPayload {
  const { map } = source;
  const body = { background: map.background, grid: map.grid, objects: map.objects, camera: map.camera, ...source.extra };
  const replaced = mapStrings(body, (text) => {
    const image = context.images.fingerprints.get(text);
    if (image) return `${IMAGE_REF_PREFIX}${image}`;
    const note = context.noteItem(text);
    if (note) return `${NOTE_REF_PREFIX}${note}`;
    return context.isFile(text) ? '' : text;
  });
  return {
    format: MAP_PAYLOAD_FORMAT, mode: 'full', name, map: replaced as Record<string, unknown>,
    notes: [...context.linked], images: [...new Set(context.images.fingerprints.values())],
  };
}
```

`mapStrings` maps object keys' values, never keys. Token and pin ids are keys, so they stay.

- [ ] **Step 8: Implement the catalogue**

Create `src/app/online/sharing/model/catalogueAccess.ts`:

```ts
/** What one recipient may have: the notes whose rule reaches them, the maps shared with them and those maps' ticked notes. */
import type { PeopleBook } from '../people/PeopleBook';
import { ruleReaches, type Recipient } from './audience';
import type { SharedMapSource } from './buildMapPayload';
import { offeredNotes } from './linkedNotes';
import { mapShareReaches, type MapShare } from './mapShare';
import type { ShareRule } from './shareRule';

export interface NoteSource {
  path: string;
  title: string;
  rule: ShareRule;
}

export interface SharedMapEntry {
  name: string;
  mapPath: string;
  share: MapShare;
}

export interface MapAccess {
  entry: SharedMapEntry;
  source: SharedMapSource;
  /** Ticked notes still offered (player-safe: not only behind GM-only pins or hidden tokens), and not explicitly private. */
  linked: string[];
}

export interface Access {
  notes: Map<string, NoteSource>;
  maps: MapAccess[];
}

export interface AccessSources {
  notes(): NoteSource[];
  note(path: string): NoteSource | null;
  maps(): Promise<SharedMapEntry[]>;
  readMap(mapPath: string): Promise<SharedMapSource | null>;
}

export async function accessFor(sources: AccessSources, recipient: Recipient, people: Pick<PeopleBook, 'byName' | 'byKey'>): Promise<Access> {
  const notes = new Map(sources.notes().filter((note) => ruleReaches(note.rule, recipient, people)).map((note) => [note.path, note]));
  const maps: MapAccess[] = [];
  for (const entry of await sources.maps()) {
    if (!mapShareReaches(entry.share, recipient, people)) continue;
    const source = await sources.readMap(entry.mapPath);
    if (!source) continue;
    const offered = new Set(offeredNotes(source.map, entry.share.mode).map((note) => note.path));
    const linked = entry.share.notes.filter((path) => {
      const note = offered.has(path) ? sources.note(path) : null;
      if (!note || note.rule.private) return false;
      notes.set(path, note);
      return true;
    });
    maps.push({ entry, source, linked });
  }
  return { notes, maps };
}
```

Create `src/app/online/sharing/model/SenderCatalogue.ts`:

```ts
/**
 * The sender's side of sharing: what a recipient may list and open, built fresh from the vault
 * each time, filtered for them before it is hashed. A version is the SHA-256 of exactly what
 * would be sent, so an edit to a part they never get never shows them an update.
 */
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import { mimeForPath, sha256Id, type AssetMime, type Hasher } from '../../assets/assetIds';
import type { ImageFiles } from '../../scene/AssetRegistry';
import type { PlayerViewRules } from '../../scene/playerViewRules';
import type { MapSize } from '../../scene/sceneTypes';
import type { PeopleBook } from '../people/PeopleBook';
import type { Recipient } from './audience';
import { fullPayload, hashMapImages, playerSafePayload, type MapImages } from './buildMapPayload';
import { accessFor, type Access, type AccessSources, type MapAccess } from './catalogueAccess';
import type { MapShareMode } from './mapShare';
import { filterNoteFor } from './noteFilter';
import type { ShareItems } from './ShareItems';

export const MAX_CATALOGUE_ITEMS = 500;

export interface CatalogueItem {
  item: string;
  kind: 'note' | 'map';
  title: string;
  version: string;
  size: number;
  mode?: MapShareMode;
  /** A map's ticked notes, as item ids. */
  linked?: string[];
}

export interface SharePayload {
  kind: 'note' | 'map' | 'image';
  bytes: ArrayBuffer;
  version: string;
  mime?: AssetMime;
}

export interface CatalogueSources extends AccessSources {
  read(path: string): Promise<string>;
  images: ImageFiles;
  isFile(path: string): boolean;
  /** The vault path a link in `from` points at; null when it resolves to nothing. */
  resolveLink(linkpath: string, from: string): string | null;
  shareable(): readonly string[];
  rules(): PlayerViewRules;
  collectionGrid(mapPath: string): CollectionGridDefaults | null;
}

const utf8 = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

export class SenderCatalogue {
  constructor(
    private readonly sources: CatalogueSources,
    private readonly items: Pick<ShareItems, 'idFor' | 'pathOf'>,
    private readonly people: Pick<PeopleBook, 'byName' | 'byKey'>,
    private readonly hash: Hasher = sha256Id,
    private readonly dimensions?: (bytes: ArrayBuffer) => Promise<MapSize | null>,
  ) {}

  async list(recipient: Recipient): Promise<CatalogueItem[]> {
    const access = await accessFor(this.sources, recipient, this.people);
    const items: CatalogueItem[] = [];
    for (const note of access.notes.values()) {
      if (items.length >= MAX_CATALOGUE_ITEMS) break;
      const payload = await this.notePayload(note.path, recipient, access);
      items.push({ item: this.items.idFor(note.path), kind: 'note', title: note.title, version: payload.version, size: payload.bytes.byteLength });
    }
    for (const map of access.maps) {
      if (items.length >= MAX_CATALOGUE_ITEMS) break;
      const { version, bytes } = await this.mapPayload(map);
      items.push({
        item: map.entry.share.item, kind: 'map', title: map.entry.name, version, size: bytes.byteLength,
        mode: map.entry.share.mode, linked: map.linked.map((path) => this.items.idFor(path)),
      });
    }
    return items;
  }

  /** A note, a map, or a map's image (`<map item>/<fingerprint>`), when this recipient may have it; null otherwise. */
  async open(recipient: Recipient, ref: string): Promise<SharePayload | null> {
    const access = await accessFor(this.sources, recipient, this.people);
    const slash = ref.indexOf('/');
    if (slash >= 0) return this.image(access, ref.slice(0, slash), ref.slice(slash + 1));
    const map = access.maps.find((candidate) => candidate.entry.share.item === ref);
    if (map) return (await this.mapPayload(map)).payload;
    const path = this.items.pathOf(ref);
    return path && access.notes.has(path) ? this.notePayload(path, recipient, access) : null;
  }

  /** The note as this person would get it, whatever its rule says now (the dialog's preview). */
  async previewNote(recipient: Recipient, path: string): Promise<string> {
    const access = await accessFor(this.sources, recipient, this.people);
    return this.noteText(path, recipient, access);
  }

  private async noteText(path: string, recipient: Recipient, access: Access): Promise<string> {
    return filterNoteFor(await this.sources.read(path), {
      recipient, people: this.people, shareable: this.sources.shareable(),
      links: (linkpath) => {
        const target = this.sources.resolveLink(linkpath, path);
        return target ? access.notes.get(target)?.title ?? null : null;
      },
    });
  }

  private async notePayload(path: string, recipient: Recipient, access: Access): Promise<SharePayload> {
    const bytes = utf8(await this.noteText(path, recipient, access));
    return { kind: 'note', bytes, version: await this.hash(bytes) };
  }

  private async mapPayload(map: MapAccess): Promise<{ payload: SharePayload; images: MapImages; version: string; bytes: ArrayBuffer }> {
    const images = await hashMapImages(map.source.map, this.sources.images, this.hash, this.dimensions);
    const linked = new Set(map.linked);
    const context = {
      rules: this.sources.rules(), collectionGrid: this.sources.collectionGrid(map.entry.mapPath), images,
      noteItem: (path: string): string | null => (linked.has(path) ? this.items.idFor(path) : null),
      linked: map.linked.map((path) => this.items.idFor(path)),
      isFile: (path: string): boolean => this.sources.isFile(path),
    };
    const built = map.entry.share.mode === 'full'
      ? fullPayload(map.source, map.entry.name, context)
      : playerSafePayload(map.source, map.entry.name, context);
    const bytes = utf8(JSON.stringify(built));
    const version = await this.hash(bytes);
    return { payload: { kind: 'map', bytes, version }, images, version, bytes };
  }

  private async image(access: Access, mapItem: string, fingerprint: string): Promise<SharePayload | null> {
    const map = access.maps.find((candidate) => candidate.entry.share.item === mapItem);
    if (!map) return null;
    const { payload, images } = await this.mapPayload(map);
    const sent: { images: string[] } = JSON.parse(new TextDecoder().decode(payload.bytes)) as { images: string[] };
    if (!sent.images.includes(fingerprint)) return null;
    const path = [...images.fingerprints].find(([, id]) => id === fingerprint)?.[0];
    const mime = path ? mimeForPath(path) : null;
    if (!path || !mime) return null;
    const bytes = await this.sources.images.read(path);
    return (await this.hash(bytes)) === fingerprint ? { kind: 'image', bytes, version: fingerprint, mime } : null;
  }
}
```

Create `src/app/online/sharing/model/catalogueSources.ts`:

```ts
/** The catalogue's view of this vault: notes with `atlas-share`, shared scenes, map files and images. */
import { TFile, type App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { collectionGridDefaultsFor } from '../../../services/mapMeasurementSettings';
import type { SettingsService } from '../../../services/SettingsService';
import { vaultImageFiles } from '../../assets/vaultImageFiles';
import { pickPlayerViewRules } from '../../scene/playerViewRules';
import { readSharedMap } from './buildMapPayload';
import type { NoteSource } from './catalogueAccess';
import { mapShareOf } from './mapShare';
import type { CatalogueSources } from './SenderCatalogue';
import { parseShareRule, SHARE_PROPERTY } from './shareRule';

export function obsidianCatalogueSources(app: App, settings: SettingsService): CatalogueSources {
  const noteOf = (file: TFile): NoteSource => ({
    path: file.path, title: file.basename, rule: parseShareRule(app.metadataCache.getFileCache(file)?.frontmatter?.[SHARE_PROPERTY]),
  });
  return {
    notes: () => app.vault.getMarkdownFiles()
      .filter((file) => app.metadataCache.getFileCache(file)?.frontmatter?.[SHARE_PROPERTY] !== undefined)
      .map(noteOf),
    note: (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile && file.extension === 'md' ? noteOf(file) : null;
    },
    read: async (path) => {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? app.vault.cachedRead(file) : app.vault.adapter.read(path);
    },
    maps: async () => (await AssetService.getInstance(app).getAssets(undefined, 'scene')).flatMap((scene) => {
      const share = mapShareOf(scene);
      const mapPath = scene.data?.mapPath;
      return share && mapPath ? [{ name: scene.name, mapPath, share }] : [];
    }),
    readMap: (mapPath) => readSharedMap((path) => app.vault.adapter.read(path), mapPath),
    images: vaultImageFiles(app),
    isFile: (path) => path.length < 1024 && app.vault.getAbstractFileByPath(path) instanceof TFile,
    resolveLink: (linkpath, from) => {
      const file = app.metadataCache.getFirstLinkpathDest(linkpath, from);
      return file && file.extension === 'md' ? file.path : null;
    },
    shareable: () => settings.getOnlineSettings().shareableProperties,
    rules: () => pickPlayerViewRules(settings.getLocalPlayerViewSettings()),
    collectionGrid: (mapPath) => collectionGridDefaultsFor(AssetService.getInstance(app), mapPath),
  };
}
```

- [ ] **Step 9: Implement writing, the dialog and its registration**

Create `src/app/online/sharing/model/shareWriting.ts`:

```ts
/** Writes a note's `atlas-share` and reads it back from the file, so the dialog and the property always agree. */
import { parseYaml, type App, type TFile } from 'obsidian';
import { splitFrontmatter } from './frontmatterFilter';
import { parseShareRule, SHARE_PROPERTY, type ShareRule } from './shareRule';

export async function writeNoteShare(app: App, file: TFile, value: string | string[] | null): Promise<ShareRule> {
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    if (value === null) Reflect.deleteProperty(frontmatter, SHARE_PROPERTY);
    else frontmatter[SHARE_PROPERTY] = value;
  });
  const { frontmatter } = splitFrontmatter((await app.vault.read(file)).replace(/\r\n?/g, '\n'));
  const parsed: unknown = frontmatter ? parseYaml(frontmatter.join('\n')) : null;
  return parseShareRule(typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)[SHARE_PROPERTY] : undefined);
}
```

Create `src/app/online/sharing/ui/ShareWithForm.tsx`:

```tsx
import React, { useState } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import type { MapShareMode } from '../model/mapShare';

/** A person to tick: a known person by key, or a name the note uses that the list does not know (`name:<name>`). */
export interface ShareRow {
  key: string;
  name: string;
  known: boolean;
}

export interface ShareFormResult {
  everyone: boolean;
  people: string[];
  except: string[];
  mode: MapShareMode;
  notes: string[];
}

interface ShareWithFormProps {
  rows: readonly ShareRow[];
  initial: { everyone: boolean; people: string[]; except: string[] };
  /** For maps: the mode, every linked note (`hidden`: offered only for full shares) and the ticked ones. */
  map: { mode: MapShareMode; notes: ReadonlyArray<{ path: string; label: string; private: boolean; hidden?: boolean }>; ticked: string[] } | null;
  /** The note as one person gets it; null for maps. */
  preview: ((key: string) => Promise<string>) | null;
  warnings: readonly string[];
  onSave(result: ShareFormResult): void;
  onCancel(): void;
}

const toggled = (list: readonly string[], key: string): string[] => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <label className="atlas-share__check">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
      <span>{label}</span>
    </label>
  );
}

export function ShareWithForm({ rows, initial, map, preview, warnings, onSave, onCancel }: ShareWithFormProps): React.ReactElement {
  const [everyone, setEveryone] = useState(initial.everyone);
  const [people, setPeople] = useState(initial.people);
  const [except, setExcept] = useState(initial.except);
  const [mode, setMode] = useState<MapShareMode>(map?.mode ?? 'player-safe');
  const [notes, setNotes] = useState(map?.ticked ?? []);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const known = rows.filter((row) => row.known);
  // A player-safe share never offers notes only GM-only pins or hidden tokens link to.
  const offered = map ? map.notes.filter((note) => mode === 'full' || !note.hidden) : [];
  const save = (): void => onSave({
    everyone, people, except: everyone ? except : [], mode,
    notes: notes.filter((path) => offered.some((note) => note.path === path && !note.private)),
  });
  return (
    <div className="atlas-share">
      <section className="atlas-share__section">
        <Check label="Everyone in my sessions" checked={everyone} onChange={() => setEveryone(!everyone)} />
        <ul className="atlas-share__people">
          {(everyone ? known : rows).map((row) => (
            <li key={row.key}>
              {everyone
                ? <Check label={`Except ${row.name}`} checked={except.includes(row.key)} onChange={() => setExcept(toggled(except, row.key))} />
                : <Check label={row.name} checked={people.includes(row.key)} onChange={() => setPeople(toggled(people, row.key))} />}
            </li>
          ))}
        </ul>
        {warnings.map((warning) => <p key={warning} className="atlas-share__warning" role="note">{warning}</p>)}
      </section>
      {map && (
        <section className="atlas-share__section" aria-label="Map">
          <div className="atlas-share__modes" role="radiogroup" aria-label="What to share">
            {(['player-safe', 'full'] as const).map((value) => (
              <label key={value} className="atlas-share__check">
                <input type="radio" name="atlas-share-mode" checked={mode === value} onChange={() => setMode(value)} aria-label={value === 'full' ? 'Full' : 'Player-safe'} />
                <span>{value === 'full' ? 'Full' : 'Player-safe'}</span>
              </label>
            ))}
          </div>
          {offered.length > 0 && <h3 className="atlas-share__heading">Linked notes</h3>}
          <ul className="atlas-share__people">
            {offered.map((note) => (
              <li key={note.path} className="atlas-share__note">
                <Check label={note.label} checked={notes.includes(note.path)} disabled={note.private} onChange={() => setNotes(toggled(notes, note.path))} />
                {note.private && <span className="atlas-share__private">Private</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview && (
        <section className="atlas-share__section">
          <label className="atlas-share__preview-label">
            <span>Preview as</span>
            <select className="dropdown" aria-label="Preview as" defaultValue=""
              onChange={(event) => { const key = event.target.value; if (key) void preview(key).then(setPreviewText); }}>
              <option value="" disabled>Pick a person</option>
              {known.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
            </select>
          </label>
          {previewText !== null && <pre className="atlas-share__preview">{previewText}</pre>}
        </section>
      )}
      <div className="modal-button-container">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="default" onClick={save}>Save</Button>
      </div>
    </div>
  );
}
```

Create `src/app/online/sharing/ui/ShareWithModal.tsx`:

```tsx
/**
 * "Share with…" for a note or a map: tick people or everyone in my sessions; for a map also
 * player-safe or full and its linked notes. Notes keep their share in `atlas-share` (written,
 * then read back), maps on their scene record. Full asks first.
 */
import React from 'react';
import { Modal, Notice, type App, type TFile } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetService, SceneAsset } from '../../../services/AssetService';
import { confirmAction } from '../../../ui/confirmDialog';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { randomId } from '../../ids';
import type { PeopleBook } from '../people/PeopleBook';
import { keyOf } from '../people/peopleTypes';
import { readSharedMap } from '../model/buildMapPayload';
import { offeredNotes } from '../model/linkedNotes';
import { mapShareOf, writeMapShare, type MapShare } from '../model/mapShare';
import type { SenderCatalogue } from '../model/SenderCatalogue';
import { formatShareRule, parseShareRule, SHARE_PROPERTY, unknownRuleNames } from '../model/shareRule';
import { writeNoteShare } from '../model/shareWriting';
import { ShareWithForm, type ShareFormResult, type ShareRow } from './ShareWithForm';

export const SHARE_DIALOG_TITLE = 'Share with';
const FULL_CONFIRM = {
  title: 'Share the full map?',
  message: ['A full share sends everything on this map, as a co-GM would see it: hidden tokens, GM-only pins, walls and lights.'],
  confirmLabel: 'Share full map',
};

export interface ShareWithDeps {
  people: PeopleBook;
  catalogue: Pick<SenderCatalogue, 'previewNote'>;
  assets: Pick<AssetService, 'updateAsset' | 'getAssets'>;
}

const nameKey = (name: string): string => `name:${name}`;

class ShareWithModal extends Modal {
  private root: Root | null = null;

  constructor(app: App, private readonly file: TFile, private readonly deps: ShareWithDeps) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-share-modal');
  }

  onOpen(): void {
    this.setTitle(`${SHARE_DIALOG_TITLE} · ${this.file.basename}`);
    this.root = createRoot(this.contentEl);
    void this.render();
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    await this.deps.people.ready();
    const people = this.deps.people;
    const known: ShareRow[] = people.list().map((person) => ({ key: keyOf(person), name: person.name, known: true }));
    if (this.file.extension === 'md') await this.renderNote(known);
    else await this.renderMap(known);
  }

  private async renderNote(known: ShareRow[]): Promise<void> {
    const rule = parseShareRule(this.app.metadataCache.getFileCache(this.file)?.frontmatter?.[SHARE_PROPERTY]);
    const people = this.deps.people;
    const keyFor = (name: string): string => { const person = people.byName(name); return person ? keyOf(person) : nameKey(name); };
    const unknown = unknownRuleNames(rule, people);
    const rows = [...known, ...unknown.map((name) => ({ key: nameKey(name), name, known: false }))];
    const nameFor = (key: string): string => rows.find((row) => row.key === key)?.name ?? key.replace(/^name:/, '');
    this.root?.render(
      <ShareWithForm
        rows={rows}
        initial={{ everyone: rule.public && !rule.private, people: rule.private ? [] : rule.only.map(keyFor), except: rule.except.map(keyFor) }}
        map={null}
        warnings={unknown.length ? [`Not in your people list: ${unknown.join(', ')}.`] : []}
        preview={(key) => {
          const person = people.byKey(key);
          return person ? this.deps.catalogue.previewNote({ tableId: person.tableId, personId: person.personId }, this.file.path) : Promise.resolve('');
        }}
        onCancel={() => this.close()}
        onSave={(result) => { void this.saveNote(result, nameFor); }}
      />,
    );
  }

  private async saveNote(result: ShareFormResult, nameFor: (key: string) => string): Promise<void> {
    const value = formatShareRule({ everyone: result.everyone, people: result.people.map(nameFor), except: result.except.map(nameFor) });
    const readBack = await writeNoteShare(this.app, this.file, value);
    const expected = parseShareRule(value);
    if (JSON.stringify(readBack) !== JSON.stringify(expected)) new Notice(`The note's ${SHARE_PROPERTY} property now reads differently; check it.`);
    this.close();
  }

  private async renderMap(known: ShareRow[]): Promise<void> {
    const scene = (await this.deps.assets.getAssets(undefined, 'scene')).find((candidate) => candidate.data?.mapPath === this.file.path);
    const source = scene ? await readSharedMap((path) => this.app.vault.adapter.read(path), this.file.path) : null;
    if (!scene || !source) {
      new Notice('This map has no scene in a collection, so it cannot be shared.');
      this.close();
      return;
    }
    const share = mapShareOf(scene);
    const notes = offeredNotes(source.map, 'full').map((note) => {
      const file = this.app.vault.getAbstractFileByPath(note.path);
      const property = file ? this.app.metadataCache.getFileCache(file as TFile)?.frontmatter?.[SHARE_PROPERTY] : undefined;
      return { path: note.path, label: note.label, private: parseShareRule(property).private, hidden: note.hidden };
    });
    this.root?.render(
      <ShareWithForm
        rows={known}
        initial={{ everyone: share?.everyone ?? false, people: share?.people ?? [], except: share?.except ?? [] }}
        map={{ mode: share?.mode ?? 'player-safe', notes, ticked: share?.notes ?? [] }}
        preview={null}
        warnings={[]}
        onCancel={() => this.close()}
        onSave={(result) => { void this.saveMap(scene, share, result); }}
      />,
    );
  }

  private async saveMap(scene: SceneAsset, previous: MapShare | null, result: ShareFormResult): Promise<void> {
    if (result.mode === 'full' && previous?.mode !== 'full' && !(await confirmAction(FULL_CONFIRM))) return;
    const nobody = !result.everyone && result.people.length === 0;
    const next: MapShare | null = nobody ? null : {
      item: previous?.item ?? randomId(), everyone: result.everyone, people: result.people, except: result.except, mode: result.mode,
      notes: result.notes,
    };
    await writeMapShare(this.deps.assets, scene, next);
    this.close();
  }
}

export function openShareWithModal(app: App, file: TFile, deps: ShareWithDeps): void {
  new ShareWithModal(app, file, deps).open();
}
```

Create `src/app/online/sharing/ui/sharing.scss`:

```scss
// The Share with… dialog. Imported inside the `.atlas-vtt-plugin` scope of styles/main.scss.
@use '../../../../../styles/tokens' as *;
@use '../../../../../styles/mixins' as *;

.atlas-share {
  @include atlas-flex-col($spacing-m);
}

.atlas-share__section {
  @include atlas-flex-col($spacing-s);
}

.atlas-share__people {
  @include atlas-flex-col($spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.atlas-share__check,
.atlas-share__note,
.atlas-share__modes,
.atlas-share__preview-label {
  @include atlas-flex-row($spacing-s);
}

.atlas-share__heading {
  margin: 0;
  font-size: $font-ui-smaller;
  font-weight: $font-weight-semibold;
  color: var(--text-muted);
}

.atlas-share__private {
  color: var(--text-muted);
  font-size: $font-ui-smaller;
}

.atlas-share__warning {
  margin: 0;
  color: var(--text-warning);
  font-size: $font-ui-smaller;
}

.atlas-share__preview {
  @include atlas-inset-surface;
  max-height: 240px;
  margin: 0;
  padding: $spacing-s;
  overflow: auto;
  border-radius: $radius-l;
  white-space: pre-wrap;
  font-size: $font-ui-smaller;
}
```

In `styles/main.scss`, add `@import '../src/app/online/sharing/ui/sharing.scss';` after the people import.

In `src/app/online/onlineSettings.ts`, add to `OnlineSettings`:

```ts
  /** Note properties that shared notes keep (all others are stripped; `atlas-share` always). */
  shareableProperties: string[];
```

`DEFAULT_ONLINE_SETTINGS` gains `shareableProperties: ['tags', 'aliases'],`, and `resolveOnlineSettings` returns:

```ts
    shareableProperties: Array.isArray(source.shareableProperties)
      ? source.shareableProperties.filter((key): key is string => typeof key === 'string' && key.trim().length > 0 && key.length <= 64)
        .map((key) => key.trim()).slice(0, 50)
      : [...defaults.shareableProperties],
```

In `src/app/settings/onlineSettingsSection.ts`, add a row after **Player page**:

```ts
      {
        name: 'Shared note properties',
        desc: 'Properties that notes you share keep, separated by commas. All other properties are removed before sending; atlas-share always is.',
        aliases: ['sharing', 'frontmatter', 'atlas-share'],
        render: (setting) => {
          setting.addText((text) => text
            .setPlaceholder('tags, aliases')
            .setValue(settings.getOnlineSettings().shareableProperties.join(', '))
            .onChange((value) => settings.setOnlineSettings({
              shareableProperties: value.split(',').map((key) => key.trim()).filter((key) => key && key !== 'atlas-share'),
            })));
        },
      },
```

Extend `src/app/online/sharing/registerSharing.ts`. Its imports gain:

```ts
import { TFile, type TAbstractFile } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { obsidianCatalogueSources } from './model/catalogueSources';
import { SenderCatalogue } from './model/SenderCatalogue';
import { ShareItems } from './model/ShareItems';
import { openShareWithModal } from './ui/ShareWithModal';
```

and `SharingServices` gains `items: ShareItems`. Inside `registerSharing`, after the people command:

```ts
  const { items } = services;
  void items.ready();
  const catalogue = new SenderCatalogue(obsidianCatalogueSources(plugin.app, settings), items, people);
  const shareable = (file: TAbstractFile | null): file is TFile => file instanceof TFile && (file.extension === 'md' || file.extension === 'atlasmap');
  const share = (file: TFile): void => openShareWithModal(plugin.app, file, { people, catalogue, assets: AssetService.getInstance(plugin.app) });
  plugin.addCommand({
    id: 'share-with', name: 'Share with…',
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!shareable(file)) return false;
      if (!checking) share(file);
      return true;
    },
  });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (!shareable(file)) return;
    menu.addItem((item) => item.setTitle('Share with…').setIcon('share-2').onClick(() => share(file)));
  }));
  // Note item ids follow the vault, so a renamed note keeps its updates and no path is ever sent.
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => items.renamed(oldPath, file.path)));
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => items.deleted(file.path)));
```

`SenderCatalogue` is created here, once. Task 4 hands this same instance to the share sessions, inside this function, so `registerSharing` still returns nothing. In `main.ts`, pass `items: ShareItems.forApp(this.app)` (with its import).

- [ ] **Step 10: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing tests/unit/online/onlineSettings.test.ts tests/unit/online/onlineUi.test.ts tests/unit/assetTransfer.test.ts tests/unit/sceneLinkTransfer.test.ts`
Expected: PASS.

- [ ] **Step 11: The full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/app/online/sharing/model src/app/online/sharing/ui src/app/online/sharing/registerSharing.ts \
  src/app/online/onlineSettings.ts src/app/settings/onlineSettingsSection.ts src/app/services/AssetService.ts \
  src/app/services/assetTransfer/transferRecords.ts styles/main.scss main.ts tests/unit/online/sharing
git commit -m "feat(online): share notes and maps with chosen people, private parts filtered per person"
```

---
### Task 4: The share protocol, transfers and the GM's relay

Sharing gets its wire format. `share-*` JSON messages go on the assets channel, addressed by person id, and items travel as binary chunks with handles at or above `0x8000_0000`, which image transfers never use. Sends are windowed by acknowledgements, so no hop ever holds more than 1 MiB of a transfer. A received item is checked against its version (the SHA-256 of its bytes) before anyone sees it.

One `ShareNode` per Atlas per session serves the catalogue from Task 3, pulls, and passes push requests up. The GM routes:
- messages to `gm` reach its own node;
- player-to-player messages and chunks go through `ShareRelay`, which stamps the sender's person id, rewrites handles and forwards each chunk as it arrives, storing nothing.

This task wires the transport into hosting and joining. The UI comes in Task 5.

**Files:**
- Create: `src/app/online/sharing/transport/shareLimits.ts`
- Create: `src/app/online/sharing/transport/shareProtocol.ts`
- Create: `src/app/online/sharing/transport/OutgoingTransfers.ts`
- Create: `src/app/online/sharing/transport/IncomingTransfers.ts`
- Create: `src/app/online/sharing/transport/ShareNode.ts`
- Create: `src/app/online/sharing/transport/ShareRelay.ts`
- Create: `src/app/online/sharing/transport/GmShareHost.ts`
- Create: `src/app/online/sharing/transport/PlayerShareLink.ts`
- Create: `src/app/online/sharing/shareSessionStore.ts`
- Modify: `src/app/online/assets/assetProtocol.ts` (`IMAGE_HANDLE_MAX`), `src/app/online/assets/AssetServer.ts` (wrap below it)
- Modify: `src/app/online/PlayerSession.ts` (`share` handler), `src/app/online/obsidian/OnlineJoinService.ts` (`useShare`)
- Modify: `src/app/online/OnlineSessionService.ts` (`useSharingHooks`)
- Modify: `src/app/online/sharing/registerSharing.ts`, `main.ts`
- Modify: `tests/unit/online/sharing/sharingFixtures.ts` (catalogue fixture)
- Test: `tests/unit/online/sharing/shareProtocol.test.ts`
- Test: `tests/unit/online/sharing/transfers.test.ts`
- Test: `tests/unit/online/sharing/shareNode.test.ts`
- Test: `tests/unit/online/sharing/shareRelay.test.ts`
- Test: `tests/unit/online/sharing/shareSessionEndToEnd.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `CatalogueItem`, `SharePayload`, `SenderCatalogue` (`list`, `open`), `Recipient`, `MapShareMode`.
  - Task 2: `GM_PERSON_ID`.
  - Task 1: `SessionPlayer.personId`, `SessionIdentity`, `TableIdentity`.
  - Existing: `encodeChunk`, `binaryOf`, `MAX_HANDLE`, `ASSET_LIMITS`, `isAssetId`, `isAssetMime`, `sha256Id`, `RateLimit`, `channelPort`, `ChannelPort`, `SessionHandler`.
- Produces:
  - From `shareLimits.ts`: `SHARE_LIMITS`, `SHARE_HANDLE_MIN`, `maxShareBytes(kind)`.
  - From `shareProtocol.ts`:
    - `ShareKind`, `ShareDenyReason`, `ShareMessage`, `ShareStart`
    - `encodeShare(message)`, `decodeShare(raw): DecodedShare`
    - `isItemRef(value)`, `isRequestId(value)`
  - `class OutgoingTransfers(sendTo)` with `send(to, req, payload): Promise<void>`, `ack`, `cancel`, `drop`, `stop` and `openCount(to)`.
  - `class IncomingTransfers({ send, done, progress })` with `start`, `chunk`, `end`, `cancel`, `dropFrom` and `stop`; `IncomingOutcome`.
  - `class ShareNode(options)` with:
    - `requestList(to): Promise<CatalogueItem[]>`, `pull(to, item, kind): Promise<PulledItem>`, `push(to, item, kind, title)`
    - `receive(hop, message)`, `chunk(hop, chunk)`, `peerGone(person)`, `disconnected()`, `stop()`
  - `ShareError` (`reason`), `PulledItem { kind; version; mime?; bytes }`, `ShareNodeOptions`, `PushRequestBody`.
  - `class ShareRelay(sendTo, buffered)` with `message(from, message)`, `chunk(from, chunk): boolean`, `gone(person)`, `mappings(): number` and `stop()`.
  - `class GmShareHost(options)` with `node`, `start()`, `stop()` and `people(): SessionPerson[]`.
  - `class PlayerShareLink(options)` implements `PlayerShareHandler`, with `node`, `activate(identity)` and `deactivate()`.
  - `PlayerShareHandler { connected(port: ChannelPort); receive(data); disconnected() }` (`PlayerSession.ts`); `PlayerSessionOptions.share?`.
  - `OnlineJoinService.useShare(handler | null)`; `OnlineSessionService.useSharingHooks(hooks | null)` with `HostedSharingHooks { started({ session, table }): () => void }`.
  - From `shareSessionStore.ts`:
    - `ShareSession { role; tableId; self; node }`, `SessionPerson { personId; name }`
    - `PushRequest { from; item; kind; title; at }`
    - `shareSessionStore`, `addPush`, `dismissPush`

- [ ] **Step 1: Add a catalogue fixture**

Append to `tests/unit/online/sharing/sharingFixtures.ts`:

```ts
import { SenderCatalogue, type CatalogueSources } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { parseShareRule } from '../../../../src/app/online/sharing/model/shareRule';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';
import { memoryImageFiles, nodeHash } from '../assetFixtures';

export const TABLE_ID = 'T'.repeat(43);

export function testPerson(personId: string, name: string, tableId = TABLE_ID): Person {
  return { tableId, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0 };
}

/** `byName`/`byKey` over a fixed list, as the people book answers them. */
export function testPeople(list: readonly Person[]): { byName(name: string): Person | null; byKey(key: string): Person | null; list(): readonly Person[] } {
  return {
    byName: (name) => list.find((person) => person.name.toLowerCase() === name.toLowerCase()) ?? null,
    byKey: (key) => list.find((person) => `${person.tableId}/${person.personId}` === key || person.aliases.includes(key)) ?? null,
    list: () => list,
  };
}

/** A catalogue of notes only: path → text, each with its `atlas-share` value. */
export function noteCatalogue(notes: Record<string, { text: string; share: unknown }>, people: readonly Person[]): SenderCatalogue {
  const ids = new Map<string, string>();
  const items = {
    idFor: (path: string): string => {
      if (!ids.has(path)) ids.set(path, `n${ids.size}`.padEnd(22, 'x'));
      return ids.get(path)!;
    },
    pathOf: (item: string): string | null => [...ids].find(([, id]) => id === item)?.[0] ?? null,
  };
  const title = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/, '');
  const sources: CatalogueSources = {
    notes: () => Object.entries(notes).filter(([, note]) => note.share !== undefined)
      .map(([path, note]) => ({ path, title: title(path), rule: parseShareRule(note.share) })),
    note: (path) => (notes[path] ? { path, title: title(path), rule: parseShareRule(notes[path]!.share) } : null),
    read: async (path) => notes[path]?.text ?? '',
    maps: async () => [],
    readMap: async () => null,
    images: memoryImageFiles({}).source,
    isFile: (path) => path in notes,
    resolveLink: (linkpath) => Object.keys(notes).find((path) => title(path) === linkpath) ?? null,
    shareable: () => [],
    rules: () => ({ showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: false, showWidgets: true, showInitiative: true }),
    collectionGrid: () => null,
  };
  return new SenderCatalogue(sources, items, testPeople(people), nodeHash, async () => null);
}
```

(Move the new imports to the top of the file with the others.)

- [ ] **Step 2: Write the failing protocol and transfer tests**

Create `tests/unit/online/sharing/shareProtocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeAsset, encodeChunk } from '../../../../src/app/online/assets/assetProtocol';
import { SHARE_HANDLE_MIN, SHARE_LIMITS } from '../../../../src/app/online/sharing/transport/shareLimits';
import { decodeShare, encodeShare } from '../../../../src/app/online/sharing/transport/shareProtocol';

const ITEM = 'i'.repeat(22);
const REQ = 'r'.repeat(11);
const FP = 'F'.repeat(43);
const raw = (message: Record<string, unknown>): string => JSON.stringify({ v: 1, ...message });

describe('share messages', () => {
  it('accept well-formed requests, lists and pulls', () => {
    expect(decodeShare(raw({ type: 'share-list-request', to: 'gm', req: REQ }))).toMatchObject({ kind: 'message' });
    const item = { item: ITEM, kind: 'map', title: 'Inn', version: FP, size: 10, mode: 'player-safe', linked: [ITEM] };
    expect(decodeShare(raw({ type: 'share-list', to: 'ana', from: 'gm', req: REQ, items: [item] }))).toMatchObject({ kind: 'message' });
    expect(decodeShare(raw({ type: 'share-pull', to: 'gm', req: REQ, item: `${ITEM}/${FP}` })).kind).toBe('message');
  });

  it('refuse bad addresses, ids, items and sizes', () => {
    expect(decodeShare(raw({ type: 'share-list-request', req: REQ })).kind).toBe('invalid');
    expect(decodeShare(raw({ type: 'share-list-request', to: 'bad id', req: REQ })).kind).toBe('invalid');
    expect(decodeShare(raw({ type: 'share-pull', to: 'gm', req: REQ, item: '../notes' })).kind).toBe('invalid');
    expect(decodeShare(raw({ type: 'share-list', to: 'a', req: REQ, items: [{ item: ITEM, kind: 'pdf', title: 'x', version: FP, size: 1 }] })).kind).toBe('invalid');
    expect(decodeShare(raw({ type: 'share-start', to: 'a', req: REQ, handle: 5, size: 1, kind: 'note', version: FP })).kind).toBe('invalid');
    expect(decodeShare(raw({ type: 'share-start', to: 'a', req: REQ, handle: SHARE_HANDLE_MIN, size: SHARE_LIMITS.noteBytes + 1, kind: 'note', version: FP })).kind)
      .toBe('invalid');
    expect(decodeShare(raw({ type: 'share-start', to: 'a', req: REQ, handle: SHARE_HANDLE_MIN, size: 0, kind: 'note', version: FP })).kind).toBe('message');
    expect(decodeShare('x'.repeat(SHARE_LIMITS.messageBytes + 1))).toEqual({ kind: 'invalid', reason: 'too-large' });
  });

  it('keep share chunks and image chunks apart', () => {
    expect(decodeShare(encodeChunk(SHARE_HANDLE_MIN, new Uint8Array([1, 2])))).toMatchObject({ kind: 'chunk', chunk: { handle: SHARE_HANDLE_MIN } });
    expect(decodeShare(encodeChunk(7, new Uint8Array([1, 2])))).toEqual({ kind: 'ignored' });
    expect(decodeShare(raw({ type: 'asset-request', ids: [FP] }))).toEqual({ kind: 'ignored' });
    // The image side (and the web page) ignores share messages.
    expect(decodeAsset(encodeShare({ v: 1, type: 'share-list-request', to: 'gm', req: REQ })).kind).toBe('ignored');
  });
});
```

Create `tests/unit/online/sharing/transfers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncomingTransfers, type IncomingOutcome } from '../../../../src/app/online/sharing/transport/IncomingTransfers';
import { OutgoingTransfers } from '../../../../src/app/online/sharing/transport/OutgoingTransfers';
import { SHARE_LIMITS } from '../../../../src/app/online/sharing/transport/shareLimits';
import { decodeShare } from '../../../../src/app/online/sharing/transport/shareProtocol';

const VERSION = 'V'.repeat(43);
const REQ = 'r'.repeat(11);

/** A sender to `ana` and her receiver, wired back to back: what the sender sends waits in `wire` until delivered. */
function pair() {
  const wire: Array<string | ArrayBuffer> = [];
  const outcomes: Array<[string, IncomingOutcome]> = [];
  let unacked = 0;
  let maxUnacked = 0;
  const outgoing = new OutgoingTransfers((_to, data) => {
    if (typeof data !== 'string') { unacked += data.byteLength - 4; maxUnacked = Math.max(maxUnacked, unacked); }
    wire.push(data);
  }, 'gm');
  const incoming = new IncomingTransfers({
    self: 'ana',
    send: (_to, data) => {
      const decoded = decodeShare(data);
      if (decoded.kind === 'message' && decoded.message.type === 'share-ack') {
        unacked = 0;
        outgoing.ack('ana', decoded.message.handle, decoded.message.received);
      } else wire.push(data);
    },
    done: (req, outcome) => outcomes.push([req, outcome]),
    progress: () => {},
  });
  const deliver = (): void => {
    while (wire.length > 0) {
      const decoded = decodeShare(wire.shift()!);
      if (decoded.kind === 'chunk') incoming.chunk('hop', decoded.chunk);
      else if (decoded.kind === 'message' && decoded.message.type === 'share-start') incoming.start('hop', 'gm', decoded.message);
      else if (decoded.kind === 'message' && decoded.message.type === 'share-end') incoming.end('hop', decoded.message.handle);
    }
  };
  return { wire, outcomes, outgoing, incoming, deliver, maxUnacked: () => maxUnacked };
}

afterEach(() => { vi.useRealTimers(); });

describe('windowed transfers', () => {
  it('send a large item within the window and assemble it whole', async () => {
    const { outgoing, outcomes, deliver, maxUnacked } = pair();
    const bytes = new Uint8Array(3 * 1024 * 1024).map((_, index) => index % 251);
    const sent = outgoing.send('ana', REQ, { kind: 'map', bytes: bytes.buffer, version: VERSION });
    deliver();
    await sent;
    expect(maxUnacked()).toBeLessThanOrEqual(SHARE_LIMITS.windowBytes);
    const [req, outcome] = outcomes[0]!;
    expect(req).toBe(REQ);
    expect(outcome.ok && new Uint8Array(outcome.item.bytes)).toEqual(bytes);
    expect(outgoing.openCount('ana')).toBe(0);
  });

  it('send an empty item: a start and an end', async () => {
    const { outgoing, outcomes, deliver } = pair();
    const sent = outgoing.send('ana', REQ, { kind: 'note', bytes: new ArrayBuffer(0), version: VERSION });
    deliver();
    await sent;
    expect(outcomes[0]![1]).toMatchObject({ ok: true, item: { kind: 'note', version: VERSION } });
  });

  it('fail a transfer that ends short or overflows', () => {
    const { incoming, outcomes } = pair();
    incoming.start('hop', 'gm', { v: 1, type: 'share-start', to: 'ana', req: REQ, handle: 0x8000_0001, size: 4, kind: 'note', version: VERSION });
    incoming.end('hop', 0x8000_0001);
    expect(outcomes[0]![1]).toEqual({ ok: false, reason: 'failed' });
    incoming.start('hop', 'gm', { v: 1, type: 'share-start', to: 'ana', req: 'q'.repeat(11), handle: 0x8000_0002, size: 2, kind: 'note', version: VERSION });
    incoming.chunk('hop', { handle: 0x8000_0002, bytes: new Uint8Array([1, 2, 3]) });
    expect(outcomes[1]![1]).toEqual({ ok: false, reason: 'too-large' });
  });

  it('cancel a send that gets no acknowledgement for a minute', () => {
    vi.useFakeTimers();
    const { outgoing, wire } = pair();
    void outgoing.send('ana', REQ, { kind: 'map', bytes: new ArrayBuffer(2 * 1024 * 1024), version: VERSION });
    vi.advanceTimersByTime(SHARE_LIMITS.stallMs);
    const last = decodeShare(wire.at(-1)!);
    expect(last.kind === 'message' && last.message.type).toBe('share-cancel');
    expect(outgoing.openCount('ana')).toBe(0);
  });
});
```

- [ ] **Step 3: Write the failing node, relay and end-to-end tests**

Create `tests/unit/online/sharing/shareNode.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueItem, SharePayload } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { ShareError, ShareNode, type ShareNodeOptions } from '../../../../src/app/online/sharing/transport/ShareNode';
import { decodeShare } from '../../../../src/app/online/sharing/transport/shareProtocol';
import { nodeHash } from '../assetFixtures';
import { noteCatalogue, TABLE_ID, testPerson } from './sharingFixtures';

type Catalogue = ShareNodeOptions['catalogue'];

/** Nodes wired by person id; every frame is recorded as text, so a test can see what crossed. */
function network() {
  const nodes = new Map<string, ShareNode>();
  const frames: string[] = [];
  const add = (self: string, catalogue: Catalogue, onPush: ShareNodeOptions['onPush'] = () => {}): ShareNode => {
    const node = new ShareNode({
      self, catalogue, hash: nodeHash, onPush,
      send: (to, data) => {
        frames.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
        queueMicrotask(() => {
          const target = nodes.get(to);
          const decoded = decodeShare(data);
          if (!target) return;
          if (decoded.kind === 'chunk') target.chunk(`from-${self}`, decoded.chunk);
          else if (decoded.kind === 'message' && decoded.message.from) target.receive(`from-${self}`, { ...decoded.message, from: decoded.message.from });
        });
      },
    });
    nodes.set(self, node);
    return node;
  };
  return { add, frames };
}

const ana = testPerson('ana', 'Ana');
const none: Catalogue = { list: async () => [], open: async () => null };
const recipientCatalogue = (catalogue: ReturnType<typeof noteCatalogue>): Catalogue => ({
  list: (person) => catalogue.list({ tableId: TABLE_ID, personId: person }),
  open: (person, ref) => catalogue.open({ tableId: TABLE_ID, personId: person }, ref),
});

afterEach(() => { vi.useRealTimers(); });

describe('ShareNode', () => {
  it('lists and pulls a note, and sends only the filtered text', async () => {
    const { add, frames } = network();
    const notes = noteCatalogue({ 'Notes/Cave.md': { text: 'A cave.\n> [!private]\n> Dragon gold.\n\nEnd.', share: ['Ana'] } }, [ana]);
    add('gm', recipientCatalogue(notes));
    const player = add('ana', none);
    const items = await player.requestList('gm');
    expect(items.map((item: CatalogueItem) => item.title)).toEqual(['Cave']);
    const pulled = await player.pull('gm', items[0]!.item, 'note');
    expect(new TextDecoder().decode(pulled.bytes)).toBe('A cave.\n\nEnd.');
    expect(pulled.version).toBe(items[0]!.version);
    expect(frames.join('\n')).not.toContain('Dragon');
  });

  it('denies what is not shared and refuses an item whose bytes do not match its version', async () => {
    const { add } = network();
    const liar: Catalogue = {
      list: async () => [],
      open: async (): Promise<SharePayload> => ({ kind: 'note', bytes: new TextEncoder().encode('x').buffer, version: 'X'.repeat(43) }),
    };
    add('gm', none);
    add('liar', liar);
    const player = add('ana', none);
    await expect(player.pull('gm', 'i'.repeat(22), 'note')).rejects.toMatchObject({ reason: 'not-shared' });
    await expect(player.pull('liar', 'i'.repeat(22), 'note')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('passes a push request up and does nothing else', async () => {
    const { add } = network();
    const pushes: unknown[] = [];
    const gm = add('gm', none);
    add('ana', none, (from, push) => pushes.push({ from, ...push }));
    gm.push('ana', 'i'.repeat(22), 'note', 'Cave');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pushes).toEqual([{ from: 'gm', item: 'i'.repeat(22), kind: 'note', title: 'Cave' }]);
  });

  it('pulls a map’s many images one after another without being told busy', async () => {
    const { add } = network();
    const image = new TextEncoder().encode('png').buffer;
    const version = await nodeHash(image);
    const images: Catalogue = {
      list: async () => [],
      open: async (_person, ref): Promise<SharePayload | null> => (ref.includes('/') ? { kind: 'image', bytes: image, version, mime: 'image/png' } : null),
    };
    add('gm', images);
    const player = add('ana', none);
    for (let index = 0; index < 12; index++) {
      await expect(player.pull('gm', `${'m'.repeat(22)}/${version}`, 'image')).resolves.toMatchObject({ kind: 'image', version });
    }
  });

  it('answers busy past the rate limit', async () => {
    const { add } = network();
    add('gm', none);
    const player = add('ana', none);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => player.requestList('gm')));
    expect(results.some((result) => result.status === 'rejected' && (result.reason as ShareError).reason === 'busy')).toBe(true);
  });

  it('times out a request nobody answers, and fails pending pulls when the peer goes', async () => {
    vi.useFakeTimers();
    const { add } = network();
    const player = add('ana', none);
    const listed = player.requestList('nobody');
    const pulled = player.pull('gm', 'i'.repeat(22), 'note');
    player.peerGone('gm');
    await expect(pulled).rejects.toMatchObject({ reason: 'gone' });
    vi.advanceTimersByTime(15_000);
    await expect(listed).rejects.toMatchObject({ reason: 'timeout' });
  });
});
```

Create `tests/unit/online/sharing/shareRelay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeChunk } from '../../../../src/app/online/assets/assetProtocol';
import { ShareRelay } from '../../../../src/app/online/sharing/transport/ShareRelay';
import { SHARE_HANDLE_MIN } from '../../../../src/app/online/sharing/transport/shareLimits';
import { decodeShare, type ShareMessage } from '../../../../src/app/online/sharing/transport/shareProtocol';

const REQ = 'r'.repeat(11);
const V = 'V'.repeat(43);
const H = SHARE_HANDLE_MIN + 41;

/** Whether anything reachable from `value` is bytes. */
function holdsBytes(value: unknown, seen = new Set<unknown>()): boolean {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  const children = value instanceof Map ? [...value.values()] : Object.values(value);
  return children.some((child) => holdsBytes(child, seen));
}

function relay(buffered = 0) {
  const sent: Array<{ to: string; data: string | ArrayBuffer }> = [];
  const decode = (index: number) => decodeShare(sent[index]!.data);
  return { sent, decode, relay: new ShareRelay((to, data) => sent.push({ to, data }), () => buffered) };
}

const start: ShareMessage = { v: 1, type: 'share-start', to: 'ben', from: 'ana', req: REQ, handle: H, size: 3, kind: 'note', version: V };

describe('ShareRelay', () => {
  it('forwards without storing: start, chunks and end with its own handle, acks mapped back', () => {
    const { sent, decode, relay: r } = relay();
    r.message('ana', start);
    const forwarded = decode(0);
    expect(sent[0]!.to).toBe('ben');
    expect(forwarded.kind === 'message' && forwarded.message).toMatchObject({ type: 'share-start', from: 'ana' });
    const handle = forwarded.kind === 'message' && forwarded.message.type === 'share-start' ? forwarded.message.handle : 0;
    expect(handle).toBeGreaterThanOrEqual(SHARE_HANDLE_MIN);
    const frame = encodeChunk(H, new Uint8Array([1, 2, 3]));
    const chunk = decodeShare(frame);
    expect(chunk.kind === 'chunk' && r.chunk('ana', chunk.chunk)).toBe(true);
    const out = decode(1);
    expect(out.kind === 'chunk' && [out.chunk.handle, [...out.chunk.bytes]]).toEqual([handle, [1, 2, 3]]);
    expect(sent[1]!.data).not.toBe(frame);
    expect(holdsBytes(r)).toBe(false);
    r.message('ben', { v: 1, type: 'share-ack', to: 'ana', from: 'ben', handle, received: 3 });
    expect(sent[2]!.to).toBe('ana');
    expect(decode(2)).toMatchObject({ kind: 'message', message: { type: 'share-ack', handle: H, from: 'ben' } });
    r.message('ana', { v: 1, type: 'share-end', to: 'ben', from: 'ana', handle: H });
    expect(decode(3)).toMatchObject({ kind: 'message', message: { type: 'share-end', handle } });
    expect(r.mappings()).toBe(0);
    expect(chunk.kind === 'chunk' && r.chunk('ana', chunk.chunk)).toBe(false);
  });

  it('stamps the sender on everything else', () => {
    const { decode, relay: r } = relay();
    r.message('ana', { v: 1, type: 'share-pull', to: 'ben', from: 'gm', req: REQ, item: 'i'.repeat(22) });
    expect(decode(0)).toMatchObject({ kind: 'message', message: { type: 'share-pull', from: 'ana' } });
  });

  it('cancels both sides when either goes or the receiver falls behind', () => {
    const gone = relay();
    gone.relay.message('ana', start);
    gone.relay.gone('ben');
    expect(gone.decode(1)).toMatchObject({ kind: 'message', message: { type: 'share-cancel', handle: H } });
    expect(gone.relay.mappings()).toBe(0);
    const slow = relay(8 * 1024 * 1024);
    slow.relay.message('ana', start);
    const chunk = decodeShare(encodeChunk(H, new Uint8Array([1])));
    expect(chunk.kind === 'chunk' && slow.relay.chunk('ana', chunk.chunk)).toBe(true);
    expect(slow.sent.slice(1).map((entry) => entry.to).sort()).toEqual(['ana', 'ben']);
    expect(slow.relay.mappings()).toBe(0);
  });
});
```

Create `tests/unit/online/sharing/shareSessionEndToEnd.test.ts`:

```ts
/** Three Atlases over `MemoryTransport`: the GM's session with its share host, and two Obsidian players with share links. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmSession, type SessionPlayer } from '../../../../src/app/online/GmSession';
import { PlayerSession } from '../../../../src/app/online/PlayerSession';
import type { TableProof } from '../../../../src/app/online/protocol';
import { GmShareHost } from '../../../../src/app/online/sharing/transport/GmShareHost';
import { PlayerShareLink } from '../../../../src/app/online/sharing/transport/PlayerShareLink';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { nodeHash } from '../assetFixtures';
import { noteCatalogue, TABLE_ID, testPerson } from './sharingFixtures';

const proof = (personId: string): TableProof => ({ id: TABLE_ID, key: 'K'.repeat(120), personId, gmName: 'Morgan', sig: 'S'.repeat(86) });
const gmPerson = testPerson('gm', 'Morgan');
const ana = testPerson('ana', 'Ana');
const ben = testPerson('ben', 'Ben');

async function world() {
  const network = new MemoryNetwork();
  const requests: SessionPlayer[] = [];
  const gm = new GmSession(network.host('gm'), { title: 'Vault', onJoinRequest: (player) => requests.push(player), onRequestClosed: () => {}, onPlayersChanged: () => {} });
  gm.start();
  const gmNotes = noteCatalogue({ 'Lore/Map.md': { text: 'The realm.', share: 'public' } }, [ana, ben]);
  const host = new GmShareHost({ session: gm, tableId: TABLE_ID, catalogue: gmNotes, hash: nodeHash });
  host.start();
  const join = async (person: typeof ana, notes: ReturnType<typeof noteCatalogue>) => {
    const link = new PlayerShareLink({ catalogue: notes, hash: nodeHash });
    const session = new PlayerSession({
      hostId: 'gm', name: person.name, playerKey: `key-${person.personId}`, clientVersion: '1', clientKind: 'obsidian',
      transport: network.client(), onChange: () => {}, share: link,
    });
    session.start();
    await vi.advanceTimersByTimeAsync(0);
    gm.allow(requests.at(-1)!.playerId, { personId: person.personId, table: proof(person.personId) });
    await vi.advanceTimersByTimeAsync(0);
    link.activate({ tableId: TABLE_ID, personId: person.personId });
    return { link, session };
  };
  const anaSide = await join(ana, noteCatalogue({ 'Notes/Clue.md': { text: 'For Ben.\n%% not for him %%', share: ['Ben'] } }, [gmPerson, ben]));
  const benSide = await join(ben, noteCatalogue({}, []));
  const settle = async <T>(promise: Promise<T>): Promise<T> => {
    for (let i = 0; i < 50; i++) await vi.advanceTimersByTimeAsync(0);
    return promise;
  };
  return { gm, host, anaSide, benSide, settle };
}

describe('sharing in a session', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a player lists and pulls from the GM', async () => {
    const { gm, host, anaSide, settle } = await world();
    const items = await settle(anaSide.link.node!.requestList('gm'));
    expect(items.map((item) => item.title)).toEqual(['Map']);
    const pulled = await settle(anaSide.link.node!.pull('gm', items[0]!.item, 'note'));
    expect(new TextDecoder().decode(pulled.bytes)).toBe('The realm.');
    host.stop();
    gm.stop();
  });

  it('a player pulls from another player through the GM, which keeps nothing of it', async () => {
    const { gm, host, benSide, settle } = await world();
    const items = await settle(benSide.link.node!.requestList('ana'));
    expect(items.map((item) => item.title)).toEqual(['Clue']);
    const pulled = await settle(benSide.link.node!.pull('ana', items[0]!.item, 'note'));
    expect(new TextDecoder().decode(pulled.bytes)).toBe('For Ben.');
    expect(host.relayMappings()).toBe(0);
    expect(host.people().map((person) => person.personId).sort()).toEqual(['ana', 'ben']);
    host.stop();
    gm.stop();
  });

  it('answers for whoever really asked: the GM stamps the sender', async () => {
    const { gm, host, anaSide, benSide, settle } = await world();
    expect((await settle(benSide.link.node!.requestList('ana'))).map((item) => item.title)).toEqual(['Clue']);
    // Ana asking her own catalogue through the GM is answered for Ana, with whom none of it is shared.
    expect(await settle(anaSide.link.node!.requestList('ana'))).toEqual([]);
    host.stop();
    gm.stop();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing`
Expected: FAIL. The transport modules are not found, and `PlayerSessionOptions` has no `share`.

- [ ] **Step 5: Implement limits and the wire format**

In `src/app/online/assets/assetProtocol.ts`, add below `MAX_HANDLE`:

```ts
/** Image transfers use handles up to this one; sharing (Obsidian clients) uses the ones above, so the two never collide. */
export const IMAGE_HANDLE_MAX = 0x7fff_ffff;
```

In `src/app/online/assets/AssetServer.ts`, import `IMAGE_HANDLE_MAX` and wrap image handles below it:

```ts
      queue.nextHandle = queue.nextHandle >= IMAGE_HANDLE_MAX ? 1 : queue.nextHandle + 1;
```

Create `src/app/online/sharing/transport/shareLimits.ts`:

```ts
/** Limits of sharing between Obsidian clients, as images have theirs. */
import { ASSET_LIMITS } from '../../assets/assetIds';
import { IMAGE_HANDLE_MAX } from '../../assets/assetProtocol';
import type { ShareKind } from './shareProtocol';

const MiB = 1024 * 1024;

export const SHARE_LIMITS = {
  noteBytes: 2 * MiB,
  mapBytes: 16 * MiB,
  imageBytes: ASSET_LIMITS.fileBytes,
  /** Longest share message (a full catalogue list fits). */
  messageBytes: 256 * 1024,
  catalogueItems: 500,
  /** A sender keeps at most this much of a transfer unacknowledged, so no hop holds more. */
  windowBytes: MiB,
  /** A receiver acknowledges every this many bytes, and at the end. */
  ackEveryBytes: 256 * 1024,
  /** The GM cancels a relayed transfer whose receiver's channel holds more than this. */
  relayBufferBytes: 2 * MiB,
  chunkBytes: ASSET_LIMITS.sentChunkBytes,
  incomingPerPeer: 4,
  queuedPerPeer: 16,
  requestsPerSecond: 10,
  requestTimeoutMs: 15_000,
  stallMs: 60_000,
} as const;

export const SHARE_HANDLE_MIN = IMAGE_HANDLE_MAX + 1;

export function maxShareBytes(kind: ShareKind): number {
  return kind === 'note' ? SHARE_LIMITS.noteBytes : kind === 'map' ? SHARE_LIMITS.mapBytes : SHARE_LIMITS.imageBytes;
}
```

Create `src/app/online/sharing/transport/shareProtocol.ts`:

```ts
/**
 * Sharing's messages, on the assets channel beside images: JSON `share-*` messages addressed
 * by person id, and binary chunks (4-byte handle, then bytes) with handles at or above
 * `SHARE_HANDLE_MIN`. The GM stamps `from` on everything a player sends. Each validator returns
 * a fresh message of its named fields only. The web page and the image code ignore all of it.
 */
import { ASSET_LIMITS, isAssetId, isAssetMime, type AssetMime } from '../../assets/assetIds';
import { binaryOf, MAX_HANDLE, type AssetChunk } from '../../assets/assetProtocol';
import { isPersonId, PROTOCOL_VERSION } from '../../protocol';
import type { CatalogueItem } from '../model/SenderCatalogue';
import { maxShareBytes, SHARE_HANDLE_MIN, SHARE_LIMITS } from './shareLimits';

export type ShareKind = 'note' | 'map' | 'image';
export type ShareDenyReason = 'not-shared' | 'busy' | 'too-large' | 'gone' | 'failed';
const DENY_REASONS: readonly ShareDenyReason[] = ['not-shared', 'busy', 'too-large', 'gone', 'failed'];

interface Routed { v: 1; to: string; from?: string }

export type ShareStart = Routed & { type: 'share-start'; req: string; handle: number; size: number; kind: ShareKind; version: string; mime?: AssetMime };

export type ShareMessage =
  | (Routed & { type: 'share-list-request'; req: string })
  | (Routed & { type: 'share-list'; req: string; items: CatalogueItem[] })
  | (Routed & { type: 'share-pull'; req: string; item: string })
  | ShareStart
  | (Routed & { type: 'share-ack'; handle: number; received: number })
  | (Routed & { type: 'share-end'; handle: number })
  | (Routed & { type: 'share-cancel'; handle: number })
  | (Routed & { type: 'share-denied'; req: string; reason: ShareDenyReason })
  | (Routed & { type: 'share-push'; item: string; kind: 'note' | 'map'; title: string });

export type DecodedShare =
  | { kind: 'message'; message: ShareMessage }
  | { kind: 'chunk'; chunk: AssetChunk }
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string };

type Fields = Record<string, unknown>;
const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const ITEM_ID = /^[A-Za-z0-9_-]{22}$/;
export const isRequestId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(value);
/** An item id, or `<map item>/<image fingerprint>`. */
export function isItemRef(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [item, image, extra] = value.split('/');
  return extra === undefined && ITEM_ID.test(item ?? '') && (image === undefined || isAssetId(image));
}
const isHandle = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= SHARE_HANDLE_MIN && (value as number) <= MAX_HANDLE;
const isKind = (value: unknown): value is ShareKind => value === 'note' || value === 'map' || value === 'image';
const isTitle = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

function catalogueItem(value: unknown): CatalogueItem | null {
  if (!isRecord(value) || !isItemRef(value.item) || value.item.includes('/') || (value.kind !== 'note' && value.kind !== 'map')) return null;
  if (!isTitle(value.title) || !isAssetId(value.version) || !Number.isSafeInteger(value.size) || (value.size as number) < 0) return null;
  const item: CatalogueItem = { item: value.item, kind: value.kind, title: value.title, version: value.version, size: value.size as number };
  if (value.mode !== undefined) {
    if (value.mode !== 'player-safe' && value.mode !== 'full') return null;
    item.mode = value.mode;
  }
  if (value.linked !== undefined) {
    if (!Array.isArray(value.linked) || value.linked.length > SHARE_LIMITS.catalogueItems || !value.linked.every((id) => typeof id === 'string' && ITEM_ID.test(id))) return null;
    item.linked = [...(value.linked as string[])];
  }
  return item;
}

function routed(m: Fields): Routed | null {
  if (!isPersonId(m.to) || (m.from !== undefined && !isPersonId(m.from))) return null;
  return { v: 1, to: m.to, ...(m.from !== undefined ? { from: m.from as string } : {}) };
}

const VALIDATORS: Record<ShareMessage['type'], (m: Fields, r: Routed) => ShareMessage | null> = {
  'share-list-request': (m, r) => (isRequestId(m.req) ? { ...r, type: 'share-list-request', req: m.req } : null),
  'share-list': (m, r) => {
    if (!isRequestId(m.req) || !Array.isArray(m.items) || m.items.length > SHARE_LIMITS.catalogueItems) return null;
    const items = m.items.map(catalogueItem);
    return items.every((item): item is CatalogueItem => item !== null) ? { ...r, type: 'share-list', req: m.req, items } : null;
  },
  'share-pull': (m, r) => (isRequestId(m.req) && isItemRef(m.item) ? { ...r, type: 'share-pull', req: m.req, item: m.item } : null),
  'share-start': (m, r) => {
    if (!isRequestId(m.req) || !isHandle(m.handle) || !isKind(m.kind) || !isAssetId(m.version)) return null;
    if (!Number.isSafeInteger(m.size) || (m.size as number) < 0 || (m.size as number) > maxShareBytes(m.kind)) return null;
    if (m.mime !== undefined && (m.kind !== 'image' || !isAssetMime(m.mime))) return null;
    return { ...r, type: 'share-start', req: m.req, handle: m.handle, size: m.size as number, kind: m.kind, version: m.version, ...(m.mime !== undefined ? { mime: m.mime as AssetMime } : {}) };
  },
  'share-ack': (m, r) => (isHandle(m.handle) && Number.isSafeInteger(m.received) && (m.received as number) >= 0
    ? { ...r, type: 'share-ack', handle: m.handle, received: m.received as number } : null),
  'share-end': (m, r) => (isHandle(m.handle) ? { ...r, type: 'share-end', handle: m.handle } : null),
  'share-cancel': (m, r) => (isHandle(m.handle) ? { ...r, type: 'share-cancel', handle: m.handle } : null),
  'share-denied': (m, r) => (isRequestId(m.req) && DENY_REASONS.includes(m.reason as ShareDenyReason)
    ? { ...r, type: 'share-denied', req: m.req, reason: m.reason as ShareDenyReason } : null),
  'share-push': (m, r) => (isItemRef(m.item) && !m.item.includes('/') && (m.kind === 'note' || m.kind === 'map') && isTitle(m.title)
    ? { ...r, type: 'share-push', item: m.item, kind: m.kind, title: m.title } : null),
};

export function encodeShare(message: ShareMessage): string {
  return JSON.stringify(message);
}

export function decodeShare(raw: unknown): DecodedShare {
  if (typeof raw !== 'string') {
    const bytes = binaryOf(raw);
    if (!bytes || bytes.byteLength < 4) return { kind: 'invalid', reason: 'bad-chunk' };
    const handle = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
    if (handle < SHARE_HANDLE_MIN) return { kind: 'ignored' };
    if (bytes.byteLength === 4 || bytes.byteLength > 4 + ASSET_LIMITS.chunkBytes) return { kind: 'invalid', reason: 'bad-chunk-size' };
    return { kind: 'chunk', chunk: { handle, bytes: bytes.subarray(4) } };
  }
  if (raw.length > SHARE_LIMITS.messageBytes) return { kind: 'invalid', reason: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'not-json' };
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string' || !parsed.type.startsWith('share-')) return { kind: 'ignored' };
  if (parsed.v !== PROTOCOL_VERSION) return { kind: 'invalid', reason: 'version' };
  const type = parsed.type as ShareMessage['type'];
  if (!Object.hasOwn(VALIDATORS, type)) return { kind: 'ignored' };
  const route = routed(parsed);
  const message = route ? VALIDATORS[type](parsed, route) : null;
  return message ? { kind: 'message', message } : { kind: 'invalid', reason: `bad-${type}` };
}
```

- [ ] **Step 6: Implement the transfers**

Create `src/app/online/sharing/transport/OutgoingTransfers.ts`:

```ts
/**
 * Sends items in chunks, at most `windowBytes` ahead of the receiver's last acknowledgement, so
 * neither this side nor a relaying GM ever holds more of a transfer. A send that gets no
 * acknowledgement for `stallMs` is cancelled. Sending is re-entrant-safe: an acknowledgement
 * that arrives while chunks go out (in-memory links answer at once) only marks another round.
 */
import { encodeChunk, MAX_HANDLE } from '../../assets/assetProtocol';
import type { SharePayload } from '../model/SenderCatalogue';
import { SHARE_HANDLE_MIN, SHARE_LIMITS } from './shareLimits';
import { encodeShare } from './shareProtocol';

type Send = (to: string, data: string | ArrayBuffer) => void;

interface Outgoing {
  to: string;
  handle: number;
  bytes: Uint8Array;
  offset: number;
  acked: number;
  pumping: boolean;
  again: boolean;
  timer: number | null;
  finish: () => void;
}

export class OutgoingTransfers {
  private readonly open = new Map<number, Outgoing>();
  private nextHandle = SHARE_HANDLE_MIN;

  /** `self`: this side's person id, the `from` of every message it sends. */
  constructor(private readonly sendTo: Send, private readonly self: string) {}

  /** Starts sending; settles when the item went out whole, was cancelled or its receiver left. */
  send(to: string, req: string, payload: SharePayload): Promise<void> {
    return new Promise((resolve) => {
      const transfer: Outgoing = {
        to, handle: this.allocate(), bytes: new Uint8Array(payload.bytes), offset: 0, acked: 0, pumping: false, again: false, timer: null, finish: resolve,
      };
      this.open.set(transfer.handle, transfer);
      this.sendTo(to, encodeShare({
        v: 1, type: 'share-start', to, from: this.self, req, handle: transfer.handle, size: transfer.bytes.byteLength, kind: payload.kind, version: payload.version,
        ...(payload.mime ? { mime: payload.mime } : {}),
      }));
      this.pump(transfer);
    });
  }

  ack(from: string, handle: number, received: number): void {
    const transfer = this.open.get(handle);
    if (!transfer || transfer.to !== from) return;
    transfer.acked = Math.max(transfer.acked, Math.min(received, transfer.offset));
    this.pump(transfer);
  }

  cancel(from: string, handle: number): void {
    const transfer = this.open.get(handle);
    if (transfer && transfer.to === from) this.finish(transfer);
  }

  drop(to: string): void {
    for (const transfer of [...this.open.values()]) if (transfer.to === to) this.finish(transfer);
  }

  openCount(to: string): number {
    return [...this.open.values()].filter((transfer) => transfer.to === to).length;
  }

  stop(): void {
    for (const transfer of [...this.open.values()]) this.finish(transfer);
  }

  private allocate(): number {
    while (this.open.has(this.nextHandle)) this.nextHandle = this.nextHandle >= MAX_HANDLE ? SHARE_HANDLE_MIN : this.nextHandle + 1;
    const handle = this.nextHandle;
    this.nextHandle = handle >= MAX_HANDLE ? SHARE_HANDLE_MIN : handle + 1;
    return handle;
  }

  private pump(transfer: Outgoing): void {
    if (transfer.pumping) {
      transfer.again = true;
      return;
    }
    transfer.pumping = true;
    try {
      do {
        transfer.again = false;
        const total = transfer.bytes.byteLength;
        while (this.open.get(transfer.handle) === transfer && transfer.offset < total
          && transfer.offset - transfer.acked < SHARE_LIMITS.windowBytes) {
          const start = transfer.offset;
          transfer.offset = Math.min(start + SHARE_LIMITS.chunkBytes, total);
          this.sendTo(transfer.to, encodeChunk(transfer.handle, transfer.bytes.subarray(start, transfer.offset)));
        }
      } while (transfer.again);
      if (this.open.get(transfer.handle) !== transfer) return;
      if (transfer.offset >= transfer.bytes.byteLength) {
        this.sendTo(transfer.to, encodeShare({ v: 1, type: 'share-end', to: transfer.to, from: this.self, handle: transfer.handle }));
        this.finish(transfer);
      } else {
        this.arm(transfer);
      }
    } finally {
      transfer.pumping = false;
    }
  }

  private arm(transfer: Outgoing): void {
    if (transfer.timer !== null) window.clearTimeout(transfer.timer);
    transfer.timer = window.setTimeout(() => {
      if (this.open.get(transfer.handle) !== transfer) return;
      this.sendTo(transfer.to, encodeShare({ v: 1, type: 'share-cancel', to: transfer.to, from: this.self, handle: transfer.handle }));
      this.finish(transfer);
    }, SHARE_LIMITS.stallMs);
  }

  private finish(transfer: Outgoing): void {
    if (transfer.timer !== null) window.clearTimeout(transfer.timer);
    transfer.timer = null;
    if (this.open.get(transfer.handle) === transfer) this.open.delete(transfer.handle);
    transfer.finish();
  }
}
```

Create `src/app/online/sharing/transport/IncomingTransfers.ts`:

```ts
/**
 * Assembles pulled items from chunks, by the hop they arrive on and their handle. Only
 * transfers this side asked for are opened (the node checks the request), never past their
 * announced size, at most `incomingPerPeer` per sender. Acknowledges every `ackEveryBytes` and
 * at the end, which is what lets the sender go on.
 */
import type { AssetChunk } from '../../assets/assetProtocol';
import type { AssetMime } from '../../assets/assetIds';
import { SHARE_LIMITS } from './shareLimits';
import { encodeShare, type ShareDenyReason, type ShareKind, type ShareStart } from './shareProtocol';

export interface PulledItem {
  kind: ShareKind;
  version: string;
  mime?: AssetMime;
  bytes: ArrayBuffer;
}

export type IncomingOutcome = { ok: true; item: PulledItem } | { ok: false; reason: ShareDenyReason };

interface Incoming {
  from: string;
  start: ShareStart;
  received: number;
  sinceAck: number;
  parts: Uint8Array[];
}

export interface IncomingOptions {
  /** This side's person id, the `from` of its acknowledgements and cancels. */
  self: string;
  send(to: string, data: string): void;
  done(req: string, outcome: IncomingOutcome): void;
  /** Bytes arrived for the request: its stall timer starts over. */
  progress(req: string): void;
}

export class IncomingTransfers {
  private readonly open = new Map<string, Incoming>();

  constructor(private readonly options: IncomingOptions) {}

  start(hop: string, from: string, start: ShareStart): boolean {
    const key = `${hop}:${start.handle}`;
    if (this.open.has(key) || [...this.open.values()].filter((incoming) => incoming.from === from).length >= SHARE_LIMITS.incomingPerPeer) return false;
    this.open.set(key, { from, start, received: 0, sinceAck: 0, parts: [] });
    return true;
  }

  chunk(hop: string, chunk: AssetChunk): void {
    const key = `${hop}:${chunk.handle}`;
    const incoming = this.open.get(key);
    if (!incoming) return;
    if (incoming.received + chunk.bytes.byteLength > incoming.start.size) {
      this.options.send(incoming.from, encodeShare({ v: 1, type: 'share-cancel', to: incoming.from, from: this.options.self, handle: chunk.handle }));
      this.close(key, incoming, { ok: false, reason: 'too-large' });
      return;
    }
    incoming.parts.push(chunk.bytes.slice());
    incoming.received += chunk.bytes.byteLength;
    incoming.sinceAck += chunk.bytes.byteLength;
    this.options.progress(incoming.start.req);
    if (incoming.sinceAck >= SHARE_LIMITS.ackEveryBytes || incoming.received === incoming.start.size) {
      incoming.sinceAck = 0;
      this.options.send(incoming.from, encodeShare({ v: 1, type: 'share-ack', to: incoming.from, from: this.options.self, handle: chunk.handle, received: incoming.received }));
    }
  }

  end(hop: string, handle: number): void {
    const key = `${hop}:${handle}`;
    const incoming = this.open.get(key);
    if (!incoming) return;
    if (incoming.received !== incoming.start.size) {
      this.close(key, incoming, { ok: false, reason: 'failed' });
      return;
    }
    const bytes = new Uint8Array(incoming.start.size);
    let offset = 0;
    for (const part of incoming.parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const { kind, version, mime } = incoming.start;
    this.close(key, incoming, { ok: true, item: { kind, version, bytes: bytes.buffer, ...(mime ? { mime } : {}) } });
  }

  cancel(hop: string, handle: number): void {
    const key = `${hop}:${handle}`;
    const incoming = this.open.get(key);
    if (incoming) this.close(key, incoming, { ok: false, reason: 'gone' });
  }

  /** Fails every transfer from `from`, or from everyone with `null`. */
  dropFrom(from: string | null): void {
    for (const [key, incoming] of [...this.open]) if (from === null || incoming.from === from) this.close(key, incoming, { ok: false, reason: 'gone' });
  }

  stop(): void {
    this.dropFrom(null);
  }

  private close(key: string, incoming: Incoming, outcome: IncomingOutcome): void {
    this.open.delete(key);
    this.options.done(incoming.start.req, outcome);
  }
}
```

In the transfers test the receiver acknowledges at `received === size` as well. An item smaller than the window therefore still gets its final acknowledgement, which the sender ignores once it is done.

- [ ] **Step 7: Implement the node**

Create `src/app/online/sharing/transport/ShareNode.ts`:

```ts
/**
 * One Atlas's sharing endpoint in a session. It answers list and pull requests from its
 * catalogue for the person who asked (whom the GM vouches for), one transfer at a time per
 * person, rate-limited; it asks others for lists and items and checks every item against its
 * version (the SHA-256 of its bytes) before handing it over; push requests only reach
 * `onPush`. Every message it sends carries its own person id as `from`; the GM replaces that
 * with the sender it knows for anything a player sends.
 */
import type { AssetChunk } from '../../assets/assetProtocol';
import { sha256Id, type Hasher } from '../../assets/assetIds';
import { randomId } from '../../ids';
import { RateLimit } from '../../rateLimit';
import type { CatalogueItem, SharePayload } from '../model/SenderCatalogue';
import { IncomingTransfers, type IncomingOutcome, type PulledItem } from './IncomingTransfers';
import { OutgoingTransfers } from './OutgoingTransfers';
import { maxShareBytes, SHARE_LIMITS } from './shareLimits';
import { encodeShare, type ShareDenyReason, type ShareKind, type ShareMessage } from './shareProtocol';

export type { PulledItem } from './IncomingTransfers';

export class ShareError extends Error {
  constructor(readonly reason: ShareDenyReason | 'timeout') {
    super(`Sharing: ${reason}`);
  }
}

export interface PushRequestBody {
  item: string;
  kind: 'note' | 'map';
  title: string;
}

export interface ShareNodeOptions {
  /** This Atlas's person id in the session (`gm` for the GM). */
  self: string;
  /** What a person (by person id) may list and open here. */
  catalogue: {
    list(person: string): Promise<CatalogueItem[]>;
    open(person: string, ref: string): Promise<SharePayload | null>;
  };
  /** Sends to a person: on a player always through the GM; on the GM through that player's channel. */
  send(to: string, data: string | ArrayBuffer): void;
  onPush?(from: string, push: PushRequestBody): void;
  hash?: Hasher;
}

type Pending =
  | { kind: 'list'; to: string; timer: number; resolve(items: CatalogueItem[]): void; reject(error: ShareError): void }
  | { kind: 'pull'; to: string; expect: ShareKind; timer: number; resolve(item: PulledItem): void; reject(error: ShareError): void };

type Routed = ShareMessage & { from: string };

export class ShareNode {
  private readonly pending = new Map<string, Pending>();
  private readonly outgoing: OutgoingTransfers;
  private readonly incoming: IncomingTransfers;
  private readonly limit = new RateLimit(SHARE_LIMITS.requestsPerSecond);
  private readonly queues = new Map<string, { tail: Promise<void>; size: number }>();
  private readonly hash: Hasher;
  private stopped = false;

  constructor(private readonly options: ShareNodeOptions) {
    this.hash = options.hash ?? sha256Id;
    this.outgoing = new OutgoingTransfers(options.send, options.self);
    this.incoming = new IncomingTransfers({
      self: options.self,
      send: options.send,
      done: (req, outcome) => { void this.settle(req, outcome); },
      progress: (req) => this.touch(req, SHARE_LIMITS.stallMs),
    });
  }

  requestList(to: string): Promise<CatalogueItem[]> {
    return new Promise((resolve, reject) => {
      const req = this.open({ kind: 'list', to, resolve, reject });
      this.sendMessage({ v: 1, type: 'share-list-request', to, req });
    });
  }

  pull(to: string, item: string, expect: ShareKind): Promise<PulledItem> {
    return new Promise((resolve, reject) => {
      const req = this.open({ kind: 'pull', to, expect, resolve, reject });
      this.sendMessage({ v: 1, type: 'share-pull', to, req, item });
    });
  }

  /** Asks someone to pull an item; it only shows them a prompt. */
  push(to: string, item: string, kind: 'note' | 'map', title: string): void {
    this.sendMessage({ v: 1, type: 'share-push', to, item, kind, title });
  }

  receive(hop: string, message: Routed): void {
    if (this.stopped) return;
    const from = message.from;
    switch (message.type) {
      case 'share-list-request':
        void this.answerList(from, message.req);
        break;
      case 'share-pull':
        this.queuePull(from, message.req, message.item);
        break;
      case 'share-push':
        if (this.limit.allow(from, Date.now())) this.options.onPush?.(from, { item: message.item, kind: message.kind, title: message.title });
        break;
      case 'share-list': {
        const pending = this.pending.get(message.req);
        if (pending?.kind === 'list' && pending.to === from) {
          this.forget(message.req);
          pending.resolve(message.items);
        }
        break;
      }
      case 'share-start': {
        const pending = this.pending.get(message.req);
        if (pending?.kind === 'pull' && pending.to === from && pending.expect === message.kind && this.incoming.start(hop, from, message)) {
          this.touch(message.req, SHARE_LIMITS.stallMs);
        } else {
          this.sendMessage({ v: 1, type: 'share-cancel', to: from, handle: message.handle });
        }
        break;
      }
      case 'share-ack':
        this.outgoing.ack(from, message.handle, message.received);
        break;
      case 'share-end':
        this.incoming.end(hop, message.handle);
        break;
      case 'share-cancel':
        this.outgoing.cancel(from, message.handle);
        this.incoming.cancel(hop, message.handle);
        break;
      case 'share-denied': {
        const pending = this.pending.get(message.req);
        if (pending && pending.to === from) {
          this.forget(message.req);
          pending.reject(new ShareError(message.reason));
        }
        break;
      }
    }
  }

  chunk(hop: string, chunk: AssetChunk): void {
    if (!this.stopped) this.incoming.chunk(hop, chunk);
  }

  /** Someone left: their requests here stop, and what this side waits for from them fails. */
  peerGone(person: string): void {
    this.outgoing.drop(person);
    this.incoming.dropFrom(person);
    this.queues.delete(person);
    for (const [req, pending] of [...this.pending]) {
      if (pending.to !== person) continue;
      this.forget(req);
      pending.reject(new ShareError('gone'));
    }
  }

  /** This side lost its link: everything in flight fails. */
  disconnected(): void {
    this.outgoing.stop();
    this.incoming.dropFrom(null);
    this.queues.clear();
    for (const [req, pending] of [...this.pending]) {
      this.forget(req);
      pending.reject(new ShareError('gone'));
    }
  }

  stop(): void {
    this.disconnected();
    this.stopped = true;
  }

  private sendMessage(message: ShareMessage): void {
    this.options.send(message.to, encodeShare({ ...message, from: this.options.self }));
  }

  private open(pending: Omit<Pending, 'timer'>): string {
    const req = randomId(8);
    if (this.stopped) {
      queueMicrotask(() => pending.reject(new ShareError('gone')));
      return req;
    }
    this.pending.set(req, { ...pending, timer: 0 } as Pending);
    this.touch(req, SHARE_LIMITS.requestTimeoutMs);
    return req;
  }

  private touch(req: string, ms: number): void {
    const pending = this.pending.get(req);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending.timer = window.setTimeout(() => {
      if (this.pending.get(req) !== pending) return;
      this.forget(req);
      pending.reject(new ShareError('timeout'));
    }, ms);
  }

  private forget(req: string): void {
    const pending = this.pending.get(req);
    if (pending) window.clearTimeout(pending.timer);
    this.pending.delete(req);
  }

  private async settle(req: string, outcome: IncomingOutcome): Promise<void> {
    const pending = this.pending.get(req);
    if (pending?.kind !== 'pull') return;
    this.forget(req);
    if (!outcome.ok) {
      pending.reject(new ShareError(outcome.reason));
      return;
    }
    const matches = (await this.hash(outcome.item.bytes)) === outcome.item.version;
    if (matches) pending.resolve(outcome.item);
    else pending.reject(new ShareError('failed'));
  }

  private deny(to: string, req: string, reason: ShareDenyReason): void {
    this.sendMessage({ v: 1, type: 'share-denied', to, req, reason });
  }

  private async answerList(from: string, req: string): Promise<void> {
    if (!this.limit.allow(from, Date.now())) {
      this.deny(from, req, 'busy');
      return;
    }
    const items = await this.options.catalogue.list(from).catch((): CatalogueItem[] => []);
    if (this.stopped) return;
    const list = items.slice(0, SHARE_LIMITS.catalogueItems);
    // Keep the answer inside one message: drop items from the end until it fits.
    let message = encodeShare({ v: 1, type: 'share-list', to: from, from: this.options.self, req, items: list });
    while (message.length > SHARE_LIMITS.messageBytes && list.length > 0) {
      list.pop();
      message = encodeShare({ v: 1, type: 'share-list', to: from, from: this.options.self, req, items: list });
    }
    this.options.send(from, message);
  }

  private queuePull(from: string, req: string, item: string): void {
    const queue = this.queues.get(from) ?? { tail: Promise.resolve(), size: 0 };
    // A map's images (`<map>/<fingerprint>`) come one after another with it: the queue bounds them, not the rate.
    const limited = !item.includes('/') && !this.limit.allow(from, Date.now());
    if (limited || queue.size >= SHARE_LIMITS.queuedPerPeer) {
      this.deny(from, req, 'busy');
      return;
    }
    queue.size++;
    queue.tail = queue.tail.then(() => this.serve(from, req, item)).finally(() => { queue.size--; });
    this.queues.set(from, queue);
  }

  /** One item to one person; the next waits until this one went out, was cancelled or they left. */
  private async serve(from: string, req: string, item: string): Promise<void> {
    const payload = await this.options.catalogue.open(from, item).catch(() => null);
    if (this.stopped || !this.queues.has(from)) return;
    if (!payload) {
      this.deny(from, req, 'not-shared');
      return;
    }
    if (payload.bytes.byteLength > maxShareBytes(payload.kind)) {
      this.deny(from, req, 'too-large');
      return;
    }
    await this.outgoing.send(from, req, payload);
  }
}
```

- [ ] **Step 8: Implement the relay and the two session ends**

Create `src/app/online/sharing/transport/ShareRelay.ts`:

```ts
/**
 * The GM forwards what one player sends another: messages with the sender stamped as `from`,
 * and transfers chunk by chunk under the GM's own handle on the receiver's hop. It holds only
 * handle mappings, never bytes: each chunk is re-framed and sent the moment it arrives, and
 * the sender's window bounds what the receiver's channel can hold. Mappings go when a transfer
 * ends, is cancelled, or either side leaves.
 */
import { encodeChunk, MAX_HANDLE, type AssetChunk } from '../../assets/assetProtocol';
import { SHARE_HANDLE_MIN, SHARE_LIMITS } from './shareLimits';
import { encodeShare, type ShareMessage } from './shareProtocol';

type Send = (to: string, data: string | ArrayBuffer) => void;

interface Mapping {
  sender: string;
  senderHandle: number;
  receiver: string;
  receiverHandle: number;
}

export class ShareRelay {
  private readonly bySender = new Map<string, Mapping>();
  private readonly byReceiver = new Map<string, Mapping>();
  private nextHandle = SHARE_HANDLE_MIN;

  constructor(private readonly sendTo: Send, private readonly buffered: (to: string) => number) {}

  /** A message from `from` for another player (`message.to`). */
  message(from: string, message: ShareMessage): void {
    switch (message.type) {
      case 'share-start': {
        const mapping: Mapping = { sender: from, senderHandle: message.handle, receiver: message.to, receiverHandle: this.allocate() };
        this.bySender.set(`${from}:${message.handle}`, mapping);
        this.byReceiver.set(`${message.to}:${mapping.receiverHandle}`, mapping);
        this.sendTo(message.to, encodeShare({ ...message, from, handle: mapping.receiverHandle }));
        break;
      }
      case 'share-ack':
      case 'share-cancel': {
        // From the receiver (its own handle), or a cancel from the sender (theirs).
        const back = this.byReceiver.get(`${from}:${message.handle}`);
        const forth = back ? null : this.bySender.get(`${from}:${message.handle}`);
        if (back && back.sender === message.to) {
          this.sendTo(back.sender, encodeShare({ ...message, from, handle: back.senderHandle }));
          if (message.type === 'share-cancel') this.forget(back);
        } else if (forth && forth.receiver === message.to) {
          this.sendTo(forth.receiver, encodeShare({ ...message, from, handle: forth.receiverHandle }));
          this.forget(forth);
        }
        break;
      }
      case 'share-end': {
        const mapping = this.bySender.get(`${from}:${message.handle}`);
        if (!mapping || mapping.receiver !== message.to) break;
        this.sendTo(mapping.receiver, encodeShare({ ...message, from, handle: mapping.receiverHandle }));
        this.forget(mapping);
        break;
      }
      default:
        this.sendTo(message.to, encodeShare({ ...message, from }));
    }
  }

  /** Forwards a chunk of a relayed transfer; false when it belongs to none (the GM's own transfers). */
  chunk(from: string, chunk: AssetChunk): boolean {
    const mapping = this.bySender.get(`${from}:${chunk.handle}`);
    if (!mapping) return false;
    if (this.buffered(mapping.receiver) > SHARE_LIMITS.relayBufferBytes) {
      this.cancelBoth(mapping);
      return true;
    }
    this.sendTo(mapping.receiver, encodeChunk(mapping.receiverHandle, chunk.bytes));
    return true;
  }

  /** Someone left: every transfer they were part of is cancelled for the other side. */
  gone(person: string): void {
    for (const mapping of [...this.bySender.values()]) {
      if (mapping.sender === person) this.cancelTo(mapping.receiver, mapping.receiverHandle, person);
      else if (mapping.receiver === person) this.cancelTo(mapping.sender, mapping.senderHandle, person);
      else continue;
      this.forget(mapping);
    }
  }

  mappings(): number {
    return this.bySender.size;
  }

  stop(): void {
    this.bySender.clear();
    this.byReceiver.clear();
  }

  private cancelBoth(mapping: Mapping): void {
    this.cancelTo(mapping.sender, mapping.senderHandle, mapping.receiver);
    this.cancelTo(mapping.receiver, mapping.receiverHandle, mapping.sender);
    this.forget(mapping);
  }

  private cancelTo(to: string, handle: number, from: string): void {
    this.sendTo(to, encodeShare({ v: 1, type: 'share-cancel', to, from, handle }));
  }

  private forget(mapping: Mapping): void {
    this.bySender.delete(`${mapping.sender}:${mapping.senderHandle}`);
    this.byReceiver.delete(`${mapping.receiver}:${mapping.receiverHandle}`);
  }

  private allocate(): number {
    const handle = this.nextHandle;
    this.nextHandle = handle >= MAX_HANDLE ? SHARE_HANDLE_MIN : handle + 1;
    return handle;
  }
}
```

Create `src/app/online/sharing/transport/GmShareHost.ts`:

```ts
/**
 * The GM's sharing in a hosted session, a `GmSession` handler. Only admitted Obsidian players
 * with a person id take part. Whatever a player sends is stamped with their person id; what is
 * for `gm` reaches the GM's own node, the rest goes through the relay, which stores nothing.
 */
import type { Hasher } from '../../assets/assetIds';
import type { SessionHandler, SessionPlayer } from '../../gmSessionTypes';
import { RateLimit } from '../../rateLimit';
import type { ChannelPort } from '../../transport/types';
import { GM_PERSON_ID } from '../people/peopleTypes';
import type { SenderCatalogue } from '../model/SenderCatalogue';
import type { SessionPerson } from '../shareSessionStore';
import { ShareNode, type ShareNodeOptions } from './ShareNode';
import { ShareRelay } from './ShareRelay';
import { SHARE_LIMITS } from './shareLimits';
import { decodeShare, encodeShare } from './shareProtocol';

export interface GmShareHostOptions {
  session: {
    use(handler: SessionHandler): () => void;
    assetChannel(playerId: string): ChannelPort | null;
    getPlayers(): SessionPlayer[];
  };
  tableId: string;
  catalogue: Pick<SenderCatalogue, 'list' | 'open'>;
  onPush?: ShareNodeOptions['onPush'];
  hash?: Hasher;
}

const ASKS = new Set(['share-list-request', 'share-pull', 'share-push']);

export class GmShareHost implements SessionHandler {
  readonly node: ShareNode;
  private readonly relay: ShareRelay;
  private readonly limit = new RateLimit(SHARE_LIMITS.requestsPerSecond);
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: GmShareHostOptions) {
    const { catalogue, tableId } = options;
    this.node = new ShareNode({
      self: GM_PERSON_ID,
      catalogue: {
        list: (person) => catalogue.list({ tableId, personId: person }),
        open: (person, ref) => catalogue.open({ tableId, personId: person }, ref),
      },
      send: (to, data) => this.portOf(to)?.send(data),
      ...(options.onPush ? { onPush: options.onPush } : {}),
      ...(options.hash ? { hash: options.hash } : {}),
    });
    this.relay = new ShareRelay((to, data) => this.portOf(to)?.send(data), (to) => this.portOf(to)?.bufferedAmount() ?? 0);
  }

  start(): void {
    this.unsubscribe ??= this.options.session.use(this);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.node.stop();
    this.relay.stop();
  }

  /** The people in the session who take part in sharing. */
  people(): SessionPerson[] {
    return this.options.session.getPlayers()
      .filter((player) => player.status === 'admitted' && player.client === 'obsidian' && player.personId)
      .map((player) => ({ personId: player.personId!, name: player.name }));
  }

  relayMappings(): number {
    return this.relay.mappings();
  }

  onAssetData(player: SessionPlayer, data: unknown): void {
    const person = player.personId;
    if (!person || player.client !== 'obsidian') return;
    const decoded = decodeShare(data);
    if (decoded.kind === 'chunk') {
      if (!this.relay.chunk(person, decoded.chunk)) this.node.chunk(person, decoded.chunk);
      return;
    }
    if (decoded.kind !== 'message') return;
    const asked = decoded.message;
    const imagePull = asked.type === 'share-pull' && asked.item.includes('/');
    if (ASKS.has(asked.type) && !imagePull && !this.limit.allow(person, Date.now())) {
      // Answered, not dropped, so the asker does not wait out the timeout.
      if ('req' in asked) this.portOf(person)?.send(encodeShare({ v: 1, type: 'share-denied', to: person, from: asked.to, req: asked.req, reason: 'busy' }));
      return;
    }
    // Who sent it is the GM's to say: a player's own `from` is replaced.
    const message = { ...decoded.message, from: person };
    if (message.to === GM_PERSON_ID) this.node.receive(person, message);
    else if (this.portOf(message.to)) this.relay.message(person, message);
    else if ('req' in message) this.portOf(person)?.send(encodeShare({ v: 1, type: 'share-denied', to: person, from: message.to, req: message.req, reason: 'gone' }));
  }

  onGone(player: SessionPlayer): void {
    if (!player.personId) return;
    this.relay.gone(player.personId);
    this.node.peerGone(player.personId);
  }

  private portOf(personId: string): ChannelPort | null {
    const player = this.options.session.getPlayers()
      .find((candidate) => candidate.personId === personId && candidate.status === 'admitted' && candidate.client === 'obsidian');
    return player ? this.options.session.assetChannel(player.playerId) : null;
  }
}
```

A request for someone who is not in the session is answered `gone` on their behalf (`from` is the absent person's id), so the asker's request settles at once instead of timing out.

In `src/app/online/PlayerSession.ts`, import `channelPort` and `ChannelPort`, and add:

```ts
/** Sharing between Obsidian clients: gets the assets channel while admitted, beside the image loader. */
export interface PlayerShareHandler {
  connected(port: ChannelPort): void;
  receive(data: unknown): void;
  disconnected(): void;
}
```

Add `share?: PlayerShareHandler;` to `PlayerSessionOptions`. In `connect`, the assets branch of `onMessage` becomes:

```ts
      else if (this.assetLink === link && !this.finished) {
        this.options.assets?.receive(data);
        this.options.share?.receive(data);
      }
```

In the `admitted` case, inside `if (this.assetLink !== link) { … }`, add `this.options.share?.connected(channelPort(link, 'assets'));`. In `leaveAssets`, add `this.options.share?.disconnected();`.

Create `src/app/online/sharing/transport/PlayerShareLink.ts`:

```ts
/**
 * A player's sharing: the node for the joined session, on the assets channel to the GM. It is
 * active only once the GM's table proof checked (`activate`), and takes only messages the GM
 * addressed to this player and stamped with a sender.
 */
import type { Hasher } from '../../assets/assetIds';
import type { PlayerShareHandler } from '../../PlayerSession';
import type { ChannelPort } from '../../transport/types';
import type { SenderCatalogue } from '../model/SenderCatalogue';
import { ShareNode, type ShareNodeOptions } from './ShareNode';
import { decodeShare } from './shareProtocol';

const GM_HOP = 'gm-link';

export interface PlayerShareLinkOptions {
  catalogue: Pick<SenderCatalogue, 'list' | 'open'>;
  onPush?: ShareNodeOptions['onPush'];
  hash?: Hasher;
}

export class PlayerShareLink implements PlayerShareHandler {
  private port: ChannelPort | null = null;
  private current: { node: ShareNode; personId: string } | null = null;

  constructor(private readonly options: PlayerShareLinkOptions) {}

  get node(): ShareNode | null {
    return this.current?.node ?? null;
  }

  activate(identity: { tableId: string; personId: string }): ShareNode {
    this.current?.node.stop();
    const { catalogue, tableId } = { catalogue: this.options.catalogue, tableId: identity.tableId };
    const node = new ShareNode({
      self: identity.personId,
      catalogue: {
        list: (person) => catalogue.list({ tableId, personId: person }),
        open: (person, ref) => catalogue.open({ tableId, personId: person }, ref),
      },
      send: (_to, data) => this.port?.send(data),
      ...(this.options.onPush ? { onPush: this.options.onPush } : {}),
      ...(this.options.hash ? { hash: this.options.hash } : {}),
    });
    this.current = { node, personId: identity.personId };
    return node;
  }

  deactivate(): void {
    this.current?.node.stop();
    this.current = null;
  }

  connected(port: ChannelPort): void {
    this.port = port;
  }

  receive(data: unknown): void {
    const current = this.current;
    if (!current) return;
    const decoded = decodeShare(data);
    if (decoded.kind === 'chunk') current.node.chunk(GM_HOP, decoded.chunk);
    else if (decoded.kind === 'message' && decoded.message.from && decoded.message.to === current.personId) {
      current.node.receive(GM_HOP, { ...decoded.message, from: decoded.message.from });
    }
  }

  disconnected(): void {
    this.port = null;
    this.current?.node.disconnected();
  }
}
```

Create `src/app/online/sharing/shareSessionStore.ts`:

```ts
/** The share session this Atlas is in (hosting or joined, with a checked table), for the Shared with me dialog. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ShareNode } from './transport/ShareNode';

export interface SessionPerson {
  personId: string;
  name: string;
}

export interface ShareSession {
  role: 'gm' | 'player';
  tableId: string;
  self: string;
  node: ShareNode;
}

export interface PushRequest {
  from: string;
  item: string;
  kind: 'note' | 'map';
  title: string;
  at: number;
}

export interface ShareSessionState {
  session: ShareSession | null;
  /** Everyone else in the session who takes part in sharing, by the names in this Atlas's people list. */
  people: SessionPerson[];
  pushes: PushRequest[];
}

export const shareSessionStore: StoreApi<ShareSessionState> = createStore<ShareSessionState>(() => ({ session: null, people: [], pushes: [] }));

/** A push request: one per sender and item; a repeated one only moves to the top. */
export function addPush(push: PushRequest): void {
  const others = shareSessionStore.getState().pushes.filter((known) => known.from !== push.from || known.item !== push.item);
  shareSessionStore.setState({ pushes: [push, ...others].slice(0, 50) });
}

export function dismissPush(from: string, item: string): void {
  shareSessionStore.setState({ pushes: shareSessionStore.getState().pushes.filter((push) => push.from !== from || push.item !== item) });
}
```

- [ ] **Step 9: Wire hosting and joining**

In `src/app/online/obsidian/OnlineJoinService.ts`:

```ts
import type { PlayerShareHandler } from '../PlayerSession';
```

Add the field `private shareHandler: PlayerShareHandler | null = null;` and the method:

```ts
  /** Sharing's handler for the assets channel of every join from now on (`registerSharing`). */
  useShare(handler: PlayerShareHandler | null): void {
    this.shareHandler = handler;
  }
```

In `startSession`, pass `...(this.shareHandler ? { share: this.shareHandler } : {}),` to `createJoinSession`.

In `src/app/online/OnlineSessionService.ts`:

```ts
/** Sharing joins a hosted session that has a table; `started` returns what stops it. */
export interface HostedSharingHooks {
  started(context: { session: GmSession; table: TableIdentity }): () => void;
}
```

Add the fields `private sharingHooks: HostedSharingHooks | null = null;` and `private stopSharing: (() => void) | null = null;`, and the method:

```ts
  useSharingHooks(hooks: HostedSharingHooks | null): void {
    this.sharingHooks = hooks;
  }
```

In `host`, inside the `try` after `laserRelay.start();`:

```ts
      if (table && this.sharingHooks) this.stopSharing = this.sharingHooks.started({ session, table });
```

In `teardown`, first thing: `this.stopSharing?.(); this.stopSharing = null;`.

Extend `src/app/online/sharing/registerSharing.ts`. `SharingServices` gains `sessions: OnlineSessionService`. Add after the catalogue is created:

```ts
  const nameOf = (tableId: string, personId: string, fallback: string): string => people.get(tableId, personId)?.name ?? fallback;
  const onPush = (from: string, push: PushRequestBody): void => addPush({ from, ...push, at: Date.now() });
  const reset = (): void => shareSessionStore.setState({ session: null, people: [], pushes: [] });

  services.sessions.useSharingHooks({
    started: ({ session, table }) => {
      const host = new GmShareHost({ session, tableId: table.id, catalogue, onPush });
      host.start();
      const present = (): void => shareSessionStore.setState({
        people: host.people().map((person) => ({ personId: person.personId, name: nameOf(table.id, person.personId, person.name) })),
      });
      shareSessionStore.setState({ session: { role: 'gm', tableId: table.id, self: GM_PERSON_ID, node: host.node }, pushes: [] });
      present();
      const stopPresent = onlineSessionStore.subscribe(present);
      return () => {
        stopPresent();
        host.stop();
        reset();
      };
    },
  });
  plugin.register(() => services.sessions.useSharingHooks(null));

  const link = new PlayerShareLink({ catalogue, onPush });
  joins.useShare(link);
  plugin.register(() => joins.useShare(null));
  const presentForPlayer = (): void => {
    const identity = joins.identity;
    if (!identity) return;
    const others = (joinedSessionStore.getState().session?.players ?? [])
      .filter((player) => player.personId && player.personId !== identity.personId)
      .map((player) => ({ personId: player.personId!, name: nameOf(identity.tableId, player.personId!, player.name) }));
    shareSessionStore.setState({ people: [{ personId: GM_PERSON_ID, name: nameOf(identity.tableId, GM_PERSON_ID, identity.gmName) }, ...others] });
  };
  plugin.register(joins.onIdentity((identity) => {
    if (!identity) {
      link.deactivate();
      reset();
      return;
    }
    const node = link.activate(identity);
    shareSessionStore.setState({ session: { role: 'player', tableId: identity.tableId, self: identity.personId, node }, pushes: [] });
    presentForPlayer();
  }));
  plugin.register(joinedSessionStore.subscribe(presentForPlayer));
```

Imports: `GmShareHost`, `PlayerShareLink`, `PushRequestBody`, `shareSessionStore`, `addPush`, `onlineSessionStore`, `GM_PERSON_ID`, `OnlineSessionService` (type). In `main.ts`, pass `sessions: onlineSessions` to `registerSharing`.

- [ ] **Step 10: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing tests/unit/online/assetServer.test.ts tests/unit/online/playerSessionAssets.test.ts tests/unit/online/assetStreamingEndToEnd.test.ts`
Expected: PASS.

- [ ] **Step 11: The full check and the web page build**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:online`
Expected: no errors; all tests pass; the page builds. It imports `PlayerSession` (now with an optional `share`) and `assetProtocol`, and must not import any `sharing/` module: `grep -r "sharing/" dist-online/*.js` finds nothing.

- [ ] **Step 12: Commit**

```bash
git add src/app/online/sharing/transport src/app/online/sharing/shareSessionStore.ts src/app/online/sharing/registerSharing.ts \
  src/app/online/assets/assetProtocol.ts src/app/online/assets/AssetServer.ts src/app/online/PlayerSession.ts \
  src/app/online/obsidian/OnlineJoinService.ts src/app/online/OnlineSessionService.ts main.ts tests/unit/online/sharing
git commit -m "feat(online): share items over the assets channel, relayed by the GM without storing"
```

---
### Task 5: Shared with me: browsing, pulling and push requests

The receiver's side.
- The **Shared with me** dialog lists, per person in the session, what they share with this Atlas, each item marked `New`, `Updated` or `Up to date`.
- **Pull** writes a note to `Shared/<person>/` under a sanitised name. The path is checked to stay inside that folder, and the pulled text is kept as the merge base.
- A map goes into the **Shared with me** collection:
  - its images are written under their fingerprints (each checked against it);
  - every path in the received map that the receiver did not write is cleared;
  - the map file and its scene record are written under `runExclusive`;
  - its linked notes land only when the receiver ticks them.
- **Ask to pull…** sends a push request to someone in the session, and they see **Pull** and **Not now**.

Nothing is written except inside a pull the receiver started. Until Task 6, a note changed on both sides is saved as a second copy (**Keep both**).

**Files:**
- Create: `src/app/online/sharing/receive/safePaths.ts`
- Create: `src/app/online/sharing/receive/PulledItems.ts`
- Create: `src/app/online/sharing/receive/notePull.ts`
- Create: `src/app/online/sharing/receive/receivedMap.ts`
- Create: `src/app/online/sharing/receive/mapPull.ts`
- Create: `src/app/online/sharing/receive/SharedWithMe.ts`
- Create: `src/app/online/sharing/receive/shareErrors.ts`
- Create: `src/app/online/sharing/receive/ui/SharedWithMeList.tsx`, `src/app/online/sharing/receive/ui/SharedWithMeModal.tsx`, `src/app/online/sharing/receive/ui/pushPrompt.ts`, `src/app/online/sharing/receive/ui/shared-with-me.scss`
- Modify: `src/app/online/sharing/registerSharing.ts` (command, push prompts, renames)
- Modify: `src/app/react/components/online/OnlinePanel.tsx`, `src/app/react/components/online/OnlineSceneBar.tsx` (a **Shared with me…** button)
- Modify: `styles/main.scss`, `main.ts`
- Test: `tests/unit/online/sharing/safePaths.test.ts`
- Test: `tests/unit/online/sharing/notePull.test.ts`
- Test: `tests/unit/online/sharing/mapPull.test.ts`
- Test: `tests/unit/online/sharing/sharedWithMe.test.ts`

**Interfaces:**
- Consumes:
  - Task 4: `ShareNode` (`requestList`, `pull`), `ShareError`, `PulledItem`, `shareSessionStore`, `ShareSession`, `SessionPerson`, `PushRequest`, `dismissPush`.
  - Task 3: `CatalogueItem`, `parseMapPayload`, `MapPayload`, `IMAGE_REF_PREFIX`, `NOTE_REF_PREFIX`.
  - Task 2: `JsonDataFile`, `SHARING_DATA_DIR`, `readText`, `writeText`.
  - 6a: `playerSceneToAtlasState`.
  - Existing: `migrateMapFile`, `ATLAS_SCHEMA`, `ATLAS_VERSION`, `mapStrings`, `ensureFolder`, `collectionFolderPath`, `collectionNameProblem`, `AssetService`, `chooseAction`.
- Produces:
  - From `safePaths.ts`: `SHARED_ROOT = 'Shared'`, `safeFileName(name, fallback?)`, `isInside(path, folder)`, `freePath(folder, stem, extension, taken)`, `sharedNoteFolder(person)`.
  - From `PulledItems.ts`:
    - `PulledRecord { key; tableId; from; item; kind; path; version; baseKey; pulledAt; sceneId?; choice?; conflictDefault?; silent? }`
    - `class PulledItems` with `forApp`, `create`, `ready`, `get(tableId, from, item)`, `byPath`, `list`, `put`, `update(key, changes)`, `readBase`, `writeBase`, `renamed` and `subscribe`
  - From `notePull.ts`:
    - `NoteUpdatePolicy { resolve(context): Promise<UpdateResult> }`, `UpdateContext`, `UpdateResult`
    - `keepBothPolicy`, `pullNote(deps, input): Promise<PullOutcome>`, `PullOutcome`, `NotePullDeps`
  - From `receivedMap.ts`: `receivedMapState(payload, context): Record<string, unknown>`, `clearForeignPaths`.
  - From `mapPull.ts`: `SHARED_COLLECTION = 'Shared with me'`, `pullMap(deps, input): Promise<PullOutcome>`, `MapPullDeps`.
  - `class SharedWithMe(deps)` with `refresh(personId)`, `stateOf(personId, item)`, `pull(personId, item, linked?)` and `pullPushed(push)`.
  - `ItemState = 'new' | 'updated' | 'current'`; `shareErrorText(error)`; `openSharedWithMeModal(app)`; `SHARED_WITH_ME_LABEL`.

- [ ] **Step 1: Write the failing path and note tests**

Create `tests/unit/online/sharing/safePaths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { freePath, isInside, safeFileName, sharedNoteFolder } from '../../../../src/app/online/sharing/receive/safePaths';

describe('safe paths for shared items', () => {
  it('keep every title a plain file name', () => {
    expect(safeFileName('Goblin cave')).toBe('Goblin cave');
    expect(safeFileName('../../.obsidian/plugins/x')).toBe('obsidian plugins x');
    expect(safeFileName('a/b\\c:d*e?"f<g>h|i#j^k[l]')).toBe('a b c d e f g h i j k l');
    expect(safeFileName('..')).toBe('Untitled');
    expect(safeFileName('   ')).toBe('Untitled');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('lpt1')).toBe('lpt1_');
    expect(safeFileName('tab\tand\u0000nul')).toBe('tab and nul');
    expect(safeFileName('x'.repeat(300))).toHaveLength(100);
    expect(safeFileName('name. ')).toBe('name');
  });

  it('put each person in their own folder under Shared', () => {
    expect(sharedNoteFolder('Ana')).toBe('Shared/Ana');
    expect(sharedNoteFolder('../Ana')).toBe('Shared/Ana');
    expect(sharedNoteFolder('')).toBe('Shared/Someone');
  });

  it('know what is inside a folder and find free names', () => {
    expect(isInside('Shared/Ana/Cave.md', 'Shared/Ana')).toBe(true);
    expect(isInside('Shared/Ana/../Ben/Cave.md', 'Shared/Ana')).toBe(false);
    expect(isInside('Shared/Anabel/Cave.md', 'Shared/Ana')).toBe(false);
    expect(isInside('Shared/Ana', 'Shared/Ana')).toBe(false);
    const taken = new Set(['Shared/Ana/Cave.md', 'Shared/Ana/Cave (2).md']);
    expect(freePath('Shared/Ana', 'Cave', 'md', (path) => taken.has(path))).toBe('Shared/Ana/Cave (3).md');
  });
});
```

Create `tests/unit/online/sharing/notePull.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CatalogueItem } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { keepBothPolicy, pullNote, type NotePullDeps, type NoteUpdatePolicy } from '../../../../src/app/online/sharing/receive/notePull';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { TABLE_ID } from './sharingFixtures';

const item = (title: string, version: string, id = 'i'.repeat(22)): CatalogueItem => ({ item: id, kind: 'note', title, version, size: 1 });
const V1 = '1'.repeat(43);
const V2 = '2'.repeat(43);

async function setup(policy: NoteUpdatePolicy = keepBothPolicy) {
  const { app, files } = createInMemoryApp();
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  const deps: NotePullDeps = { app, pulled, policy };
  const pull = (catalogueItem: CatalogueItem, text: string, personName = 'Ana') =>
    pullNote(deps, { tableId: TABLE_ID, from: 'ana', personName, item: catalogueItem, text });
  return { app, files, pulled, pull };
}

describe('pulling a note', () => {
  it('writes the first pull to Shared/<person>/ and keeps the text as the base', async () => {
    const { files, pulled, pull } = await setup();
    expect(await pull(item('Goblin cave', V1), 'The cave.')).toEqual({ kind: 'created', path: 'Shared/Ana/Goblin cave.md' });
    expect(files.get('Shared/Ana/Goblin cave.md')).toBe('The cave.');
    const record = pulled.get(TABLE_ID, 'ana', 'i'.repeat(22))!;
    expect(record).toMatchObject({ path: 'Shared/Ana/Goblin cave.md', version: V1, kind: 'note' });
    expect(await pulled.readBase(record)).toBe('The cave.');
  });

  it('a share can never write outside its folder, and two items never share a file', async () => {
    const { files, pull } = await setup();
    expect((await pull(item('../../.obsidian/plugins/evil', V1), 'x', '../../root')).path).toBe('Shared/root/obsidian plugins evil.md');
    expect((await pull(item('Cave', V1, 'a'.repeat(22)), 'one')).path).toBe('Shared/Ana/Cave.md');
    expect((await pull(item('Cave', V1, 'b'.repeat(22)), 'two')).path).toBe('Shared/Ana/Cave (2).md');
    // Everything in the vault is under Shared/; the base texts live in Atlas's sharing data.
    expect([...files.keys()].filter((path) => !path.startsWith('atlas-vtt/.atlas-data/')).every((path) => path.startsWith('Shared/'))).toBe(true);
  });

  it('updates a note the receiver left alone, and leaves an up-to-date one', async () => {
    const { files, pull } = await setup();
    await pull(item('Cave', V1), 'one');
    expect(await pull(item('Cave', V1), 'one')).toMatchObject({ kind: 'unchanged' });
    expect(await pull(item('Cave', V2), 'two')).toMatchObject({ kind: 'updated' });
    expect(files.get('Shared/Ana/Cave.md')).toBe('two');
  });

  it('keeps the receiver’s edits when only they changed, and asks when both did', async () => {
    const policy = { resolve: vi.fn(keepBothPolicy.resolve) };
    const { files, pull } = await setup(policy);
    await pull(item('Cave', V1), 'one');
    files.set('Shared/Ana/Cave.md', 'mine');
    expect(await pull(item('Cave', V1), 'one')).toMatchObject({ kind: 'unchanged' });
    expect(files.get('Shared/Ana/Cave.md')).toBe('mine');
    expect(await pull(item('Cave', V2), 'theirs')).toEqual({ kind: 'both', path: 'Shared/Ana/Cave (from Ana).md' });
    expect(policy.resolve).toHaveBeenCalledWith(expect.objectContaining({ base: 'one', mine: 'mine', theirs: 'theirs', title: 'Cave', personName: 'Ana' }));
    expect(files.get('Shared/Ana/Cave.md')).toBe('mine');
    expect(files.get('Shared/Ana/Cave (from Ana).md')).toBe('theirs');
  });

  it('writes a new copy when the pulled note was deleted', async () => {
    const { files, pull } = await setup();
    await pull(item('Cave', V1), 'one');
    files.delete('Shared/Ana/Cave.md');
    expect(await pull(item('Cave', V2), 'two')).toEqual({ kind: 'created', path: 'Shared/Ana/Cave.md' });
  });
});
```

- [ ] **Step 2: Write the failing map and dialog-service tests**

Create `tests/unit/online/sharing/mapPull.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { PulledItem } from '../../../../src/app/online/sharing/transport/ShareNode';
import type { MapPayload } from '../../../../src/app/online/sharing/model/mapPayload';
import { pullMap, SHARED_COLLECTION, type MapPullDeps } from '../../../../src/app/online/sharing/receive/mapPull';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { fingerprintOf } from '../assetFixtures';
import { TABLE_ID } from './sharingFixtures';

const MAP_IMAGE = fingerprintOf('map-bytes');
const NOTE_ITEM = 'n'.repeat(22);
const OTHER_NOTE = 'o'.repeat(22);

const playerSafe: MapPayload = {
  format: 'atlas-share-map-v1', mode: 'player-safe', name: 'Inn',
  scene: {
    sceneId: 'shared-map', map: { asset: MAP_IMAGE, width: 700, height: 700, cellSize: 70 }, grid: null,
    tokens: {}, fog: {}, texts: {}, drawings: {}, widgets: [], initiative: null,
    measurement: { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', snapToGrid: true, rangeBands: [] },
  } as never,
  pins: [{ x: 1, y: 1, note: NOTE_ITEM }, { x: 2, y: 2, note: OTHER_NOTE }],
  tokenNotes: {}, notes: [NOTE_ITEM, OTHER_NOTE], images: [MAP_IMAGE],
};

async function setup() {
  const { app, files } = createInMemoryApp({ files: { 'Private/secret.md': 'mine', 'atlas-vtt/assets/mine.png': 'png' } });
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  const exclusive = vi.fn(async <T>(task: () => Promise<T>): Promise<T> => task());
  const assets = {
    runExclusive: exclusive,
    addAsset: vi.fn(async (asset: object) => ({ ...asset, id: 'scene-1' })),
    getCollections: vi.fn(async () => [] as Array<{ id: string; name: string }>),
    createCollection: vi.fn(async (name: string) => ({ id: name, name })),
  };
  const images = vi.fn(async (fingerprint: string): Promise<PulledItem> => ({
    kind: 'image', version: fingerprint, mime: 'image/png', bytes: new TextEncoder().encode('map-bytes').buffer,
  }));
  const deps = (notes: Record<string, string>): MapPullDeps => ({
    app, assets: assets as never, pulled, pullImage: images, notes: new Map(Object.entries(notes)), confirmUpdate: async () => 'theirs',
  });
  return { app, files, pulled, assets, exclusive, images, deps };
}

const input = (payload: MapPayload) => ({
  tableId: TABLE_ID, from: 'ana', personName: 'Ana',
  item: { item: 'm'.repeat(22), kind: 'map' as const, title: 'Inn', version: 'V'.repeat(43), size: 1 }, payload,
});

describe('pulling a map', () => {
  it('writes its images by fingerprint and the map with its scene record in the Shared with me collection', async () => {
    const { files, assets, exclusive, deps } = await setup();
    const outcome = await pullMap(deps({ [NOTE_ITEM]: 'Shared/Ana/Inn.md' }), input(playerSafe));
    const mapPath = `atlas-vtt/collections/${SHARED_COLLECTION}/scenes/Ana/Inn.atlasmap`;
    expect(outcome).toEqual({ kind: 'created', path: mapPath });
    expect(assets.createCollection).toHaveBeenCalledWith(SHARED_COLLECTION);
    expect(files.get(`atlas-vtt/collections/${SHARED_COLLECTION}/files/Ana/${MAP_IMAGE}.png`)).toBe('map-bytes');
    expect(exclusive).toHaveBeenCalledTimes(1);
    expect(assets.addAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene', name: 'Inn', collection: SHARED_COLLECTION, data: { mapPath } }));
    const state = JSON.parse(files.get(mapPath)!).state;
    expect(state.background).toBe(`atlas-vtt/collections/${SHARED_COLLECTION}/files/Ana/${MAP_IMAGE}.png`);
    expect(Object.values(state.objects.pins).map((pin) => (pin as { notePath: string }).notePath)).toEqual(['Shared/Ana/Inn.md']);
  });

  it('linked notes only when ticked: a pin whose note was not pulled is dropped', async () => {
    const { files, deps } = await setup();
    await pullMap(deps({}), input(playerSafe));
    const state = JSON.parse(files.get(`atlas-vtt/collections/${SHARED_COLLECTION}/scenes/Ana/Inn.atlasmap`)!).state;
    expect(state.objects.pins).toEqual({});
  });

  it('clears paths it did not write from a full map', async () => {
    const { files, deps } = await setup();
    const full: MapPayload = {
      format: 'atlas-share-map-v1', mode: 'full', name: 'Inn',
      map: {
        background: `atlas-share-image:${MAP_IMAGE}`,
        objects: {
          tokens: { t: { id: 't', kind: 'character', x: 0, y: 0, imagePath: 'atlas-vtt/assets/mine.png', notePath: 'Private/secret.md', name: 'Private/secret.md' } },
          pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: `atlas-share-note:${NOTE_ITEM}` }, q: { id: 'q', kind: 'pin', x: 0, y: 0, notePath: 'Private/secret.md' } },
        },
        dmNotePath: 'Private/secret.md',
      },
      notes: [NOTE_ITEM], images: [MAP_IMAGE],
    };
    await pullMap(deps({ [NOTE_ITEM]: 'Shared/Ana/Inn.md' }), input(full));
    const text = files.get(`atlas-vtt/collections/${SHARED_COLLECTION}/scenes/Ana/Inn.atlasmap`)!;
    expect(text).not.toContain('Private/secret.md');
    expect(text).not.toContain('atlas-vtt/assets/mine.png');
    const state = JSON.parse(text).state;
    expect(Object.keys(state.objects.pins)).toEqual(['p']);
    expect(state.objects.tokens.t.imagePath).toBe('');
  });

  it('writes no image whose bytes are not the fingerprint it was asked for', async () => {
    const { files, images, deps } = await setup();
    images.mockImplementation(async (): Promise<PulledItem> => ({
      kind: 'image', version: fingerprintOf('other-bytes'), mime: 'image/png', bytes: new TextEncoder().encode('other-bytes').buffer,
    }));
    await pullMap(deps({}), input(playerSafe));
    expect([...files.keys()].some((path) => path.includes('/files/'))).toBe(false);
    const state = JSON.parse(files.get(`atlas-vtt/collections/${SHARED_COLLECTION}/scenes/Ana/Inn.atlasmap`)!).state;
    expect(state.background).toBeNull();
  });

  it('replaces the received map on a re-pull, never adding a second scene', async () => {
    const { assets, deps } = await setup();
    await pullMap(deps({}), input(playerSafe));
    expect(await pullMap(deps({}), { ...input(playerSafe), item: { ...input(playerSafe).item, version: 'W'.repeat(43) } }))
      .toMatchObject({ kind: 'updated' });
    expect(assets.addAsset).toHaveBeenCalledTimes(1);
  });
});
```

Create `tests/unit/online/sharing/sharedWithMe.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CatalogueItem } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { keepBothPolicy } from '../../../../src/app/online/sharing/receive/notePull';
import { SharedWithMe } from '../../../../src/app/online/sharing/receive/SharedWithMe';
import { addPush, shareSessionStore } from '../../../../src/app/online/sharing/shareSessionStore';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeHash } from '../assetFixtures';
import { TABLE_ID } from './sharingFixtures';

const cave = (version: string): CatalogueItem => ({ item: 'c'.repeat(22), kind: 'note', title: 'Cave', version, size: 4 });

async function setup() {
  const { app, files } = createInMemoryApp();
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  let version = await nodeHash(new TextEncoder().encode('cave').buffer);
  const node = {
    requestList: vi.fn(async () => [cave(version)]),
    pull: vi.fn(async () => ({ kind: 'note' as const, version, bytes: new TextEncoder().encode('cave').buffer })),
  };
  const service = new SharedWithMe({
    app, pulled, node, tableId: TABLE_ID, policy: keepBothPolicy, nameOf: () => 'Ana',
    assets: {} as never, confirmMapUpdate: async () => 'theirs',
  });
  return { files, service, node, bump: (next: string) => { version = next; } };
}

describe('Shared with me', () => {
  it('lists per person as new, then up to date after a pull, then updated', async () => {
    const { service, bump } = await setup();
    expect((await service.refresh('ana')).items.map((item) => item.state)).toEqual(['new']);
    await service.pull('ana', cave((await service.refresh('ana')).items[0]!.version));
    expect((await service.refresh('ana')).items.map((item) => item.state)).toEqual(['current']);
    bump('X'.repeat(43));
    expect((await service.refresh('ana')).items.map((item) => item.state)).toEqual(['updated']);
  });

  it('nothing lands without a pull: listing and a push write nothing', async () => {
    const { files, service } = await setup();
    const before = [...files.keys()];
    await service.refresh('ana');
    addPush({ from: 'ana', item: 'c'.repeat(22), kind: 'note', title: 'Cave', at: 1 });
    expect(shareSessionStore.getState().pushes).toHaveLength(1);
    expect([...files.keys()]).toEqual(before);
    shareSessionStore.setState({ pushes: [] });
  });

  it('pulls a pushed item when asked to, from the list of whoever pushed it', async () => {
    const { files, service, node } = await setup();
    await service.pullPushed({ from: 'ana', item: 'c'.repeat(22), kind: 'note', title: 'Cave', at: 1 });
    expect(node.requestList).toHaveBeenCalledWith('ana');
    expect(files.get('Shared/Ana/Cave.md')).toBe('cave');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing`
Expected: FAIL. The `receive/*` modules are not found.

- [ ] **Step 4: Implement paths and the pulled-items book**

Create `src/app/online/sharing/receive/safePaths.ts`:

```ts
/**
 * Where shared items may land. Every title becomes a plain file name: no separators, no
 * characters Windows or Obsidian refuse, no leading or trailing dots, no reserved device names,
 * at most 100 characters. Every path is checked to stay inside its folder after normalising.
 */
import { normalizePath } from 'obsidian';

export const SHARED_ROOT = 'Shared';

const INVALID = /[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_NAME = 100;

export function safeFileName(name: string, fallback = 'Untitled'): string {
  let cleaned = name.normalize('NFC').replace(INVALID, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  if (cleaned.length > MAX_NAME) cleaned = cleaned.slice(0, MAX_NAME).replace(/[.\s]+$/g, '');
  if (!cleaned) return fallback;
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** `Shared/<person>`, the folder of everything pulled from that person. */
export function sharedNoteFolder(personName: string): string {
  return `${SHARED_ROOT}/${safeFileName(personName, 'Someone')}`;
}

/** Whether `path` is strictly inside `folder`, with no `.` or `..` segment anywhere. */
export function isInside(path: string, folder: string): boolean {
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  const normalized = normalizePath(path);
  return normalized.startsWith(`${normalizePath(folder)}/`);
}

/** `folder/stem.extension`, or `stem (2)`, `stem (3)`, … while `taken` says the path is used. */
export function freePath(folder: string, stem: string, extension: string, taken: (path: string) => boolean): string {
  let path = `${folder}/${stem}.${extension}`;
  for (let n = 2; taken(path); n++) path = `${folder}/${stem} (${n}).${extension}`;
  return path;
}
```

Create `src/app/online/sharing/receive/PulledItems.ts`:

```ts
/**
 * What this Atlas pulled from whom, in `pulled.json`, with the last pulled text of each note
 * (the merge base) in `bases/<key>.md`. All in Atlas's sharing data, never in the vault.
 * Follows renames and deletions of the pulled files.
 */
import type { App } from 'obsidian';
import { randomId } from '../../ids';
import { JsonDataFile, readText, SHARING_DATA_DIR, writeText, type DataAdapterLike } from '../dataFile';

export const PULLED_FILE = `${SHARING_DATA_DIR}/pulled.json`;
const BASES_DIR = `${SHARING_DATA_DIR}/bases`;

export type UpdateChoice = 'both' | 'mine' | 'theirs' | 'resolve' | 'auto';
export type ConflictDefault = 'mine' | 'theirs' | 'both';

export interface PulledRecord {
  /** `<tableId>/<from>/<item>`. */
  key: string;
  tableId: string;
  from: string;
  item: string;
  kind: 'note' | 'map';
  /** The vault file it was written to. */
  path: string;
  /** The sender's version last pulled. */
  version: string;
  baseKey: string;
  pulledAt: number;
  sceneId?: string;
  /** "Remember for this note". */
  choice?: UpdateChoice;
  conflictDefault?: ConflictDefault;
  /** Auto merges are saved without showing them. */
  silent?: boolean;
}

interface PulledData {
  version: 1;
  records: PulledRecord[];
}

const CHOICES: readonly UpdateChoice[] = ['both', 'mine', 'theirs', 'resolve', 'auto'];
const DEFAULTS: readonly ConflictDefault[] = ['mine', 'theirs', 'both'];

function parseRecord(value: unknown): PulledRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const strings = ['key', 'tableId', 'from', 'item', 'path', 'version', 'baseKey'] as const;
  if (!strings.every((field) => typeof r[field] === 'string' && (r[field] as string).length > 0 && (r[field] as string).length <= 1024)) return null;
  if (r.kind !== 'note' && r.kind !== 'map') return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(r.baseKey as string)) return null;
  return {
    key: r.key as string, tableId: r.tableId as string, from: r.from as string, item: r.item as string, kind: r.kind,
    path: r.path as string, version: r.version as string, baseKey: r.baseKey as string,
    pulledAt: typeof r.pulledAt === 'number' ? r.pulledAt : 0,
    ...(typeof r.sceneId === 'string' ? { sceneId: r.sceneId } : {}),
    ...(CHOICES.includes(r.choice as UpdateChoice) ? { choice: r.choice as UpdateChoice } : {}),
    ...(DEFAULTS.includes(r.conflictDefault as ConflictDefault) ? { conflictDefault: r.conflictDefault as ConflictDefault } : {}),
    ...(r.silent === true ? { silent: true } : {}),
  };
}

function parsePulled(value: unknown): PulledData {
  const records = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).records : null;
  return { version: 1, records: Array.isArray(records) ? records.flatMap((entry) => parseRecord(entry) ?? []) : [] };
}

const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

export class PulledItems {
  private static readonly instances = new WeakMap<App, PulledItems>();
  static forApp(app: App): PulledItems {
    let items = this.instances.get(app);
    if (!items) {
      items = PulledItems.create(app.vault.adapter);
      this.instances.set(app, items);
    }
    return items;
  }

  static create(adapter: DataAdapterLike): PulledItems {
    return new PulledItems(adapter, new JsonDataFile(adapter, PULLED_FILE, parsePulled));
  }

  private records: PulledRecord[] = [];
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly adapter: DataAdapterLike, private readonly file: JsonDataFile<PulledData>) {}

  ready(): Promise<void> {
    this.loading ??= this.file.load().then((data) => { this.records = data.records; });
    return this.loading;
  }

  static keyOf(tableId: string, from: string, item: string): string {
    return `${tableId}/${from}/${item}`;
  }

  get(tableId: string, from: string, item: string): PulledRecord | null {
    const key = PulledItems.keyOf(tableId, from, item);
    return this.records.find((record) => record.key === key) ?? null;
  }

  byPath(path: string): PulledRecord | null {
    return this.records.find((record) => record.path === path) ?? null;
  }

  list(): readonly PulledRecord[] {
    return this.records;
  }

  /** A new record (or one replacing the record with the same key); a new base key when it has none. */
  put(record: Omit<PulledRecord, 'key' | 'baseKey'> & { baseKey?: string }): PulledRecord {
    const key = PulledItems.keyOf(record.tableId, record.from, record.item);
    const full: PulledRecord = { ...record, key, baseKey: record.baseKey ?? randomId() };
    this.records = [...this.records.filter((known) => known.key !== key), full];
    this.changed();
    return full;
  }

  update(key: string, changes: Partial<Omit<PulledRecord, 'key' | 'baseKey'>>): PulledRecord | null {
    const record = this.records.find((known) => known.key === key);
    if (!record) return null;
    const updated = { ...record, ...changes };
    this.records = this.records.map((known) => (known === record ? updated : known));
    this.changed();
    return updated;
  }

  readBase(record: PulledRecord): Promise<string | null> {
    return readText(this.adapter, `${BASES_DIR}/${record.baseKey}.md`);
  }

  writeBase(record: PulledRecord, text: string): Promise<void> {
    return writeText(this.adapter, `${BASES_DIR}/${record.baseKey}.md`, text);
  }

  renamed(from: string, to: string): void {
    let changed = false;
    this.records = this.records.map((record) => {
      if (!within(record.path, from)) return record;
      changed = true;
      return { ...record, path: to + record.path.slice(from.length) };
    });
    if (changed) this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed(): void {
    void this.file.save({ version: 1, records: this.records });
    this.listeners.forEach((listener) => listener());
  }
}
```

A pulled file that is deleted keeps its record: its base still serves a later pull, and `pullNote` writes a fresh copy when the record's file is gone. So there is no `deleted` method.

- [ ] **Step 5: Implement note pulls**

Create `src/app/online/sharing/receive/notePull.ts`:

```ts
/**
 * Writes a pulled note. A first pull goes to `Shared/<person>/<title>.md` (free name, checked
 * to stay inside). A later pull compares three texts: the base (last pulled), mine (the file
 * now) and theirs (just pulled). One-sided changes resolve themselves; when both changed, the
 * update policy decides (Task 6 adds the per-note choices and the merge page).
 */
import { normalizePath, TFile, type App } from 'obsidian';
import { ensureFolder } from '../../../plugin/vaultFolders';
import type { CatalogueItem } from '../model/SenderCatalogue';
import type { PulledItems, PulledRecord } from './PulledItems';
import { freePath, isInside, safeFileName, sharedNoteFolder } from './safePaths';

export interface UpdateContext {
  record: PulledRecord;
  title: string;
  personName: string;
  base: string;
  mine: string;
  theirs: string;
}

/** `write`: replace the note with `text`; `keep`: leave it; `both`: save theirs beside it; `cancel`: change nothing. */
export type UpdateResult = { kind: 'write'; text: string } | { kind: 'keep' } | { kind: 'both' } | { kind: 'cancel' };

export interface NoteUpdatePolicy {
  resolve(context: UpdateContext): Promise<UpdateResult>;
}

export const keepBothPolicy: NoteUpdatePolicy = { resolve: async () => ({ kind: 'both' }) };

export type PullOutcome =
  | { kind: 'created' | 'updated' | 'unchanged' | 'kept' | 'both'; path: string }
  | { kind: 'cancelled' };

export interface NotePullDeps {
  app: App;
  pulled: PulledItems;
  policy: NoteUpdatePolicy;
  /** Replaced text goes to the note's merge history (Task 6). */
  replaced?(record: PulledRecord, before: string, after: string): Promise<void>;
  now?: () => number;
}

export interface NotePullInput {
  tableId: string;
  from: string;
  personName: string;
  item: CatalogueItem;
  text: string;
}

const fileAt = (app: App, path: string): TFile | null => {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  return file instanceof TFile ? file : null;
};

const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

async function create(app: App, folder: string, stem: string, text: string): Promise<string> {
  const path = freePath(folder, stem, 'md', (candidate) => app.vault.getAbstractFileByPath(candidate) !== null);
  if (!isInside(path, folder)) throw new Error('A shared note would land outside its folder');
  await ensureFolder(app, folder);
  await app.vault.create(path, text);
  return path;
}

export async function pullNote(deps: NotePullDeps, input: NotePullInput): Promise<PullOutcome> {
  const { app, pulled } = deps;
  const now = deps.now ?? Date.now;
  await pulled.ready();
  const known = pulled.get(input.tableId, input.from, input.item.item);
  const file = known ? fileAt(app, known.path) : null;
  const folder = sharedNoteFolder(input.personName);
  const stem = safeFileName(input.item.title);
  // Read at the end, so choices the update policy remembered meanwhile stay.
  const record = (path: string): PulledRecord => {
    const latest = pulled.get(input.tableId, input.from, input.item.item);
    const changes = { path, version: input.item.version, pulledAt: now() };
    return (latest ? pulled.update(latest.key, changes) : null)
      ?? pulled.put({ tableId: input.tableId, from: input.from, item: input.item.item, kind: 'note', ...changes });
  };
  if (!known || !file) {
    const path = await create(app, folder, stem, input.text);
    await pulled.writeBase(record(path), input.text);
    return { kind: 'created', path };
  }
  const mine = await app.vault.read(file);
  const base = (await pulled.readBase(known)) ?? mine;
  const theirs = input.text;
  const settle = async (kind: 'updated' | 'unchanged' | 'kept' | 'both', path = known.path): Promise<PullOutcome> => {
    await pulled.writeBase(record(known.path), theirs);
    return { kind, path };
  };
  if (theirs === base || theirs === mine) return settle('unchanged');
  if (mine === base) {
    await app.vault.process(file, () => theirs);
    return settle('updated');
  }
  const result = await deps.policy.resolve({ record: known, title: input.item.title, personName: input.personName, base, mine, theirs });
  switch (result.kind) {
    case 'cancel':
      return { kind: 'cancelled' };
    case 'keep':
      return settle('kept');
    case 'both':
      // Beside the note, in its person's folder, so it stays inside `Shared/<person>/`.
      return settle('both', await create(app, folderOf(known.path), safeFileName(`${input.item.title} (from ${input.personName})`), theirs));
    case 'write':
      await deps.replaced?.(known, mine, result.text);
      await app.vault.process(file, () => result.text);
      return settle('updated');
  }
}
```

- [ ] **Step 6: Implement map pulls**

Create `src/app/online/sharing/receive/receivedMap.ts`:

```ts
/**
 * A received map payload as an Atlas map file, pointing only at files the receiver wrote: the
 * images it saved and the notes it pulled in this pull. Every other path is cleared: the
 * fields that hold paths are reset unless allowed, and any other string naming an existing
 * file of the receiver's vault is emptied, so a crafted map can never point at (and later
 * re-share) the receiver's own files. Pins whose note is gone are dropped.
 */
import { ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile, type MapFile } from '../../../services/MapPersistence';
import { mapStrings } from '../../../utils/mapStrings';
import { playerSceneToAtlasState } from '../../obsidian/playerSceneToAtlasState';
import { setOwn } from '../../scene/sceneDiff';
import { IMAGE_REF_PREFIX, NOTE_REF_PREFIX, type MapPayload } from '../model/mapPayload';

export interface ReceivedMapContext {
  /** Fingerprint → the vault path the receiver saved that image to. */
  images: ReadonlyMap<string, string>;
  /** Item id → the vault path the receiver pulled that note to, in this pull. */
  notes: ReadonlyMap<string, string>;
  /** Whether a string is a path of the receiver's vault. */
  isFile(path: string): boolean;
}

const FULL_EXTRAS = ['widgetSettings', 'widgetValues', 'initiative', 'initiativeTrackerOpen', 'tokenSettings'] as const;

function fromPlayerSafe(payload: Extract<MapPayload, { mode: 'player-safe' }>, context: ReceivedMapContext): Record<string, unknown> {
  const image = (id: string | null): string | null => (id ? context.images.get(id) ?? null : null);
  const parts = playerSceneToAtlasState(payload.scene, { background: image, token: image });
  const tokens = { ...parts.state.objects.tokens };
  for (const [id, note] of Object.entries(payload.tokenNotes)) {
    const path = context.notes.get(note);
    const token = tokens[id];
    if (path && token) setOwn(tokens, id, { ...token, notePath: path });
  }
  const pins: MapFile['objects']['pins'] = {};
  payload.pins.forEach((pin, index) => {
    const notePath = context.notes.get(pin.note);
    if (!notePath) return;
    const id = `shared-pin-${index}`;
    setOwn(pins, id, { id, kind: 'pin', x: pin.x, y: pin.y, notePath, ...(pin.icon ? { icon: pin.icon } : {}), ...(pin.label ? { label: pin.label } : {}), ...(pin.hex ? { hex: true } : {}) });
  });
  const { objects, ...rest } = parts.state;
  return { ...rest, objects: { tokens, fog: objects.fog, pins, texts: objects.texts, drawings: objects.drawings, walls: {}, lights: {} } };
}

function fromFull(payload: Extract<MapPayload, { mode: 'full' }>, context: ReceivedMapContext): Record<string, unknown> {
  const resolved = mapStrings(payload.map, (text) => {
    if (text.startsWith(IMAGE_REF_PREFIX)) return context.images.get(text.slice(IMAGE_REF_PREFIX.length)) ?? '';
    if (text.startsWith(NOTE_REF_PREFIX)) return context.notes.get(text.slice(NOTE_REF_PREFIX.length)) ?? '';
    return text;
  });
  const map = migrateMapFile(resolved);
  const extras = Object.fromEntries(FULL_EXTRAS.flatMap((key) => (resolved[key] === undefined ? [] : [[key, resolved[key]]])));
  return { background: map.background, grid: map.grid, objects: map.objects, camera: map.camera, ...extras };
}

/** Resets path fields not allowed, empties other strings that name receiver files, drops pins without a note. */
export function clearForeignPaths(state: Record<string, unknown>, allowed: ReadonlySet<string>, isFile: (path: string) => boolean): Record<string, unknown> {
  const swept = mapStrings(state, (text) => (allowed.has(text) || !isFile(text) ? text : ''));
  const map = migrateMapFile(swept);
  const keep = (path: string | undefined): string => (path && allowed.has(path) ? path : '');
  const tokens = Object.fromEntries(Object.entries(map.objects.tokens).map(([id, token]) => {
    const cleaned: Record<string, unknown> = { ...token, imagePath: keep(token.imagePath) };
    if ('notePath' in token) cleaned.notePath = keep(token.notePath) || undefined;
    if ('statblockPath' in token) cleaned.statblockPath = keep(token.statblockPath) || undefined;
    return [id, cleaned];
  }));
  const pins = Object.fromEntries(Object.entries(map.objects.pins).filter(([, pin]) => allowed.has(pin.notePath)));
  return {
    ...swept,
    background: map.background && allowed.has(map.background) ? map.background : null,
    objects: { ...map.objects, tokens, pins },
  };
}

export function receivedMapState(payload: MapPayload, context: ReceivedMapContext): Record<string, unknown> {
  const body = payload.mode === 'player-safe' ? fromPlayerSafe(payload, context) : fromFull(payload, context);
  const allowed = new Set([...context.images.values(), ...context.notes.values()]);
  const cleared = clearForeignPaths(body, allowed, context.isFile);
  return { ...cleared, schema: ATLAS_SCHEMA, version: ATLAS_VERSION, name: payload.name, camera: cleared.camera ?? { x: 0, y: 0, scale: 1 } };
}
```

`JSON.stringify` drops `undefined` fields when the file is written, so a token whose note was cleared loses the key. `mapPath` and `dmNotePath` are never carried: the full payload's body names only the fields above.

Create `src/app/online/sharing/receive/mapPull.ts`:

```ts
/**
 * Writes a pulled map into the `Shared with me` collection: its images under their
 * fingerprints in `files/<person>/` (each checked against its fingerprint by the transfer),
 * then the map file and its scene record together under `runExclusive`, so the vault check
 * never adopts the map as a second scene. A re-pull replaces the received map; if the receiver
 * changed it since, they choose Keep both (a second scene) or Take theirs.
 */
import { normalizePath, TFile, type App } from 'obsidian';
import { ensureFolder } from '../../../plugin/vaultFolders';
import { collectionFolderPath, collectionNameProblem } from '../../../services/assetPaths';
import type { AssetService } from '../../../services/AssetService';
import { ATLAS_VERSION } from '../../../services/MapPersistence';
import type { AssetMime } from '../../assets/assetIds';
import type { MapPayload } from '../model/mapPayload';
import type { CatalogueItem } from '../model/SenderCatalogue';
import type { PulledItem } from '../transport/ShareNode';
import type { PullOutcome } from './notePull';
import type { PulledItems } from './PulledItems';
import { receivedMapState } from './receivedMap';
import { freePath, isInside, safeFileName } from './safePaths';

export const SHARED_COLLECTION = 'Shared with me';

const EXTENSION: Record<AssetMime, string> = {
  'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};

export interface MapPullDeps {
  app: App;
  assets: Pick<AssetService, 'runExclusive' | 'addAsset' | 'getCollections' | 'createCollection'>;
  pulled: PulledItems;
  /** Pulls one image of the map by fingerprint (checked by the transfer). */
  pullImage(fingerprint: string): Promise<PulledItem>;
  /** The map's linked notes pulled in this pull: item id → vault path. */
  notes: ReadonlyMap<string, string>;
  /** The received map changed here since the last pull. */
  confirmUpdate(title: string): Promise<'both' | 'theirs' | null>;
  now?: () => number;
}

export interface MapPullInput {
  tableId: string;
  from: string;
  personName: string;
  item: CatalogueItem;
  payload: MapPayload;
}

async function sharedCollectionId(assets: MapPullDeps['assets']): Promise<string> {
  const known = (await assets.getCollections()).find((collection) => collection.id === SHARED_COLLECTION || collection.name === SHARED_COLLECTION);
  if (known) return known.id;
  const problem = collectionNameProblem(SHARED_COLLECTION);
  if (problem) throw new Error(problem);
  return (await assets.createCollection(SHARED_COLLECTION)).id;
}

const fileAt = (app: App, path: string): TFile | null => {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  return file instanceof TFile ? file : null;
};

export async function pullMap(deps: MapPullDeps, input: MapPullInput): Promise<PullOutcome> {
  const { app, assets, pulled } = deps;
  await pulled.ready();
  const collection = await sharedCollectionId(assets);
  const person = safeFileName(input.personName, 'Someone');
  const root = collectionFolderPath(collection);
  const imageFolder = `${root}/files/${person}`;
  const images = new Map<string, string>();
  for (const fingerprint of input.payload.images) {
    const existing = ['webp', 'png', 'jpg', 'gif', 'avif', 'svg'].map((ext) => `${imageFolder}/${fingerprint}.${ext}`).find((path) => fileAt(app, path));
    if (existing) {
      images.set(fingerprint, existing);
      continue;
    }
    const image = await deps.pullImage(fingerprint);
    // The transfer checked the bytes against the version the sender announced; it must also be the fingerprint asked for.
    if (!image.mime || image.version !== fingerprint) continue;
    const path = `${imageFolder}/${fingerprint}.${EXTENSION[image.mime]}`;
    if (!isInside(path, imageFolder)) continue;
    await ensureFolder(app, imageFolder);
    await app.vault.createBinary(path, image.bytes);
    images.set(fingerprint, path);
  }
  const state = receivedMapState(input.payload, { images, notes: deps.notes, isFile: (path) => path.length < 1024 && fileAt(app, path) !== null });
  const text = JSON.stringify({ state, version: ATLAS_VERSION }, null, 2);
  const known = pulled.get(input.tableId, input.from, input.item.item);
  const knownFile = known ? fileAt(app, known.path) : null;
  const now = deps.now ?? Date.now;
  if (known && knownFile) {
    const base = await pulled.readBase(known);
    const changedHere = base !== null && (await app.vault.read(knownFile)) !== base;
    const choice = changedHere ? await deps.confirmUpdate(input.item.title) : 'theirs';
    if (choice === null) return { kind: 'cancelled' };
    if (choice === 'theirs') {
      await app.vault.process(knownFile, () => text);
      const record = pulled.update(known.key, { version: input.item.version, pulledAt: now() }) ?? known;
      await pulled.writeBase(record, text);
      return { kind: 'updated', path: known.path };
    }
  }
  const sceneFolder = `${root}/scenes/${person}`;
  const path = freePath(sceneFolder, safeFileName(input.payload.name), 'atlasmap', (candidate) => app.vault.getAbstractFileByPath(candidate) !== null);
  if (!isInside(path, sceneFolder)) throw new Error('A shared map would land outside its folder');
  const scene = await assets.runExclusive(async () => {
    await ensureFolder(app, sceneFolder);
    await app.vault.create(path, text);
    return assets.addAsset({ type: 'scene', name: input.payload.name, collection, tags: [], data: { mapPath: path } });
  });
  // Keep both makes a second scene that is not followed by later pulls; only the first is.
  if (!known || !knownFile) {
    const record = pulled.put({
      tableId: input.tableId, from: input.from, item: input.item.item, kind: 'map', path, version: input.item.version, pulledAt: now(), sceneId: scene.id,
      ...(known ? { baseKey: known.baseKey } : {}),
    });
    await pulled.writeBase(record, text);
    return { kind: 'created', path };
  }
  return { kind: 'both', path };
}
```

`addAsset`'s parameter type is `NewAsset`. The literal object above matches the scene branch that `CreateSceneModal` passes.

- [ ] **Step 7: The service, errors and the dialog**

Create `src/app/online/sharing/receive/shareErrors.ts`:

```ts
import { ShareError } from '../transport/ShareNode';

const TEXT: Record<ShareError['reason'], string> = {
  'not-shared': 'That is not shared with you any more.',
  busy: 'They are sending a lot right now. Try again in a moment.',
  'too-large': 'That item is too large to share.',
  gone: 'They are not in the session any more.',
  failed: 'The item arrived damaged. Try again.',
  timeout: 'They did not answer. Try again.',
};

export function shareErrorText(error: unknown): string {
  return error instanceof ShareError ? TEXT[error.reason] : 'Could not pull that item.';
}
```

Create `src/app/online/sharing/receive/SharedWithMe.ts`:

```ts
/**
 * The receiver's side of one share session: lists what each person shares with this Atlas,
 * marks items new, updated or up to date against what was pulled, and pulls on request.
 * Listing writes nothing; only `pull` (and `pullPushed`, from a push the receiver accepted) do.
 */
import type { App } from 'obsidian';
import type { AssetService } from '../../../services/AssetService';
import { parseMapPayload } from '../model/mapPayload';
import type { CatalogueItem } from '../model/SenderCatalogue';
import type { PushRequest } from '../shareSessionStore';
import type { ShareNode } from '../transport/ShareNode';
import { pullMap, type MapPullDeps } from './mapPull';
import { pullNote, type NoteUpdatePolicy, type PullOutcome } from './notePull';
import type { PulledItems, PulledRecord } from './PulledItems';

export type ItemState = 'new' | 'updated' | 'current';

export interface ListedItem extends CatalogueItem {
  state: ItemState;
}

export interface PersonCatalogue {
  personId: string;
  items: ListedItem[];
}

export interface SharedWithMeDeps {
  app: App;
  pulled: PulledItems;
  node: Pick<ShareNode, 'requestList' | 'pull'>;
  tableId: string;
  policy: NoteUpdatePolicy;
  /** The name of a person in this Atlas's people list (their folder's name). */
  nameOf(personId: string): string;
  assets: MapPullDeps['assets'];
  confirmMapUpdate(title: string): Promise<'both' | 'theirs' | null>;
  replaced?(record: PulledRecord, before: string, after: string): Promise<void>;
}

export class SharedWithMe {
  private readonly lists = new Map<string, CatalogueItem[]>();

  constructor(private readonly deps: SharedWithMeDeps) {}

  async refresh(personId: string): Promise<PersonCatalogue> {
    await this.deps.pulled.ready();
    const items = await this.deps.node.requestList(personId);
    this.lists.set(personId, items);
    return { personId, items: items.map((item) => ({ ...item, state: this.stateOf(personId, item) })) };
  }

  stateOf(personId: string, item: CatalogueItem): ItemState {
    const record = this.deps.pulled.get(this.deps.tableId, personId, item.item);
    if (!record) return 'new';
    return record.version === item.version ? 'current' : 'updated';
  }

  /** Pulls one item; for a map, `linked` are the linked notes the receiver ticked (pulled first, so its pins point at them). */
  async pull(personId: string, item: CatalogueItem, linked: readonly string[] = []): Promise<PullOutcome> {
    const { node, tableId } = this.deps;
    const personName = this.deps.nameOf(personId);
    const pulled = await node.pull(personId, item.item, item.kind);
    if (item.kind === 'note') return this.writeNote(personId, personName, item, new TextDecoder().decode(pulled.bytes));
    const payload = parseMapPayload(JSON.parse(new TextDecoder().decode(pulled.bytes)) as unknown);
    if (!payload) throw new Error('The map arrived in a shape Atlas does not know.');
    const notes = new Map<string, string>();
    const catalogue = this.lists.get(personId) ?? [];
    for (const noteItem of linked.filter((id) => payload.notes.includes(id))) {
      const listed = catalogue.find((candidate) => candidate.item === noteItem && candidate.kind === 'note');
      if (!listed) continue;
      const note = await node.pull(personId, noteItem, 'note');
      const outcome = await this.writeNote(personId, personName, listed, new TextDecoder().decode(note.bytes));
      if ('path' in outcome) notes.set(noteItem, outcome.path);
    }
    return pullMap({
      app: this.deps.app, assets: this.deps.assets, pulled: this.deps.pulled, notes,
      pullImage: (fingerprint) => node.pull(personId, `${item.item}/${fingerprint}`, 'image'),
      confirmUpdate: this.deps.confirmMapUpdate,
    }, { tableId, from: personId, personName, item: { ...item, version: pulled.version }, payload });
  }

  /** A push the receiver chose to pull: looks the item up in that person's list, then pulls it. */
  async pullPushed(push: PushRequest): Promise<PullOutcome> {
    const listed = (await this.refresh(push.from)).items.find((item) => item.item === push.item);
    if (!listed) throw new Error('That item is not shared with you any more.');
    return this.pull(push.from, listed);
  }

  private writeNote(personId: string, personName: string, item: CatalogueItem, text: string): Promise<PullOutcome> {
    return pullNote(
      { app: this.deps.app, pulled: this.deps.pulled, policy: this.deps.policy, ...(this.deps.replaced ? { replaced: this.deps.replaced } : {}) },
      { tableId: this.deps.tableId, from: personId, personName, item, text },
    );
  }
}
```

Create `src/app/online/sharing/receive/ui/SharedWithMeList.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { SessionPerson, PushRequest } from '../../shareSessionStore';
import type { ItemState, ListedItem, SharedWithMe } from '../SharedWithMe';
import { shareErrorText } from '../shareErrors';

export const NOTHING_SHARED_TEXT = 'Nothing is shared with you yet.';
const STATE_TEXT: Record<ItemState, string> = { new: 'New', updated: 'Updated', current: 'Up to date' };

interface ListProps {
  service: Pick<SharedWithMe, 'refresh' | 'pull' | 'pullPushed'>;
  people: readonly SessionPerson[];
  pushes: readonly PushRequest[];
  dismissPush(push: PushRequest): void;
  onPulled(path: string): void;
}

function ItemRow({ item, onPull, titles }: { item: ListedItem; onPull: (linked: string[]) => Promise<void>; titles: ReadonlyMap<string, string> }): React.ReactElement {
  const [linked, setLinked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pull = (): void => {
    setBusy(true);
    setProblem(null);
    onPull(linked).catch((error: unknown) => setProblem(shareErrorText(error))).finally(() => setBusy(false));
  };
  return (
    <li className="atlas-shared__item">
      <div className="atlas-shared__row">
        <span className="atlas-shared__title">{item.title}</span>
        {item.kind === 'map' && <span className="atlas-shared__kind">{item.mode === 'full' ? 'Map, full' : 'Map'}</span>}
        <span className={`atlas-shared__state atlas-shared__state--${item.state}`}>{STATE_TEXT[item.state]}</span>
        <Button variant={item.state === 'current' ? 'outline' : 'default'} size="sm" disabled={busy} onClick={pull}>
          {item.state === 'updated' ? 'Pull update' : 'Pull'}
        </Button>
      </div>
      {item.kind === 'map' && (item.linked ?? []).length > 0 && (
        <ul className="atlas-shared__linked" aria-label={`Linked notes of ${item.title}`}>
          {(item.linked ?? []).map((id) => (
            <li key={id}>
              <label className="atlas-shared__check">
                <input type="checkbox" checked={linked.includes(id)} aria-label={`Also pull ${titles.get(id) ?? 'a linked note'}`}
                  onChange={() => setLinked(linked.includes(id) ? linked.filter((other) => other !== id) : [...linked, id])} />
                <span>{`Also pull ${titles.get(id) ?? 'a linked note'}`}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {problem && <span className="atlas-shared__problem" role="alert">{problem}</span>}
    </li>
  );
}

function PersonSection({ person, service, onPulled }: { person: SessionPerson; service: ListProps['service']; onPulled: (path: string) => void }): React.ReactElement {
  const [items, setItems] = useState<ListedItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback((): void => {
    service.refresh(person.personId).then((catalogue) => setItems(catalogue.items), (error: unknown) => setProblem(shareErrorText(error)));
  }, [person.personId, service]);
  useEffect(() => { load(); }, [load]);
  const titles = new Map((items ?? []).map((item) => [item.item, item.title]));
  return (
    <section className="atlas-shared__person" aria-label={person.name}>
      <h3 className="atlas-shared__heading">{person.name}</h3>
      {problem && <p className="atlas-shared__problem" role="alert">{problem}</p>}
      {items === null && !problem && <p className="atlas-shared__help">Asking {person.name}…</p>}
      {items?.length === 0 && <p className="atlas-shared__help">{NOTHING_SHARED_TEXT}</p>}
      <ul className="atlas-shared__items">
        {items?.map((item) => (
          <ItemRow key={item.item} item={item} titles={titles} onPull={async (linked) => {
            const outcome = await service.pull(person.personId, item, linked);
            if ('path' in outcome) onPulled(outcome.path);
            load();
          }} />
        ))}
      </ul>
    </section>
  );
}

/** Push requests first, then everyone in the session with what they share. */
export function SharedWithMeList({ service, people, pushes, dismissPush, onPulled }: ListProps): React.ReactElement {
  const nameOf = (personId: string): string => people.find((person) => person.personId === personId)?.name ?? 'Someone';
  return (
    <div className="atlas-shared">
      {pushes.length > 0 && (
        <section className="atlas-shared__person" aria-label="Asked to pull">
          <h3 className="atlas-shared__heading">Asked to pull</h3>
          <ul className="atlas-shared__items">
            {pushes.map((push) => (
              <li key={`${push.from}/${push.item}`} className="atlas-shared__row">
                <span className="atlas-shared__title">{`${nameOf(push.from)} asks you to pull ${push.title}.`}</span>
                <Button variant="default" size="sm" onClick={() => {
                  dismissPush(push);
                  void service.pullPushed(push).then((outcome) => { if ('path' in outcome) onPulled(outcome.path); });
                }}>Pull</Button>
                <Button variant="outline" size="sm" onClick={() => dismissPush(push)}>Not now</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {people.length === 0 && <p className="atlas-shared__help">Nobody else in this session shares with Atlas in Obsidian.</p>}
      {people.map((person) => <PersonSection key={person.personId} person={person} service={service} onPulled={onPulled} />)}
    </div>
  );
}
```

Create `src/app/online/sharing/receive/ui/SharedWithMeModal.tsx`:

```tsx
import React from 'react';
import { Modal, Notice, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useStore } from 'zustand';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../../ui/nativeModal';
import { dismissPush, shareSessionStore } from '../../shareSessionStore';
import type { SharedWithMe } from '../SharedWithMe';
import { SharedWithMeList } from './SharedWithMeList';

export const SHARED_WITH_ME_LABEL = 'Shared with me';
export const NO_SHARE_SESSION_TEXT = 'Join or host an online session to see what people share with you.';

function Live({ service, onPulled }: { service: SharedWithMe; onPulled: (path: string) => void }): React.ReactElement {
  const people = useStore(shareSessionStore, (state) => state.people);
  const pushes = useStore(shareSessionStore, (state) => state.pushes);
  return <SharedWithMeList service={service} people={people} pushes={pushes} dismissPush={(push) => dismissPush(push.from, push.item)} onPulled={onPulled} />;
}

class SharedWithMeModal extends Modal {
  private root: Root | null = null;

  constructor(app: App, private readonly service: SharedWithMe) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-shared-modal');
  }

  onOpen(): void {
    this.setTitle(SHARED_WITH_ME_LABEL);
    this.root = createRoot(this.contentEl);
    this.root.render(<Live service={this.service} onPulled={(path) => new Notice(`Pulled into ${path}`)} />);
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}

/** Opens Shared with me for the current share session; outside one it says how to get one. */
export function openSharedWithMeModal(app: App, service: SharedWithMe | null): void {
  if (!service) {
    new Notice(NO_SHARE_SESSION_TEXT);
    return;
  }
  new SharedWithMeModal(app, service).open();
}
```

Create `src/app/online/sharing/receive/ui/pushPrompt.ts`:

```ts
import { Notice } from 'obsidian';
import type { PushRequest } from '../../shareSessionStore';

/** "Ana asks you to pull Goblin cave." with Pull and Not now, until answered. Names are text, never HTML. */
export function showPushPrompt(push: PushRequest, personName: string, answer: (pull: boolean) => void): { hide(): void } {
  const fragment = createFragment();
  const body = fragment.createDiv({ cls: 'atlas-online-request' });
  body.createDiv({ cls: 'atlas-online-request__text', text: `${personName} asks you to pull ${push.title}.` });
  const actions = body.createDiv({ cls: 'atlas-online-request__actions' });
  const notice = new Notice(fragment, 0);
  body.addEventListener('click', (event) => event.stopPropagation());
  const reply = (pull: boolean) => (event: MouseEvent): void => {
    event.stopPropagation();
    answer(pull);
    notice.hide();
  };
  actions.createEl('button', { cls: 'mod-cta', text: 'Pull' }).addEventListener('click', reply(true));
  actions.createEl('button', { text: 'Not now' }).addEventListener('click', reply(false));
  return { hide: () => notice.hide() };
}
```

Create `src/app/online/sharing/receive/ui/shared-with-me.scss`:

```scss
// The Shared with me dialog. Imported inside the `.atlas-vtt-plugin` scope of styles/main.scss.
@use '../../../../../../styles/tokens' as *;
@use '../../../../../../styles/mixins' as *;

.atlas-shared {
  @include atlas-flex-col($spacing-m);
}

.atlas-shared__person,
.atlas-shared__item {
  @include atlas-flex-col($spacing-s);
}

.atlas-shared__items,
.atlas-shared__linked {
  @include atlas-flex-col($spacing-s);
  margin: 0;
  padding: 0;
  list-style: none;
}

.atlas-shared__row,
.atlas-shared__check {
  @include atlas-flex-row($spacing-s);
}

.atlas-shared__title {
  flex: 1;
  min-width: 0;
}

.atlas-shared__heading {
  margin: 0;
  font-size: $font-ui-smaller;
  font-weight: $font-weight-semibold;
  color: var(--text-muted);
}

.atlas-shared__kind,
.atlas-shared__state {
  color: var(--text-muted);
  font-size: $font-ui-smaller;
}

.atlas-shared__state--new,
.atlas-shared__state--updated {
  color: var(--text-accent);
}

.atlas-shared__help {
  @include atlas-help-text;
  margin: 0;
}

.atlas-shared__problem {
  margin: 0;
  color: var(--text-error);
  font-size: $font-ui-smaller;
}
```

In `styles/main.scss`, add `@import '../src/app/online/sharing/receive/ui/shared-with-me.scss';` after the sharing import.

- [ ] **Step 8: Register Shared with me**

In `src/app/online/sharing/registerSharing.ts`, `SharingServices` gains `pulled: PulledItems`. Add:

```ts
  const { pulled } = services;
  void pulled.ready();
  const confirmMapUpdate = (title: string): Promise<'both' | 'theirs' | null> => chooseAction({
    title: `${title} changed here and was shared again`,
    message: ['Keep both saves the new version as a second scene. Take theirs replaces your copy.'],
    choices: [{ label: 'Keep both', value: 'both' as const }, { label: 'Take theirs', value: 'theirs' as const, style: 'warning' }],
  });
  let current: { node: unknown; service: SharedWithMe } | null = null;
  const sharedWithMe = (): SharedWithMe | null => {
    const session = shareSessionStore.getState().session;
    if (!session) return null;
    if (current?.node !== session.node) {
      current = {
        node: session.node,
        service: new SharedWithMe({
          app: plugin.app, pulled, node: session.node, tableId: session.tableId, policy: keepBothPolicy,
          nameOf: (personId) => shareSessionStore.getState().people.find((person) => person.personId === personId)?.name ?? 'Someone',
          assets: AssetService.getInstance(plugin.app), confirmMapUpdate,
        }),
      };
    }
    return current.service;
  };
  plugin.addCommand({ id: 'shared-with-me', name: 'Shared with me…', callback: () => openSharedWithMeModal(plugin.app, sharedWithMe()) });

  // A push shows a prompt; only Pull writes anything.
  const prompts = new Map<string, { hide(): void }>();
  plugin.register(shareSessionStore.subscribe((state) => {
    for (const push of state.pushes) {
      const key = `${push.from}/${push.item}`;
      if (prompts.has(key)) continue;
      const name = state.people.find((person) => person.personId === push.from)?.name ?? 'Someone';
      prompts.set(key, showPushPrompt(push, name, (pull) => {
        dismissPush(push.from, push.item);
        if (pull) void sharedWithMe()?.pullPushed(push).then((outcome) => { if ('path' in outcome) new Notice(`Pulled into ${outcome.path}`); }, (error: unknown) => new Notice(shareErrorText(error)));
      }));
    }
    for (const [key, prompt] of [...prompts]) {
      if (state.pushes.some((push) => `${push.from}/${push.item}` === key)) continue;
      prompt.hide();
      prompts.delete(key);
    }
  }));
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => pulled.renamed(oldPath, file.path)));
  openShared = (app) => openSharedWithMeModal(app, sharedWithMe());

  // Push requests: the sender asks someone in the session to pull an item; it only shows them a prompt.
  const pushItem = async (file: TFile): Promise<{ item: string; kind: 'note' | 'map' } | null> => {
    if (file.extension === 'md') return { item: items.idFor(file.path), kind: 'note' };
    const scene = (await AssetService.getInstance(plugin.app).getAssets(undefined, 'scene')).find((candidate) => candidate.data?.mapPath === file.path);
    const share = scene ? mapShareOf(scene) : null;
    return share ? { item: share.item, kind: 'map' } : null;
  };
  const askToPull = async (file: TFile): Promise<void> => {
    const { session, people: present } = shareSessionStore.getState();
    if (!session) {
      new Notice(NO_SHARE_SESSION_TEXT);
      return;
    }
    const item = await pushItem(file);
    if (!item) {
      new Notice('Share this map first, then ask someone to pull it.');
      return;
    }
    if (present.length === 0) {
      new Notice('Nobody else in this session shares with Atlas in Obsidian.');
      return;
    }
    const person = await chooseAction({
      title: `Ask to pull ${file.basename}`,
      message: ['They get a prompt with Pull and Not now. They can pull it only if it is shared with them.'],
      choices: present.map((candidate) => ({ label: candidate.name, value: candidate.personId })),
    });
    if (person) session.node.push(person, item.item, item.kind, file.basename);
  };
  plugin.addCommand({
    id: 'ask-to-pull', name: 'Ask to pull…',
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!shareable(file) || !shareSessionStore.getState().session) return false;
      if (!checking) void askToPull(file);
      return true;
    },
  });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (!shareable(file) || !shareSessionStore.getState().session) return;
    menu.addItem((item) => item.setTitle('Ask to pull…').setIcon('send').onClick(() => { void askToPull(file); }));
  }));
  plugin.register(() => { openShared = null; });
```

and at module level in the same file:

```ts
let openShared: ((app: App) => void) | null = null;

/** Opens Shared with me from a view's button (the online panel, the Online scene bar). */
export function openSharedFromView(app: App): void {
  openShared?.(app);
}
```

Imports:
- `Notice` and `type App`, `chooseAction` (`../../ui/confirmDialog`), `PulledItems`, `SharedWithMe`, `keepBothPolicy`;
- `openSharedWithMeModal`, `NO_SHARE_SESSION_TEXT`, `showPushPrompt`, `shareErrorText`, `dismissPush`, `mapShareOf`.

`shareable` and `items` are the ones Task 3 defined in this function. In `main.ts`, pass `pulled: PulledItems.forApp(this.app)`.

Add a **Shared with me…** entry where people are in a session. A command is not enough for a player in the Online scene tab, and the GM uses the online panel:
- In `OnlineSceneBar.tsx`, after the status texts, add `<Button variant="outline" size="sm" className="atlas-online-scene-bar__action" onClick={() => view?.app && openSharedFromView(view.app)}>Shared with me…</Button>`. It shows when `useStore(shareSessionStore, (state) => state.session !== null)` is true.
- In `OnlinePanel.tsx`'s `HostingView` footer, add the same button with `variant="outline"`, shown when `shareSessionStore` has a session.
- Both call `openSharedFromView(app)` from `registerSharing.ts`.

- [ ] **Step 9: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing`
Expected: PASS.

- [ ] **Step 10: The full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/app/online/sharing/receive src/app/online/sharing/registerSharing.ts \
  src/app/react/components/online/OnlinePanel.tsx src/app/react/components/online/OnlineSceneBar.tsx \
  styles/main.scss main.ts tests/unit/online/sharing
git commit -m "feat(online): Shared with me: pull notes and maps into your own vault"
```

---
### Task 6: Updates and conflicts: per-note choices, the merge page and history

When a re-pulled note changed on both sides, the receiver chooses:
- **Keep both**: theirs is saved as `<title> (from <person>)`.
- **Keep mine**: the file stays, and theirs becomes the base.
- **Take theirs**: mine goes to the history.
- **Resolve conflicts**: the merge page.
- **Auto merge**: one-sided changes are applied and conflicts take the note's default. The result shows on the merge page first, unless `Save auto merges without showing them` is on.

`Remember for this note` stores the choice.

The merge page shows each conflict side by side, with **Keep mine**, **Take theirs** and **Keep both**, and an editable result. One-sided changes are taken automatically.

Every replaced text goes to the note's merge history (20 entries), and **Undo last merge** restores it. All of this runs inside a pull the receiver started, never on its own.

**Files:**
- Create: `src/app/online/sharing/merge/diffLines.ts`
- Create: `src/app/online/sharing/merge/diff3.ts`
- Create: `src/app/online/sharing/merge/mergeResult.ts`
- Create: `src/app/online/sharing/merge/MergeHistory.ts`
- Create: `src/app/online/sharing/merge/noteUpdate.ts`
- Create: `src/app/online/sharing/merge/ui/UpdateChoiceForm.tsx`, `src/app/online/sharing/merge/ui/MergeView.tsx`, `src/app/online/sharing/merge/ui/mergeModals.tsx`, `src/app/online/sharing/merge/ui/merge.scss`
- Modify: `src/app/online/sharing/registerSharing.ts` (the policy, history, the undo command)
- Modify: `styles/main.scss`
- Test: `tests/unit/online/sharing/diff3.test.ts`
- Test: `tests/unit/online/sharing/noteUpdate.test.ts`
- Test: `tests/unit/online/sharing/mergeUi.test.tsx`

**Interfaces:**
- Consumes (Task 5): `NoteUpdatePolicy`, `UpdateContext`, `UpdateResult`, `pullNote`, `NotePullDeps.replaced`, `PulledItems` (`update`), `PulledRecord`, `UpdateChoice`, `ConflictDefault`; and `SharedWithMeDeps.policy` and `.replaced`.
- Produces:
  - `commonLines(a, b): Array<[number, number]> | null`.
  - From `diff3.ts`: `MergeChunk`, `diff3(base, mine, theirs): MergeChunk[]`, `splitLines(text)`.
  - From `mergeResult.ts`: `ConflictChoice`, `mergedText(chunks, choices, fallback)`, `conflictCount(chunks)`.
  - From `MergeHistory.ts`:
    - `MergeEntry { at; before; after }`
    - `class MergeHistory(adapter)` with `entries(record)`, `add(record, entry)` and `pop(record)`
    - `undoLastMerge(app, history, record, confirmChanged): Promise<boolean>`
  - From `noteUpdate.ts`: `AskResult`, `MergeRequest`, `MergeAnswer`, `createUpdatePolicy(deps): NoteUpdatePolicy`.
  - UI: `UpdateChoiceForm`, `MergeView`, `askUpdateChoice(app, context)`, `openMergePage(app, request)`.
  - Command `undo-shared-merge`: `Undo last merge`.

- [ ] **Step 1: Write the failing merge tests**

Create `tests/unit/online/sharing/diff3.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { commonLines } from '../../../../src/app/online/sharing/merge/diffLines';
import { diff3 } from '../../../../src/app/online/sharing/merge/diff3';
import { conflictCount, mergedText } from '../../../../src/app/online/sharing/merge/mergeResult';

describe('line diff', () => {
  it('finds a longest common subsequence', () => {
    expect(commonLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toEqual([[0, 0], [2, 2], [3, 3]]);
    expect(commonLines([], ['a'])).toEqual([]);
    expect(commonLines(['a', 'b'], ['a', 'b'])).toEqual([[0, 0], [1, 1]]);
    expect(commonLines(['x'], ['y'])).toEqual([]);
  });
});

describe('three-way merge', () => {
  const base = 'a\nb\nc\nd\ne';

  it('takes one-sided changes on both sides automatically', () => {
    const chunks = diff3(base, 'a\nB\nc\nd\ne', 'a\nb\nc\nD\ne');
    expect(conflictCount(chunks)).toBe(0);
    expect(mergedText(chunks, [], 'both')).toBe('a\nB\nc\nD\ne');
  });

  it('treats the same change on both sides as no conflict', () => {
    const chunks = diff3(base, 'a\nX\nc\nd\ne', 'a\nX\nc\nd\ne');
    expect(conflictCount(chunks)).toBe(0);
    expect(mergedText(chunks, [], 'both')).toBe('a\nX\nc\nd\ne');
  });

  it('offers keep mine, take theirs or keep both for a conflict', () => {
    const chunks = diff3(base, 'a\nmine\nc\nd\ne', 'a\ntheirs\nc\nd\ne');
    expect(conflictCount(chunks)).toBe(1);
    expect(chunks.find((chunk) => chunk.kind === 'conflict')).toEqual({ kind: 'conflict', base: ['b'], mine: ['mine'], theirs: ['theirs'] });
    expect(mergedText(chunks, ['mine'], 'both')).toBe('a\nmine\nc\nd\ne');
    expect(mergedText(chunks, ['theirs'], 'both')).toBe('a\ntheirs\nc\nd\ne');
    expect(mergedText(chunks, [], 'both')).toBe('a\nmine\ntheirs\nc\nd\ne');
  });

  it('keeps additions at either end and a trailing newline', () => {
    expect(mergedText(diff3('a\nb\n', 'top\na\nb\n', 'a\nb\nend\n'), [], 'both')).toBe('top\na\nb\nend\n');
    expect(mergedText(diff3('', 'mine', ''), [], 'both')).toBe('mine');
  });
});
```

Create `tests/unit/online/sharing/noteUpdate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MergeHistory, undoLastMerge } from '../../../../src/app/online/sharing/merge/MergeHistory';
import { createUpdatePolicy, type AskResult } from '../../../../src/app/online/sharing/merge/noteUpdate';
import type { CatalogueItem } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { pullNote } from '../../../../src/app/online/sharing/receive/notePull';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { TABLE_ID } from './sharingFixtures';

const PATH = 'Shared/Ana/Cave.md';
const item = (version: string): CatalogueItem => ({ item: 'c'.repeat(22), kind: 'note', title: 'Cave', version: version.repeat(43), size: 1 });

async function setup(answer: AskResult | null, mergeText: string | null = null) {
  const { app, files } = createInMemoryApp();
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  const history = new MergeHistory(app.vault.adapter);
  const ask = vi.fn(async () => answer);
  const merge = vi.fn(async () => (mergeText === null ? null : { text: mergeText, conflictDefault: 'theirs' as const }));
  const policy = createUpdatePolicy({ pulled, ask, merge });
  const deps = { app, pulled, policy, replaced: (record: Parameters<MergeHistory['add']>[0], before: string, after: string) => history.add(record, { at: 1, before, after }) };
  const pull = (version: string, text: string) => pullNote(deps, { tableId: TABLE_ID, from: 'ana', personName: 'Ana', item: item(version), text });
  await pull('1', 'a\nb\nc\nd\ne');
  files.set(PATH, 'a\nMINE\nc\nd\ne');
  return { app, files, pulled, history, ask, merge, pull };
}

describe('updating a note changed on both sides', () => {
  it('keep mine leaves the file and takes theirs as the new base', async () => {
    const { files, pull } = await setup({ choice: 'mine', remember: false, silent: false });
    expect(await pull('2', 'a\nb\nc\nTHEIRS\ne')).toMatchObject({ kind: 'kept' });
    expect(files.get(PATH)).toBe('a\nMINE\nc\nd\ne');
    expect(await pull('2', 'a\nb\nc\nTHEIRS\ne')).toMatchObject({ kind: 'unchanged' });
  });

  it('take theirs replaces the note, keeps mine in the history, and undo brings it back', async () => {
    const { app, files, pulled, history, pull } = await setup({ choice: 'theirs', remember: false, silent: false });
    await pull('2', 'theirs text');
    expect(files.get(PATH)).toBe('theirs text');
    const record = pulled.byPath(PATH)!;
    expect(await history.entries(record)).toEqual([{ at: 1, before: 'a\nMINE\nc\nd\ne', after: 'theirs text' }]);
    expect(await undoLastMerge(app, history, record, async () => true)).toBe(true);
    expect(files.get(PATH)).toBe('a\nMINE\nc\nd\ne');
    expect(await history.entries(record)).toEqual([]);
  });

  it('remembers the choice for the note and asks no more', async () => {
    const { ask, pull, pulled } = await setup({ choice: 'both', remember: true, silent: false });
    await pull('2', 'one');
    await pull('3', 'two');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(pulled.byPath(PATH)?.choice).toBe('both');
  });

  it('auto merge applies one-sided changes and shows the result unless silent', async () => {
    const shown = await setup({ choice: 'auto', remember: false, silent: false }, 'edited result');
    await shown.pull('2', 'a\nb\nc\nTHEIRS\ne');
    expect(shown.merge).toHaveBeenCalledWith(expect.objectContaining({ preview: 'a\nMINE\nc\nTHEIRS\ne' }));
    expect(shown.files.get(PATH)).toBe('edited result');
    const silent = await setup({ choice: 'auto', remember: true, silent: true });
    await silent.pull('2', 'a\nb\nc\nTHEIRS\ne');
    expect(silent.merge).not.toHaveBeenCalled();
    expect(silent.files.get(PATH)).toBe('a\nMINE\nc\nTHEIRS\ne');
  });

  it('auto merge only on pull: a remembered silent auto merge changes nothing until the receiver pulls', async () => {
    const { files, pull } = await setup({ choice: 'auto', remember: true, silent: true });
    await pull('2', 'a\nb\nc\nTHEIRS\ne');
    files.set(PATH, 'a\nMINE2\nc\nTHEIRS\ne');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(files.get(PATH)).toBe('a\nMINE2\nc\nTHEIRS\ne');
    await pull('3', 'a\nb\nc\nTHEIRS\nE');
    expect(files.get(PATH)).toBe('a\nMINE2\nc\nTHEIRS\nE');
  });

  it('resolve conflicts opens the merge page and stores its conflict default; closing it changes nothing', async () => {
    const resolved = await setup({ choice: 'resolve', remember: false, silent: false }, 'merged by hand');
    await resolved.pull('2', 'a\nTHEIRS\nc\nd\ne');
    expect(resolved.merge).toHaveBeenCalledWith(expect.objectContaining({ preview: null, conflictDefault: 'both' }));
    expect(resolved.files.get(PATH)).toBe('merged by hand');
    expect(resolved.pulled.byPath(PATH)?.conflictDefault).toBe('theirs');
    const closed = await setup({ choice: 'resolve', remember: false, silent: false }, null);
    expect(await closed.pull('2', 'a\nTHEIRS\nc\nd\ne')).toEqual({ kind: 'cancelled' });
    expect(closed.files.get(PATH)).toBe('a\nMINE\nc\nd\ne');
  });
});
```

In the remembered-auto test, the second pull compares MINE2 against the base (the version-2 text, `THEIRS` on line 4). Mine changed line 2, and theirs changed line 5 (`e` to `E`). Those lines are apart, so the merge has no conflict and writes the merged text silently. The vault never changes between the pulls.

Create `tests/unit/online/sharing/mergeUi.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { diff3 } from '../../../../src/app/online/sharing/merge/diff3';
import { MergeView } from '../../../../src/app/online/sharing/merge/ui/MergeView';
import { UpdateChoiceForm } from '../../../../src/app/online/sharing/merge/ui/UpdateChoiceForm';

describe('the update choice', () => {
  it('offers the five choices with remember and silent', () => {
    const answer = vi.fn();
    render(<UpdateChoiceForm title="Goblin cave" personName="Ana" onAnswer={answer} />);
    expect(screen.getByText('Goblin cave changed on both sides')).toBeTruthy();
    for (const label of ['Keep both', 'Keep mine', 'Take theirs', 'Resolve conflicts']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remember for this note'));
    fireEvent.click(screen.getByLabelText('Save auto merges without showing them'));
    fireEvent.click(screen.getByRole('button', { name: 'Auto merge' }));
    expect(answer).toHaveBeenCalledWith({ choice: 'auto', remember: true, silent: true });
  });
});

describe('the merge page', () => {
  it('shows each conflict side by side, builds the result from choices and saves an edited result', () => {
    const save = vi.fn();
    render(<MergeView chunks={diff3('a\nb\nc', 'a\nmine\nc', 'a\ntheirs\nc')} preview={null} conflictDefault="both" onSave={save} onCancel={() => {}} />);
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Theirs')).toBeTruthy();
    const result = screen.getByLabelText('Result') as HTMLTextAreaElement;
    expect(result.value).toBe('a\nmine\ntheirs\nc');
    fireEvent.click(screen.getByRole('button', { name: 'Take theirs' }));
    expect(result.value).toBe('a\ntheirs\nc');
    fireEvent.change(result, { target: { value: 'a\nby hand\nc' } });
    fireEvent.change(screen.getByLabelText('For conflicts next time'), { target: { value: 'mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save merge' }));
    expect(save).toHaveBeenCalledWith({ text: 'a\nby hand\nc', conflictDefault: 'mine' });
  });

  it('starts from an auto merge preview', () => {
    render(<MergeView chunks={diff3('a', 'a', 'b')} preview="b" conflictDefault="both" onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText('Result') as HTMLTextAreaElement).value).toBe('b');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/online/sharing/diff3.test.ts tests/unit/online/sharing/noteUpdate.test.ts tests/unit/online/sharing/mergeUi.test.tsx`
Expected: FAIL. The `merge/*` modules are not found.

- [ ] **Step 3: Implement the diff and the three-way merge**

Create `src/app/online/sharing/merge/diffLines.ts`:

```ts
/**
 * A longest common subsequence of two line lists, by Myers' O(ND) greedy algorithm. Each
 * round's frontier is kept (only its own diagonals) to walk the path back. Past `MAX_EDITS`
 * the texts are too different to align: null, and the merge treats them as one conflict.
 */
const MAX_EDITS = 2000;

export function commonLines(a: readonly string[], b: readonly string[]): Array<[number, number]> | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let edits = -1;
  for (let d = 0; d <= max && edits < 0; d++) {
    if (d > MAX_EDITS) return null;
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        edits = d;
        break;
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  let x = n;
  let y = m;
  for (let d = edits; d > 0; d--) {
    const frontier = trace[d]!;
    const at = (k: number): number => frontier[k + d] ?? 0;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      pairs.push([x - 1, y - 1]);
      x--;
      y--;
    }
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    pairs.push([x - 1, y - 1]);
    x--;
    y--;
  }
  return pairs.reverse();
}
```

Create `src/app/online/sharing/merge/diff3.ts`:

```ts
/**
 * A three-way merge of lines. Lines unchanged on both sides anchor the texts; between two
 * anchors a region changed on one side only takes that side, a region changed alike on both
 * takes it once, and a region changed differently is a conflict for the receiver to settle.
 */
import { commonLines } from './diffLines';

export type MergeChunk =
  | { kind: 'same'; lines: string[] }
  | { kind: 'mine' | 'theirs' | 'both'; lines: string[]; base: string[] }
  | { kind: 'conflict'; base: string[]; mine: string[]; theirs: string[] };

/** Lines as `join('\n')` gives them back, a trailing newline included. */
export function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((line, index) => line === b[index]);

function matches(base: readonly string[], other: readonly string[]): Map<number, number> {
  return new Map(commonLines(base, other) ?? []);
}

export function diff3(base: string, mine: string, theirs: string): MergeChunk[] {
  const b = splitLines(base);
  const a = splitLines(mine);
  const c = splitLines(theirs);
  const toMine = matches(b, a);
  const toTheirs = matches(b, c);
  const chunks: MergeChunk[] = [];
  const push = (chunk: MergeChunk): void => {
    const last = chunks[chunks.length - 1];
    if (chunk.kind === 'same' && last?.kind === 'same') last.lines.push(...chunk.lines);
    else chunks.push(chunk);
  };
  let i = 0;
  let ia = 0;
  let ic = 0;
  const region = (bEnd: number, aEnd: number, cEnd: number): void => {
    const bb = b.slice(i, bEnd);
    const aa = a.slice(ia, aEnd);
    const cc = c.slice(ic, cEnd);
    if (bb.length === 0 && aa.length === 0 && cc.length === 0) return;
    if (same(aa, bb) && same(cc, bb)) push({ kind: 'same', lines: bb });
    else if (same(aa, bb)) push({ kind: 'theirs', lines: cc, base: bb });
    else if (same(cc, bb)) push({ kind: 'mine', lines: aa, base: bb });
    else if (same(aa, cc)) push({ kind: 'both', lines: aa, base: bb });
    else push({ kind: 'conflict', base: bb, mine: aa, theirs: cc });
  };
  for (let k = 0; k < b.length; k++) {
    const ka = toMine.get(k);
    const kc = toTheirs.get(k);
    if (ka === undefined || kc === undefined || ka < ia || kc < ic) continue;
    region(k, ka, kc);
    push({ kind: 'same', lines: [b[k]!] });
    i = k + 1;
    ia = ka + 1;
    ic = kc + 1;
  }
  region(b.length, a.length, c.length);
  return chunks;
}
```

Create `src/app/online/sharing/merge/mergeResult.ts`:

```ts
/** The text of a merge: chunks as they are, each conflict as chosen (or the fallback): mine, theirs, or both (mine first). */
import type { MergeChunk } from './diff3';

export type ConflictChoice = 'mine' | 'theirs' | 'both';

export function conflictCount(chunks: readonly MergeChunk[]): number {
  return chunks.filter((chunk) => chunk.kind === 'conflict').length;
}

export function mergedText(chunks: readonly MergeChunk[], choices: ReadonlyArray<ConflictChoice | undefined>, fallback: ConflictChoice): string {
  const lines: string[] = [];
  let conflict = 0;
  for (const chunk of chunks) {
    if (chunk.kind !== 'conflict') {
      lines.push(...chunk.lines);
      continue;
    }
    const choice = choices[conflict++] ?? fallback;
    if (choice !== 'theirs') lines.push(...chunk.mine);
    if (choice !== 'mine') lines.push(...chunk.theirs);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Implement the history and the policy**

Create `src/app/online/sharing/merge/MergeHistory.ts`:

```ts
/**
 * Each pulled note's merge history, in `history/<base key>.json` in Atlas's sharing data: the
 * text every merge or Take theirs replaced, newest last, at most 20. Undo restores the newest.
 */
import { normalizePath, TFile, type App } from 'obsidian';
import { readText, removeFile, SHARING_DATA_DIR, writeText, type DataAdapterLike } from '../dataFile';
import type { PulledRecord } from '../receive/PulledItems';

export interface MergeEntry {
  at: number;
  before: string;
  after: string;
}

const MAX_ENTRIES = 20;

function parseEntries(text: string | null): MergeEntry[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value)
      ? value.filter((entry): entry is MergeEntry => typeof entry === 'object' && entry !== null
        && typeof (entry as MergeEntry).before === 'string' && typeof (entry as MergeEntry).after === 'string'
        && typeof (entry as MergeEntry).at === 'number')
      : [];
  } catch {
    return [];
  }
}

export class MergeHistory {
  constructor(private readonly adapter: DataAdapterLike) {}

  async entries(record: PulledRecord): Promise<MergeEntry[]> {
    return parseEntries(await readText(this.adapter, this.path(record)));
  }

  async add(record: PulledRecord, entry: MergeEntry): Promise<void> {
    const entries = [...(await this.entries(record)), entry].slice(-MAX_ENTRIES);
    await writeText(this.adapter, this.path(record), JSON.stringify(entries));
  }

  async pop(record: PulledRecord): Promise<MergeEntry | null> {
    const entries = await this.entries(record);
    const last = entries.pop() ?? null;
    if (entries.length > 0) await writeText(this.adapter, this.path(record), JSON.stringify(entries));
    else await removeFile(this.adapter, this.path(record));
    return last;
  }

  private path(record: PulledRecord): string {
    return `${SHARING_DATA_DIR}/history/${record.baseKey}.json`;
  }
}

/** Restores the text the last merge replaced; asks first when the note changed since. False when nothing was undone. */
export async function undoLastMerge(app: App, history: MergeHistory, record: PulledRecord, confirmChanged: () => Promise<boolean>): Promise<boolean> {
  const last = (await history.entries(record)).at(-1);
  const file = app.vault.getAbstractFileByPath(normalizePath(record.path));
  if (!last || !(file instanceof TFile)) return false;
  if ((await app.vault.read(file)) !== last.after && !(await confirmChanged())) return false;
  await app.vault.process(file, () => last.before);
  await history.pop(record);
  return true;
}
```

Create `src/app/online/sharing/merge/noteUpdate.ts`:

```ts
/**
 * The update policy for a note changed on both sides, used only inside a pull: the note's
 * remembered choice, or the receiver's answer. Keep both, keep mine, take theirs, resolve
 * conflicts (the merge page), or auto merge (one-sided changes and the note's conflict
 * default, shown on the merge page unless the note is set to silent).
 */
import type { NoteUpdatePolicy, UpdateContext, UpdateResult } from '../receive/notePull';
import type { ConflictDefault, PulledItems, UpdateChoice } from '../receive/PulledItems';
import { diff3, type MergeChunk } from './diff3';
import { mergedText } from './mergeResult';

export interface AskResult {
  choice: UpdateChoice;
  remember: boolean;
  silent: boolean;
}

export interface MergeRequest {
  context: UpdateContext;
  chunks: MergeChunk[];
  /** An auto merge's result to start from; null for Resolve conflicts. */
  preview: string | null;
  conflictDefault: ConflictDefault;
}

export interface MergeAnswer {
  text: string;
  conflictDefault: ConflictDefault;
}

export interface UpdatePolicyDeps {
  pulled: Pick<PulledItems, 'update'>;
  /** Null when the receiver closes the dialog: nothing changes. */
  ask(context: UpdateContext): Promise<AskResult | null>;
  /** The merge page; null when it is closed without saving. */
  merge(request: MergeRequest): Promise<MergeAnswer | null>;
}

export function createUpdatePolicy(deps: UpdatePolicyDeps): NoteUpdatePolicy {
  return {
    async resolve(context: UpdateContext): Promise<UpdateResult> {
      const { record } = context;
      let choice = record.choice;
      let silent = record.silent === true;
      if (!choice) {
        const answer = await deps.ask(context);
        if (!answer) return { kind: 'cancel' };
        choice = answer.choice;
        silent = answer.silent;
        if (answer.remember) deps.pulled.update(record.key, { choice, ...(silent ? { silent: true } : {}) });
      }
      if (choice === 'both') return { kind: 'both' };
      if (choice === 'mine') return { kind: 'keep' };
      if (choice === 'theirs') return { kind: 'write', text: context.theirs };
      const conflictDefault = record.conflictDefault ?? 'both';
      const chunks = diff3(context.base, context.mine, context.theirs);
      const automatic = mergedText(chunks, [], conflictDefault);
      if (choice === 'auto' && silent) return { kind: 'write', text: automatic };
      const answer = await deps.merge({ context, chunks, preview: choice === 'auto' ? automatic : null, conflictDefault });
      if (!answer) return { kind: 'cancel' };
      if (answer.conflictDefault !== conflictDefault) deps.pulled.update(record.key, { conflictDefault: answer.conflictDefault });
      return { kind: 'write', text: answer.text };
    },
  };
}
```

- [ ] **Step 5: The choice dialog and the merge page**

Create `src/app/online/sharing/merge/ui/UpdateChoiceForm.tsx`:

```tsx
import React, { useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { UpdateChoice } from '../../receive/PulledItems';
import type { AskResult } from '../noteUpdate';

const CHOICES: ReadonlyArray<{ choice: UpdateChoice; label: string }> = [
  { choice: 'both', label: 'Keep both' },
  { choice: 'mine', label: 'Keep mine' },
  { choice: 'theirs', label: 'Take theirs' },
  { choice: 'resolve', label: 'Resolve conflicts' },
  { choice: 'auto', label: 'Auto merge' },
];

export function UpdateChoiceForm({ title, personName, onAnswer }: { title: string; personName: string; onAnswer: (answer: AskResult) => void }): React.ReactElement {
  const [remember, setRemember] = useState(false);
  const [silent, setSilent] = useState(false);
  return (
    <div className="atlas-merge-choice">
      <h3 className="atlas-merge-choice__title">{`${title} changed on both sides`}</h3>
      <p className="atlas-merge-choice__help">{`You edited your copy, and ${personName} changed theirs since your last pull.`}</p>
      <label className="atlas-merge-choice__check">
        <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} aria-label="Remember for this note" />
        <span>Remember for this note</span>
      </label>
      <label className="atlas-merge-choice__check">
        <input type="checkbox" checked={silent} onChange={() => setSilent(!silent)} aria-label="Save auto merges without showing them" />
        <span>Save auto merges without showing them</span>
      </label>
      <div className="modal-button-container atlas-merge-choice__actions">
        {CHOICES.map(({ choice, label }) => (
          <Button key={choice} variant={choice === 'resolve' ? 'default' : 'outline'} onClick={() => onAnswer({ choice, remember, silent })}>{label}</Button>
        ))}
      </div>
    </div>
  );
}
```

Create `src/app/online/sharing/merge/ui/MergeView.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { ConflictDefault } from '../../receive/PulledItems';
import type { MergeChunk } from '../diff3';
import { mergedText, type ConflictChoice } from '../mergeResult';
import type { MergeAnswer } from '../noteUpdate';

interface MergeViewProps {
  chunks: readonly MergeChunk[];
  preview: string | null;
  conflictDefault: ConflictDefault;
  onSave(answer: MergeAnswer): void;
  onCancel(): void;
}

const CHOICE_LABEL: Record<ConflictChoice, string> = { mine: 'Keep mine', theirs: 'Take theirs', both: 'Keep both' };
const TAKEN: Record<'mine' | 'theirs' | 'both', string> = { mine: 'Kept from mine', theirs: 'Taken from theirs', both: 'Changed alike on both sides' };

function Lines({ lines }: { lines: readonly string[] }): React.ReactElement {
  return <pre className="atlas-merge__lines">{lines.join('\n') || ' '}</pre>;
}

/** Side by side per conflict, one-sided changes taken; the result follows the choices until edited by hand. */
export function MergeView({ chunks, preview, conflictDefault, onSave, onCancel }: MergeViewProps): React.ReactElement {
  const [choices, setChoices] = useState<Array<ConflictChoice | undefined>>([]);
  const [nextDefault, setNextDefault] = useState<ConflictDefault>(conflictDefault);
  const [edited, setEdited] = useState<string | null>(preview);
  const generated = useMemo(() => mergedText(chunks, choices, conflictDefault), [chunks, choices, conflictDefault]);
  const result = edited ?? generated;
  let conflict = -1;
  return (
    <div className="atlas-merge">
      <div className="atlas-merge__chunks">
        {chunks.map((chunk, index) => {
          if (chunk.kind === 'same') return <Lines key={index} lines={chunk.lines} />;
          if (chunk.kind !== 'conflict') {
            return (
              <div key={index} className="atlas-merge__taken">
                <span className="atlas-merge__label">{TAKEN[chunk.kind]}</span>
                <Lines lines={chunk.lines} />
              </div>
            );
          }
          const at = ++conflict;
          const choose = (choice: ConflictChoice): void => {
            const next = [...choices];
            next[at] = choice;
            setChoices(next);
            setEdited(null);
          };
          return (
            <div key={index} className="atlas-merge__conflict" role="group" aria-label={`Conflict ${at + 1}`}>
              <div className="atlas-merge__sides">
                <div className="atlas-merge__side"><span className="atlas-merge__label">Mine</span><Lines lines={chunk.mine} /></div>
                <div className="atlas-merge__side"><span className="atlas-merge__label">Base</span><Lines lines={chunk.base} /></div>
                <div className="atlas-merge__side"><span className="atlas-merge__label">Theirs</span><Lines lines={chunk.theirs} /></div>
              </div>
              <div className="atlas-merge__choices">
                {(['mine', 'theirs', 'both'] as const).map((choice) => (
                  <Button key={choice} size="sm" variant={(choices[at] ?? conflictDefault) === choice ? 'default' : 'outline'} onClick={() => choose(choice)}>
                    {CHOICE_LABEL[choice]}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <label className="atlas-merge__result">
        <span className="atlas-merge__label">Result</span>
        <textarea aria-label="Result" value={result} onChange={(event) => setEdited(event.target.value)} rows={12} />
      </label>
      <label className="atlas-merge__default">
        <span>For conflicts next time</span>
        <select className="dropdown" aria-label="For conflicts next time" value={nextDefault} onChange={(event) => setNextDefault(event.target.value as ConflictDefault)}>
          <option value="both">Keep both</option>
          <option value="mine">Keep mine</option>
          <option value="theirs">Take theirs</option>
        </select>
      </label>
      <div className="modal-button-container">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="default" onClick={() => onSave({ text: result, conflictDefault: nextDefault })}>Save merge</Button>
      </div>
    </div>
  );
}
```

The test has one conflict, and its labels `Mine` and `Theirs` appear once each, so `getByText` finds them. With several conflicts, each conflict's group has its own labels.

Create `src/app/online/sharing/merge/ui/mergeModals.tsx`:

```tsx
/** The update choice and the merge page as Atlas's native modals; each resolves once, with null when closed without an answer. */
import React from 'react';
import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../../ui/nativeModal';
import type { UpdateContext } from '../../receive/notePull';
import type { AskResult, MergeAnswer, MergeRequest } from '../noteUpdate';
import { MergeView } from './MergeView';
import { UpdateChoiceForm } from './UpdateChoiceForm';

class AnswerModal<T> extends Modal {
  private root: Root | null = null;
  private answered = false;

  constructor(app: App, private readonly title: string, cls: string, private readonly content: (answer: (value: T | null) => void) => React.ReactElement,
    private readonly resolve: (value: T | null) => void) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, cls);
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.root = createRoot(this.contentEl);
    this.root.render(this.content((value) => {
      this.answered = true;
      this.resolve(value);
      this.close();
    }));
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
    if (!this.answered) this.resolve(null);
  }
}

export function askUpdateChoice(app: App, context: UpdateContext): Promise<AskResult | null> {
  return new Promise((resolve) => {
    new AnswerModal<AskResult>(app, 'Shared note changed', 'atlas-merge-choice-modal',
      (answer) => <UpdateChoiceForm title={context.title} personName={context.personName} onAnswer={answer} />, resolve).open();
  });
}

export function openMergePage(app: App, request: MergeRequest): Promise<MergeAnswer | null> {
  return new Promise((resolve) => {
    new AnswerModal<MergeAnswer>(app, `Merge · ${request.context.title}`, 'atlas-merge-modal',
      (answer) => (
        <MergeView chunks={request.chunks} preview={request.preview} conflictDefault={request.conflictDefault}
          onSave={answer} onCancel={() => answer(null)} />
      ), resolve).open();
  });
}
```

Create `src/app/online/sharing/merge/ui/merge.scss`:

```scss
// The update choice and the merge page. Imported inside the `.atlas-vtt-plugin` scope of styles/main.scss.
@use '../../../../../../styles/tokens' as *;
@use '../../../../../../styles/mixins' as *;

.atlas-merge-modal {
  width: min(960px, 92vw);
}

.atlas-merge,
.atlas-merge-choice,
.atlas-merge__chunks,
.atlas-merge__conflict,
.atlas-merge__taken,
.atlas-merge__result {
  @include atlas-flex-col($spacing-s);
}

.atlas-merge-choice__title {
  margin: 0;
  font-size: $font-ui-medium;
}

.atlas-merge-choice__help {
  @include atlas-help-text;
  margin: 0;
}

.atlas-merge-choice__check,
.atlas-merge__choices,
.atlas-merge__default {
  @include atlas-flex-row($spacing-s);
}

.atlas-merge-choice__actions {
  flex-wrap: wrap;
}

.atlas-merge__sides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $spacing-s;
}

.atlas-merge__side {
  @include atlas-flex-col($spacing-xs);
}

.atlas-merge__conflict {
  @include atlas-inset-surface;
  padding: $spacing-s;
  border-radius: $radius-xl;
}

.atlas-merge__lines {
  margin: 0;
  padding: $spacing-s;
  border-radius: $radius-l;
  background: var(--background-secondary);
  white-space: pre-wrap;
  font-size: $font-ui-smaller;
}

.atlas-merge__label {
  color: var(--text-muted);
  font-size: $font-ui-smaller;
  font-weight: $font-weight-semibold;
}

.atlas-merge__result textarea {
  @include atlas-text-input;
  min-height: 160px;
  font-family: var(--font-monospace);
  font-size: $font-ui-smaller;
}
```

In `styles/main.scss`, add `@import '../src/app/online/sharing/merge/ui/merge.scss';` after the Shared with me import.

- [ ] **Step 6: Use the policy, the history and Undo**

In `src/app/online/sharing/registerSharing.ts`, replace `keepBothPolicy` with the real policy and history:

```ts
  const history = new MergeHistory(plugin.app.vault.adapter);
  const policy = createUpdatePolicy({
    pulled,
    ask: (context) => askUpdateChoice(plugin.app, context),
    merge: (request) => openMergePage(plugin.app, request),
  });
  const replaced = (record: PulledRecord, before: string, after: string): Promise<void> => history.add(record, { at: Date.now(), before, after });
```

`new SharedWithMe({ … })` now takes `policy` and `replaced` (in place of `keepBothPolicy`). Then add the command:

```ts
  plugin.addCommand({
    id: 'undo-shared-merge', name: 'Undo last merge',
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const record = file ? pulled.byPath(file.path) : null;
      if (!record || record.kind !== 'note') return false;
      if (!checking) {
        void undoLastMerge(plugin.app, history, record, () => confirmAction({
          title: 'Undo the last merge?',
          message: ['This note changed after that merge. Undoing replaces it with the text from before the merge.'],
          confirmLabel: 'Undo', destructive: true,
        })).then((undone) => new Notice(undone ? 'Merge undone.' : 'There is no merge to undo for this note.'));
      }
      return true;
    },
  });
```

Imports: `MergeHistory`, `undoLastMerge`, `createUpdatePolicy`, `askUpdateChoice`, `openMergePage`, `confirmAction`, `PulledRecord` (type). Remove the `keepBothPolicy` import (the tests still use it).

- [ ] **Step 7: Run the focused tests**

Run: `npx vitest run tests/unit/online/sharing`
Expected: PASS.

- [ ] **Step 8: The full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/online/sharing/merge src/app/online/sharing/registerSharing.ts styles/main.scss tests/unit/online/sharing
git commit -m "feat(online): choose how shared note updates meet your edits, with a merge page and undo"
```

---
### Task 7: End to end, documentation, privacy notes, checks and the manual test

Three Atlases share both ways over `MemoryTransport` (the GM and two players):
- each lists and pulls into its own in-memory vault;
- each edits and re-pulls;
- player-to-player items go through the GM, which writes nothing and keeps no mapping afterwards.

Then the user-facing docs, the privacy notes (including that the GM's Atlas relays player-to-player items in clear), the developer guide and the changelog. Last come the full checks and the manual test with three vaults.

**Files:**
- Test: `tests/unit/online/sharing/sharingEndToEnd.test.ts`
- Modify: `README.md` (Online play), `PRIVACY.md` (Online play), `docs/online-play-features.md` (section 11), `changelog/Unreleased.md`

**Interfaces:**
- Consumes: everything above. `GmShareHost`, `PlayerShareLink`, `SharedWithMe`, `createUpdatePolicy`, `noteCatalogue`, `GmSession`, `PlayerSession`, `MemoryNetwork`, `createInMemoryApp`.
- Produces: no new code.

- [ ] **Step 1: Write the end-to-end test**

Create `tests/unit/online/sharing/sharingEndToEnd.test.ts`:

```ts
/**
 * The GM and two Obsidian players over `MemoryTransport`, each with its own vault: notes go
 * both ways, a player-to-player note passes through the GM, edits on both sides meet the
 * receiver's choice, and nothing lands anywhere without a pull.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmSession, type SessionPlayer } from '../../../../src/app/online/GmSession';
import { PlayerSession } from '../../../../src/app/online/PlayerSession';
import type { TableProof } from '../../../../src/app/online/protocol';
import { createUpdatePolicy } from '../../../../src/app/online/sharing/merge/noteUpdate';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { SharedWithMe } from '../../../../src/app/online/sharing/receive/SharedWithMe';
import { GmShareHost } from '../../../../src/app/online/sharing/transport/GmShareHost';
import { PlayerShareLink } from '../../../../src/app/online/sharing/transport/PlayerShareLink';
import type { ShareNode } from '../../../../src/app/online/sharing/transport/ShareNode';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeHash } from '../assetFixtures';
import { noteCatalogue, TABLE_ID, testPerson } from './sharingFixtures';

const proof = (personId: string): TableProof => ({ id: TABLE_ID, key: 'K'.repeat(120), personId, gmName: 'Morgan', sig: 'S'.repeat(86) });
const people = [testPerson('gm', 'Morgan'), testPerson('ana', 'Ana'), testPerson('ben', 'Ben')];
const flush = async (): Promise<void> => { for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(0); };

async function table() {
  const network = new MemoryNetwork();
  const requests: SessionPlayer[] = [];
  const gm = new GmSession(network.host('gm'), { title: 'Vault', onJoinRequest: (player) => requests.push(player), onRequestClosed: () => {}, onPlayersChanged: () => {} });
  gm.start();
  const gmVault = createInMemoryApp();
  const gmNotes: Record<string, { text: string; share: unknown }> = { 'Lore/Realm.md': { text: 'The realm.\n> [!only|Ben]\n> Ben is the heir.', share: 'public' } };
  const host = new GmShareHost({ session: gm, tableId: TABLE_ID, catalogue: noteCatalogue(gmNotes, people), hash: nodeHash });
  host.start();
  const anaNotes: Record<string, { text: string; share: unknown }> = { 'Notes/Clue.md': { text: 'a\nb\nc\nd\ne', share: ['Ben'] } };
  const join = async (personId: string, name: string, notes: Record<string, { text: string; share: unknown }>) => {
    const vault = createInMemoryApp();
    const pulled = PulledItems.create(vault.app.vault.adapter);
    // The catalogue reads `notes` on every call, so a test can edit the sender's note; one instance keeps its item ids.
    const link = new PlayerShareLink({ catalogue: noteCatalogue(notes, people), hash: nodeHash });
    const session = new PlayerSession({ hostId: 'gm', name, playerKey: `key-${personId}`, clientVersion: '1', clientKind: 'obsidian', transport: network.client(), onChange: () => {}, share: link });
    session.start();
    await flush();
    gm.allow(requests.at(-1)!.playerId, { personId, table: proof(personId) });
    await flush();
    const node: ShareNode = link.activate({ tableId: TABLE_ID, personId });
    const service = new SharedWithMe({
      app: vault.app, pulled, node, tableId: TABLE_ID, nameOf: (id) => people.find((person) => person.personId === id)?.name ?? 'Someone',
      policy: createUpdatePolicy({ pulled, ask: async () => ({ choice: 'auto', remember: true, silent: true }), merge: async () => null }),
      assets: {} as never, confirmMapUpdate: async () => 'theirs',
    });
    return { vault, service, notes };
  };
  const ana = await join('ana', 'Ana', anaNotes);
  const ben = await join('ben', 'Ben', {});
  return { gm, host, gmVault, ana, ben };
}

/** Pulls `title` from `person`, settling the transport while it runs. */
async function pull(side: Awaited<ReturnType<typeof table>>['ana'], person: string, title: string) {
  const listed = side.service.refresh(person);
  await flush();
  const item = (await listed).items.find((candidate) => candidate.title === title)!;
  const pulling = side.service.pull(person, item);
  await flush();
  return { item, outcome: await pulling };
}

describe('sharing between three Atlases', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('each gets what is theirs from the GM, filtered on the GM’s machine', async () => {
    const { gm, host, ana, ben } = await table();
    await pull(ana, 'gm', 'Realm');
    await pull(ben, 'gm', 'Realm');
    expect(ana.vault.files.get('Shared/Morgan/Realm.md')).toBe('The realm.');
    expect(ben.vault.files.get('Shared/Morgan/Realm.md')).toBe('The realm.\n> [!only|Ben]\n> Ben is the heir.');
    host.stop();
    gm.stop();
  });

  it('a player shares with another through the GM, who writes nothing and keeps nothing', async () => {
    const { gm, host, gmVault, ana, ben } = await table();
    const before = [...gmVault.files.keys()];
    const listed = ana.service.refresh('ben');
    await flush();
    expect((await listed).items).toEqual([]);
    await pull(ben, 'ana', 'Clue');
    expect(ben.vault.files.get('Shared/Ana/Clue.md')).toBe('a\nb\nc\nd\ne');
    expect([...gmVault.files.keys()]).toEqual(before);
    expect(host.relayMappings()).toBe(0);
    host.stop();
    gm.stop();
  });

  it('edits on both sides meet the receiver’s choice on the next pull, and only then', async () => {
    const { gm, host, ana, ben } = await table();
    await pull(ben, 'ana', 'Clue');
    ben.vault.files.set('Shared/Ana/Clue.md', 'a\nBEN\nc\nd\ne');
    ana.notes['Notes/Clue.md'] = { text: 'a\nb\nc\nANA\ne', share: ['Ben'] };
    await flush();
    expect(ben.vault.files.get('Shared/Ana/Clue.md')).toBe('a\nBEN\nc\nd\ne');
    const { item, outcome } = await pull(ben, 'ana', 'Clue');
    expect(item.state).toBe('updated');
    expect(outcome).toMatchObject({ kind: 'updated' });
    expect(ben.vault.files.get('Shared/Ana/Clue.md')).toBe('a\nBEN\nc\nANA\ne');
    host.stop();
    gm.stop();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/online/sharing/sharingEndToEnd.test.ts`
Expected: PASS. If it fails, the failure is in a task's code (each task's own tests passed), so fix it in that task's files and note the fix in this task's commit message.

- [ ] **Step 3: User documentation**

In `README.md`, after the paragraph about players joining from Obsidian (in **Online play (preview)**), add:

```markdown
Everyone who plays from Atlas in Obsidian can share notes and maps with the others in the session, GM and players alike. Right-click a note or a map and pick **Share with…**: tick people, or **Everyone in my sessions**; for a map, choose **Player-safe** (what online players see) or **Full** (everything, as a co-GM would see it) and which of its linked notes to include. A note keeps its sharing in its `atlas-share` property, which you can also edit by hand: `public`, `private`, `[Ana, Ben]` or `[public, except Cara]`. Parts of a note stay yours: `> [!private]` callouts and `%% comments %%` are never shared, `> [!only|Ana, Ben]` goes only to those people and `> [!except|Cara]` to everyone but Cara. The dialog previews what each person gets. Properties are removed before sending except those listed in **Settings → Online play → Shared note properties**.

During a session, **Shared with me…** (also on the online panel and the Online scene bar) lists what each person shares with you, marked **New**, **Updated** or **Up to date**. **Pull** saves a note in `Shared/<person>/` and a map, with its images, in a **Shared with me** collection. Nothing lands in your vault unless you pull it. When you pull a note you also changed, choose **Keep both**, **Keep mine**, **Take theirs**, **Resolve conflicts** (a merge page that takes one-sided changes and lets you settle each conflict) or **Auto merge**, and tick **Remember for this note** to skip the question next time; **Undo last merge** restores the text a merge replaced. A sender can ask you to pull something: you see **Pull** and **Not now**.

Atlas knows people by a key each of their devices keeps for your table, never by the name they type. Your join requests show **(known)** or **(new)**, a new device with a known name is flagged, and only you can **Link** it to that person. **People…** lists everyone Atlas met in sessions, to rename, link or remove.
```

In `changelog/Unreleased.md`, under **New → Online Play (preview)**, add:

```markdown
- Share notes and maps between Atlas users in a session: **Share with…** on a note or map, `atlas-share` in a note's properties, private, only and except parts that never leave your Atlas, player-safe or full maps with their linked notes, and a preview per person. **Shared with me…** lists what others share with you; **Pull** saves it into your vault, and pulling again offers keep both, keep mine, take theirs, a merge page or auto merge, with undo. Items between players pass through the GM's Atlas, which stores none of them.
- Join requests from Atlas players show whether you know them, flag a new device using a known name, and let you link it. **People…** manages the people Atlas knows from sessions.
```

- [ ] **Step 4: Privacy notes**

In `PRIVACY.md`, section **Online play**, change the sentence `Nothing you receive is written into your vault: the scene is kept in memory only.` to `Nothing you receive is written into your vault unless you pull it (see below): the scene is kept in memory only.`. Then append to the section:

```markdown
### Sharing notes and maps

When you and others play from Atlas in Obsidian, Atlas identifies each of you with a key that stays on your device: the GM's table key in Atlas's settings (in the vault's `atlas-vtt/.atlas-data/settings.json`, so anyone who can read the vault can act as that table), and each player's device key in Obsidian's browser storage on that device, one per table, never in the vault. Joining sends a signature made with it, never the key. The GM keeps a people list (names and device ids) in `atlas-vtt/.atlas-data/sharing/people.json`; players keep one with the people they met.

Nothing is shared until you share it, and only with the people you pick. What leaves your Atlas is decided on your computer: `[!private]` parts, comments and parts for other people are removed first, as are properties not listed under **Shared note properties**, the `atlas-share` property itself, and links to notes the person does not get (they become plain text). File paths never leave your Atlas; shared items get random ids. A player-safe map holds what online players see; a full map holds the whole map, including hidden tokens, GM-only pins, walls and lights, with paths replaced. Items go only to someone who pulls them, during a session, over the same encrypted connection as the game.

Items between two players pass through the GM's Atlas, which forwards them piece by piece and stores none of them. Each connection is encrypted, but the GM's Atlas handles the items in clear while it forwards them, so the GM could read anything players share with each other.

What you pull is written into your vault: notes into `Shared/<person>/`, maps and their images into the **Shared with me** collection. Atlas keeps the last pulled version of each note, its merge history and what you pulled from whom in `atlas-vtt/.atlas-data/sharing/`, which Obsidian does not index.
```

- [ ] **Step 5: The developer guide**

Append to `docs/online-play-features.md`:

```markdown
## 11. Sharing between Obsidian clients

Sharing (`src/app/online/sharing/`) reuses online play: a player-safe map is `projectForPlayers` (step 2), so a new map feature that players see is in player-safe shares too. Keep these in mind:

- **A new map field holding a vault path** (an image, a note, a sound) must be added to the path fields `clearForeignPaths` resets (`receive/receivedMap.ts`), and to `imagePathsOf` (`model/buildMapPayload.ts`) if it is an image to send. Full shares send every map field, with paths replaced by references; anything left that names a sender's file is cleared on both sides.
- **Note filtering** (`model/noteFilter.ts`) is fail-closed: a callout ends only at a blank line, a heading or a fence at a lower quote depth. Do not "fix" it to end at the first unquoted line: Obsidian renders such a line inside the callout.
- **Wire**: `share-*` messages on the assets channel (`transport/shareProtocol.ts`), addressed by person id, with handles at or above `SHARE_HANDLE_MIN`; image handles stay below. The GM stamps `from`; never trust one a player sent. The relay (`ShareRelay`) holds handle mappings only.
- **Identity**: person ids come from the GM; `IdentityDesk` decides known or new by device id, never by name. A proof is bound to the host id, so change `deviceProofText`/`tableProofText` only with a new version prefix.
- **Vault writes** happen only in `notePull` and `mapPull`, inside a pull the receiver started. Maps and their scene record are written under `runExclusive`.
- **Tests**: the end-to-end tests run three Atlases over `MemoryTransport` (`tests/unit/online/sharing/sharingEndToEnd.test.ts`); use `noteCatalogue` and `nodeIdentityCrypto` from `sharingFixtures.ts`, since Web Crypto finishes outside fake timers' control.
```

- [ ] **Step 6: Full checks**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build:ci && npm run build:online`
Expected: no type or lint errors; all tests pass; both builds succeed. Never run `npm run build`.

- [ ] **Step 7: The manual test (the user runs it)**

You need three vaults: the GM's, Ana's and Ben's, on two or three machines (or three Obsidian windows with different vaults). Install this build in each with `npm run build:ci`, then copy `dist/` by hand.
1. **Host and identify.**
   - GM: **Online session…** → **Start online session**; the link contains `&table=`.
   - Ana and Ben: **Join online session…** with the link. The GM sees each request as **(new)**. Allow both.
   - Ben leaves, then joins again from the same device: **(known)**.
   - Ben joins from another device under the name `Ana`: the request says `Someone named Ana is already in your people list` and offers **Link to Ana**. Deny it.
2. **Share from the GM.**
   - In a note, write `> [!private]`, `> [!only|Ben]` and `%% comment %%` parts.
   - **Share with…** → **Everyone in my sessions**. **Preview as** Ana, then as Ben: each sees only their parts.
   - The note's properties now show `atlas-share: public`.
3. **Pull.**
   - Ana: **Shared with me…** → the GM's note is **New** → **Pull**. It is in `Shared/Morgan/`.
   - Nothing appears in Ben's vault until he pulls.
4. **Player to player.**
   - Ana: **Share with…** a note → tick Ben. Ben pulls it from Ana's section.
   - Check in the GM's vault that nothing new was written.
5. **Edit and re-pull.**
   - Ana edits her note and Ben edits his copy, on different lines.
   - Ben pulls again: the item says **Updated**, and the dialog offers the five choices.
   - **Auto merge** shows the merged result; **Save merge**.
   - Run **Undo last merge** on the note: Ben's text from before comes back.
6. **Maps.**
   - GM: **Share with…** on a map → Ben, **Player-safe**, and tick a linked note.
   - Ben pulls the map, ticking **Also pull** for the note. The map is in the **Shared with me** collection, with its image and the pin linked to the pulled note, and no hidden tokens.
   - GM switches the share to **Full**: the confirmation appears.
   - Ben pulls again: hidden tokens appear, and nothing points at the GM's paths.
7. **Push.** GM: run **Ask to pull…** on the shared note and pick Ana. Ana sees `Morgan asks you to pull …` with **Pull** and **Not now**, and **Not now** writes nothing.

Report any step that behaves differently. The controller records the result.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/online/sharing/sharingEndToEnd.test.ts README.md PRIVACY.md docs/online-play-features.md changelog/Unreleased.md
git commit -m "test(online): sharing between three Atlases end to end; docs and privacy notes for sharing"
```

---
## Self-review

**1. Spec coverage.**

| Spec | Task |
| --- | --- |
| Table id carried in the join link; per-table player id on Obsidian clients; the GM maps it; web players unaffected | 1 (link, device keys, proofs, `personId`), 2 (desk) |
| People list (id, table, editable name, last seen); **People** panel (rename, link, remove); added when admitted | 2 |
| The id, not the name, decides who someone is; **(known)** and **(new)**; the duplicate-name warning; **Allow**, **Link to Ana**, **Deny**; only the GM links | 2 (`IdentityDesk`, panel, notice), 1 (proofs: a typed name or a forged link gets nothing) |
| Renames keep references by id | 2 (`formerNames`, aliases), 3 (maps hold person keys) |
| `atlas-share` forms; `private` wins; `except` over a name; never sent | 3 (`shareRule`, `audience`, `frontmatterFilter`) |
| **Share with…**: people or **Everyone in my sessions**, written and read back; maps **Player-safe** / **Full** (confirmed); linked notes, none behind hidden pins | 3 |
| Shares stored by the sender and listed whenever both are in a session | 3 (property, scene record), 4 (catalogue served per session) |
| Frontmatter stripped except shareable properties in settings | 3 (setting, filter) |
| `[!private]`, `[!only|…]`, `[!except|…]`, `%% %%`; nesting; unknown names; sender warned; preview per person | 3 |
| **Shared with me** per person: new, updated, up to date | 5 |
| **Pull** to `Shared/<person>/`; maps into **Shared with me** with images; sanitised names; never outside the folder | 5 |
| Links to unshared notes become plain text | 3 (sender side, ruling 8) |
| Push request with **Pull** and **Not now** | 4 (wire), 5 (**Ask to pull…**, prompt, dialog) |
| Base version in Atlas data; keep both / pick one / resolve / auto merge; "Remember for this note" | 5 (base), 6 |
| Merge page: side by side, one-sided changes taken, per conflict keep mine / take theirs / keep both, editable result | 6 |
| Auto merge shows the result unless silent; replaced text in history; any merge undoable | 6 |
| Assets channel, fingerprint-checked chunks, only when pulled; relay through the GM without storing; privacy notes say so | 4, 7 |
| Notes Markdown only, nothing executes; maps validated like received scenes; limits on size, count and rate | 3 (`parseMapPayload`), 4 (`SHARE_LIMITS`) |
| Testing list, manual test with three vaults | every task, 7 |
| Future direction (campaigns, characters) | not in scope; ids chosen to allow it (header) |

**2. Placeholder scan.** No "TBD", "TODO", "later" or "similar to" remains. Every code step carries its code, and every run step its command and expected result.

**3. Type and name consistency.** These were checked across tasks:
- **Identity:**
  - `DeviceProof` and `TableProof` (`protocol.ts`), `Admission` (`gmSessionTypes.ts`);
  - `SessionIdentity` (`OnlineJoinService.ts`) and `Recipient` (`audience.ts`) both carry `tableId` and `personId`;
  - `GM_PERSON_ID = 'gm'`.
- **Shares:**
  - `MapShare.people` and `.except` are person keys, `<tableId>/<personId>` from `personKey`;
  - `CatalogueItem` and `SharePayload` (`SenderCatalogue.ts`) are what `ShareNode`'s `catalogue` returns, through `{ list(person), open(person, ref) }`, which `GmShareHost` and `PlayerShareLink` adapt by table.
- **Pulls:**
  - `PulledItem` (`IncomingTransfers.ts`, re-exported by `ShareNode.ts`) is what `SharedWithMe` and `pullMap.pullImage` take;
  - `PulledRecord.choice`, `.conflictDefault` and `.silent` are written by `createUpdatePolicy` and kept by `pullNote` (it re-reads the record after the policy ran).
- **Registration:** `SharingServices` grows one field per task (Task 2 `joins`, `people`, `settings`; Task 3 `items`; Task 4 `sessions`; Task 5 `pulled`), and `main.ts` passes each as it is added.

**4. Review Focus.** Each of the five lines names its tests in the header:
- line 1: `noteFilter.test.ts` and `shareNode.test.ts`;
- line 2: `safePaths.test.ts`, `notePull.test.ts` and `mapPull.test.ts`;
- line 3: `sharedWithMe.test.ts`, `mapPull.test.ts` and `noteUpdate.test.ts`;
- line 4: `shareRelay.test.ts`, `shareSessionEndToEnd.test.ts` and `sharingEndToEnd.test.ts`;
- line 5: `identityProofs.test.ts`, `onlineJoinIdentity.test.ts` and `identityDesk.test.ts`.

The spec's own testing list is covered too:
- filtering: every rule, nesting and unknown names;
- identity and renames;
- catalogue, pull, paths and links;
- three-way merge, each option, auto merge and undo;
- relay and pushes;
- the manual test.
