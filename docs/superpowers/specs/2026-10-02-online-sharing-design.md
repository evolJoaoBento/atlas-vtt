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
| Identity | A stable player id per table, shown with an editable name in a people list. |
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
  last seen. Shares and `only`/`except` names refer to people in this list;
  renaming keeps references by id.

## Sharing

- Right-click a note or map → **Share with…** → tick people. For maps: **Player-
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
