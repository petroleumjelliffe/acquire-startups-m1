# Lobby share button — design

**Date:** 2026-08-09
**Status:** Approved design, not yet planned or built
**Scope:** Generic lobby kit (`src/lobby/ui/`); wire-neutral, no server change

## What and why

The New Room card tells players to "Share this code with other players" but offers
no way to do it. A Share button joins the room-code block: one tap copies the room
link and, where the platform has one, opens the native share sheet. Standard lobby
functionality, so it lands in the shared kit and game #2 inherits it.

## Behavior

- **Copy first, then sheet.** On tap the button writes the room URL to the clipboard,
  then calls `navigator.share({ url })` if it exists. Copy-first means the link is in
  the clipboard even when the sheet is dismissed; a dismissed sheet (`AbortError`) is
  silence, not an error.
- **Fallback is copy-only.** Where `navigator.share` is absent (most desktop
  browsers), the tap copies and the button's label flips to "Copied" for ~2 seconds —
  a text swap, no animation, nothing for `prefers-reduced-motion` to object to.
- **Everyone shares, not just the host.** Any seated player in the lobby sees the
  button; recruiting is not a host privilege. (The card's subtitle already addresses
  everyone.)
- **Guarded like storage.** Clipboard and share calls take the same posture as
  `identity.ts`'s reads: wrapped, failures degrade silently to whatever still works.
  A lobby that throws on a share tap is worse than a share that quietly only copied.
- **The share text is configuration, not code.** The sheet call is
  `navigator.share({ url, text })` where `text` comes through an optional prop with
  a game-neutral default (`"Join my game room"`). A game overrides it at the one
  call site that already passes the URL — so wording changes later are a prop edit
  in the game, never a kit change. The clipboard still gets the bare URL: pasted
  links should be links.

## Where things live

- **`src/lobby/ui/ShareRoomButton.tsx`** — new; props `url: string` (required) and
  `text?: string` (defaults to `"Join my game room"`). Owns the copy/share/label
  machinery. Styled with the kit's `--lobby-*` accent variables like every other
  primary control.
- **`RoomLobby`** gains optional `shareUrl?: string` and `shareText?: string`,
  rendered as the button under the code block when a URL is present.
- **`RoomPage`** passes `window.location.href` — the lobby renders at
  `/room/:roomId`, so the page's own URL *is* the share link. The kit never computes
  URLs; the game hands it one, keeping the kit route-agnostic and the import
  boundary untouched.

## Testing

- Component tests (app project): with a mocked `navigator.share` present, a tap
  calls both `clipboard.writeText(url)` and `share({ url })`; with it absent, a tap
  copies and the label reads "Copied", reverting after the timeout. Both proven able
  to fail per the hollow-gate rule (break the handler, watch red, revert).
- Real-browser look at the card. The genuine share sheet requires a secure context,
  so sheet-in-the-flesh verification happens on localhost or prod — noted, not a
  merge blocker.

## Out of scope

- Share affordances anywhere but the room lobby card (Join card, mid-game).
- A share *title* or richer share payloads — `text` + `url` is the whole surface
  until something needs more. (This supersedes the extraction spec's "no copy
  parameter yet" for this one string: the share text is the first string that
  needed it.)
- Any wire or server change.
