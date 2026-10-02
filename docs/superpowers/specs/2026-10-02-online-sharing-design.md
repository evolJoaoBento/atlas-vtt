# Online play, piece 6b: sharing notes and maps between people

Date: 2026-10-02. Status: design, approved in conversation. Builds on piece 6a
(players join from Obsidian). Obsidian clients only; the web page is unchanged.

## Context

Everyone keeps their own Atlas with their own notes and maps. People mark notes
and maps as shareable with chosen people; during a session each person browses a
catalogue of what was shared with them and pulls items into their vault. Pulling
again updates them. Parts of a note can be kept private, or limited to some
people. No accounts: identity comes from the session and a player name.

## Goals

- Anyone in a session can share with anyone else in it (GM ↔ players, player ↔
  player).
- Shared notes never carry parts the sender kept back.
- Pulling an update never loses the receiver's edits without their choice.
- Nothing reaches anyone's vault without them pulling it.

## Decisions

| Question | Decision |
| --- | --- |
| Who shares | Anyone with anyone in the session. |
| Identity | A stable player id per table, shown with an editable name in a people list; no passwords (the room link and GM approval are the gate). |
| Where shares live | Notes: the `atlas-share` property (written by the dialog, editable by hand); maps: the scene's data. |
| Private parts | `> [!private]` and `%% %%` never shared; `> [!only|names]` only those people; `> [!except|names]` everyone but those. |
| Updates | Per note: keep both, pick one, resolve conflicts (merge page), or auto merge. |
| Maps | Sender picks per share: player-safe (as online play filters) or full (co-GM). |
| Linked notes | Offered alongside a map; the sender ticks which to share. |
| Styling | Atlas's existing patterns. |

## Identity and people

- Each table (a GM's Atlas) has a stable table id carried in the join link. Each
  Obsidian client keeps one stable player id per table and presents it on join;
  the GM's session maps it to the player (replacing the session-only keys for
  Obsidian players). Web players are unaffected.
- Every Atlas keeps a **people list**: player id, table id, name (editable),
  last seen, managed in an Atlas **People** panel (rename, link, remove).
  People are added automatically when admitted. The player id is a long random
  secret kept on the player's device, presented on every join; it, not the
  name, decides who someone is. Join requests show **(known)** for a known id
  and **(new)** otherwise; a new id using a name already in the people list is
  flagged ("Someone named Ana is already in your people list"), and the GM can
  **Allow** as a new person, **Link to Ana** (a known person on a new device), or
  **Deny**. Only the GM links; nobody can take over another person's shares by
  typing their name. Shares and `only`/`except` names refer to people in this
  list; renaming keeps references by id.

## Sharing

- Notes carry their sharing in the `atlas-share` property:

  ```yaml
  atlas-share: public                 # everyone in a session with me (Obsidian)
  atlas-share: private                # nobody — also the default without the property
  atlas-share: [Ana, Ben]             # only Ana and Ben (same as [only Ana, only Ben])
  atlas-share: [public, except Cara]  # everyone except Cara
  ```

  `private` wins over everything and `except` over a name. The property itself
  is never sent.
- Right-click a note or map → **Share with…** → tick people, or "Everyone in my
  sessions" (`public`); the dialog writes the property and reads it back, so the
  two always agree. For maps: **Player-
  safe** (default) or **Full** (confirmed the first time), and the linked notes
  of pins and tokens to include (player-safe shares never offer notes behind
  hidden pins).
- Shares are stored in the sender's Atlas data and appear in the recipient's
  catalogue whenever both are in a session.
- Frontmatter is stripped except properties listed as shareable in settings.

## Private parts

```markdown
> [!private]
> Never shared.

> [!only|Ana, Ben]
> Only Ana and Ben.

> [!except|Cara]
> Everyone the note is shared with, except Cara.

%% Comments are never shared. %%
```

- Nested sections must pass every rule. Unknown names: `only` → nobody;
  `except` → hidden from everyone; Atlas warns the sender.
- **Preview per person** shows exactly what each recipient gets.

## Catalogue and pulling

- In a session, a **Shared with me** panel lists items per person: new, updated,
  up to date.
- **Pull** writes a note to `Shared/<person>/` in the vault, or a map into a
  **Shared with me** collection with its images. File names are sanitised; a
  share can never write outside its folder.
- Links to notes not shared with the receiver become plain text.
- **Push request:** the sender asks someone to pull an item; it appears for them
  with **Pull** and **Not now**.

## Updates and conflicts

- Atlas keeps the last pulled version of each note (in Atlas data, not the
  vault) as the merge base.
- Per note, the receiver chooses: **keep both** (saved as `Name (from Person)`),
  **pick one** (mine / theirs; the other set aside), **resolve conflicts**, or
  **auto merge**. "Remember for this note" stores the choice.
- **Merge page:** side by side; one-sided changes taken automatically; each
  conflict: keep mine, take theirs, keep both; editable result.
- **Auto merge:** applies one-sided changes and, for conflicts, the choices made
  on the merge page or the note's default; shows the result before saving unless
  set to silent. Replaced text goes to the note's merge history so any merge can
  be undone.

## Transport and safety

- Items are sent on the assets channel in fingerprint-checked chunks, only when
  pulled. Player-to-player items pass through the GM's Atlas, which forwards
  without storing; the privacy notes say so.
- Notes are Markdown text only; nothing executes. Maps are Atlas scene data and
  images, validated like received scenes.
- Limits on item size, count and rate as for images.

## Testing

- Private-part filtering per person (every rule, nesting, unknown names).
- Identity: stable ids, people list, renames.
- Catalogue and pull; sanitised paths; links to unshared notes.
- Merge: three-way with base; each per-note option; auto merge; history undo.
- Relay through the GM without storing; push requests.
- Manual: three vaults (GM, two players), share both ways, edit and re-pull.

## Future direction (noted, not in this piece)

Identity is meant to grow into campaigns and characters:

- The GM creates a **campaign**; everything in its sessions is linked to the
  campaign id (it replaces the table id).
- Each player keeps a **character list** on their side and links characters to
  campaigns. Joining a campaign's session picks the character linked to it
  automatically, by id, so players never retype a name.
- A new player creates a character or assigns one from their list on first join.
- Stored behind the scenes (a Base-like store players never have to edit).
- Needs a character creator, a campaign creator and assignment UI first; the
  stable ids in this piece (campaign/table id, per-device player id) are chosen
  so characters can be layered on without changing shares.
