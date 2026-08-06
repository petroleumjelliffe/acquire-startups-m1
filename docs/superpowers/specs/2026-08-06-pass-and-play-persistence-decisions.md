# Pass-and-play persistence — decisions so far

**Status: not a design yet.** These are the owner's rulings on the five
questions that were blocking one, recorded on 2026-08-06 so they survive the
Phase 5 work happening in front of them. The design doc and its plan come after
Phase 5.

**The finding that started it:** a pass-and-play game lives entirely in React
state. Refresh the page, or use the browser's back button, and the game is
gone. One device should hold **one** active local game and keep it until it is
finished.

## Rulings

| Question | Ruling |
|---|---|
| Route shape | `/pass-and-play` is the lobby; `/pass-and-play/game` is the board. The game gets its own route, so the back button leaves the game rather than destroying it. |
| Save cadence | **On commit only** — a segment close, the same boundary the server treats as authoritative online. Uncommitted staging is not saved; a refresh mid-turn returns you to the start of that turn. |
| Finishing a game | The final-scoring screen gains an **End game** button. Pressing it marks the game fully over and returns to the lobby, which then offers a new game rather than a continue. Nothing else clears the save. |
| Curtain on reload | **Yes** — the reveal curtain comes up on load, so the device confirms whose turn it is before showing anyone's hand. A refresh is exactly the moment nobody is sure who is holding the phone. |
| Where a game in progress is advertised | The pass-and-play lobby only. The home screen does not change. |

## The lobby, from the mockup

**Figma:** <https://www.figma.com/design/pGLOfYYNCsYY8LzNeDpwX7/Untitled?node-id=23-866>
— "Lobby Flow" (owner, 2026-08-06). Exported frame:
[assets/2026-08-06-lobby-flow.png](assets/2026-08-06-lobby-flow.png), which is
the copy of record if the Figma file moves.

**It takes precedence over the rulings above**, which were made before it
existed.

Every screen is one narrow card, centred, with a primary action, a secondary
action, and a quiet way back. Copy below is verbatim from the file.

### Mode chooser

**Acquire** / *Choose your game mode*. Two large cards, each a heading with a
line of explanation:

- **Online** — *Each player joins from their own device. Share a room link to
  play together remotely.*
- **Pass & Play** — *Everyone plays on this device. Pass it around after each
  turn (local hotseat).*

Footer, quiet: *Both modes support 2–6 players.*

### Play Online

**Play Online** / *Everyone plays from their own device*. `Create Room`
(primary), `Join with a code` (secondary), `Back`.

### New Room

**New Room** / *Share this code with other players*. The room code as a wide,
letter-spaced block — `A B C 1 2 3`. Then one row per player: an emoji chip, the
name in an editable field, and a `×`. Actions:

- alone in the room: a **disabled** `Waiting for another player` where the start
  button will be, plus `Leave`
- with others: `Start game` (primary) and `Leave`

### Join Room

**Join Room** / *Enter or paste code below*. An empty code field, then your own
player row (emoji chip, name, `×`). `Join` is **disabled** until a code is
entered; with a code present the field shows it in the same letter-spaced style
as New Room and the button becomes `Join game`. `Leave` below.

### Pass & Play

**Pass & Play** / *Pass and play on this device*.

- **Nothing saved:** `New Game` (primary), then the player rows — emoji chip,
  editable name, `×` — with `+ Add a player`, then `Start game` and `Leave`.
- **A game saved:** `New Game` (primary) above a **Continue** section holding one
  card: the game's name, its players as `🐸 Name 1, 🐷 Name 2`, and
  `Last played: 2 days ago`.

## What the mockup settles, and what it opens

Settles the last open question from the rulings — **what the lobby shows about a
saved game**: a name, the players, and how long ago it was played. So the save
carries a **name** and a **last-played timestamp**, not just a state blob.

Three things it raises that nothing has answered yet:

- **`New Game` sits above `Continue`, both live.** One active local game per
  device was the ruling; pressing `New Game` with a game saved therefore has to
  do something — replace it, or refuse until the saved one is ended. The mockup
  does not say which.
- **Where a game gets its name.** The card shows one; no screen collects it.
  Generated from the players and date, or typed at setup?
- **Ending a game from the lobby.** The ruling puts `End game` on the final
  scoring screen only, and the Continue card has no such affordance — which means
  an abandoned mid-game has no exit but finishing it.

## How to read the Figma file

The desktop app's **Dev Mode MCP server** serves it on
`http://127.0.0.1:3845/mcp` while Figma is running with the file open. It is not
registered with Claude Code by default, so either:

- register it — `claude mcp add --transport http figma http://127.0.0.1:3845/mcp`
  — and the `get_screenshot` / `get_metadata` / `get_design_context` tools appear
  natively; or
- speak JSON-RPC to it directly: `initialize`, then `notifications/initialized`
  carrying the returned `mcp-session-id` header, then `tools/call`. Responses come
  back as `text/event-stream`, so strip the `data: ` prefix.

Fetching the figma.com URL itself returns nothing — the file is private and the
page is a JavaScript app.

## Carried forward, not yet designed

- **A library of finished games.** The owner's TODO: results of a completed
  game should be saved somewhere viewable rather than discarded by **End game**.
  Out of scope for the first pass — but the save format should not make it
  impossible, so whatever is written should keep the final state rather than
  only a "finished" flag.

## Open questions the design must still answer

- What is written: the whole `GameState` and `segmentStart`, or the seed plus
  the intent log replayed on load? The second is smaller and self-verifying, the
  first is simpler and survives a rules change badly. This is the real design
  decision and has not been made. Either way the save now also carries a **name**
  and a **last-played timestamp**, because the Continue card shows both.
- Storage key and versioning — one key per device, and what happens when a save
  predates a rules change and no longer replays or loads cleanly.
- ~~Whether the lobby's "continue" needs to show anything about the saved game~~
  — answered by the mockup: name, players, last played.
- `src/net/identity.ts` already keeps per-room identity in `localStorage`; a
  second storage module should either reuse its conventions or say why not.
- The three the mockup itself raises: what `New Game` does with a saved game,
  where a game's name comes from, and how a game is abandoned without finishing.
