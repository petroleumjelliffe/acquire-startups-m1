# Generic lobby extraction — design

**Date:** 2026-08-08
**Status:** Approved design, not yet planned or built
**Depends on:** `revamp/turn-order-draw` merging and its v3 cutover deploying first

## What and why

Extract the lobby — rooms, seats, join/rejoin tokens, presence, rename/leave, and the
screens around them — into a game-agnostic piece, so the owner's future multiplayer
games reuse it instead of rebuilding it. The consumer is future games by the same
owner on the same stack (React, socket.io, Express, Vite); this is not a published
library, and none of the polish one would need (transport-agnosticism, API stability,
docs) is in scope.

**Scope ruling: lobby only.** The authoritative game loop — intents, per-player
projection, segments, drafts/undo, corrections — stays per-game. It is nearly generic
too, but generalizing it would bake this game's segment/draft model in as the required
shape for every future game, and no second game exists to check that against.

**Packaging ruling: extract in place, package later.** The lobby lives in this repo
behind a test-enforced import boundary. No npm package, no monorepo, no second repo
until game #2 exists — at which point extraction is a `git mv` plus a packaging
decision made with real requirements in hand. The severing work (the couplings below)
is identical under every packaging option; only the overhead differs.

**UI ruling: headless contract plus a themeable default kit.** The headless layer
(`useLobbyRoom`, connection, identity, protocol types) is the contract. The existing
components move too, as a default lobby UI a future game uses as-is, themes, or forks.

## Where things live

Three sibling pieces, mirroring the repo's existing shared/client/server convention:

| Path | Contents |
|---|---|
| `lobby/` | Shared wire types: `CreateRoomMessage`, `JoinRoomMessage`, `RenamePlayerMessage`, `JoinedMessage`, `RosterMessage`, lobby event names, lobby rejection codes. Node-safe, no React. Joins the `node` vitest project. |
| `server/lobby/` | Seating, tokens, join/rejoin, rename, leave, presence marking, roster broadcast, "Player N" naming. Mostly today's `server/rooms.ts` minus its game knowledge. |
| `src/lobby/` | Headless client: `useLobbyRoom`, the lobby half of `connection.ts`, `identity.ts`. |
| `src/lobby/ui/` | Default components: `LobbyCard`, `RoomLobby`, `JoinRoomCard`, `RoomGone`, `RoomRefused`, `StaleClient`, `ConnectionStrip`. `TurnToast` stays game-side — it is about turns, not rooms. |

The boundary is enforced the way this repo already enforces boundaries: a test in the
node project asserts that nothing under the three lobby directories imports from
`engine/`, `session/`, or `src/game/`. Per the hollow-gate rule, it is proven by
temporarily adding a forbidden import and watching it fail.

## The protocol split

`session/protocol.ts` currently owns both wires. It splits:

- **`lobby/protocol.ts`** gets the room-management messages and the lobby's own
  rejection codes: `noSuchRoom`, `seatRefused`, `versionMismatch`, `notConnected`.
  The `rejected` channel is typed generically — `{ code: string; message: string }` —
  because the lobby only ever *branches* on its own codes; everything else (engine
  refusals, `undoOutOfSegment`) it forwards opaquely for the game to interpret. That
  is already how `useRoom` behaves today; this names the behavior rather than
  changing it.
- **`session/protocol.ts`** keeps the game wire: `WireIntent`, `StateMessage`,
  `intent` / `undo` / `state` events, `DRAWS`.
- **`PROTOCOL_VERSION` stays owned by the game** and is passed into the lobby's
  join/create calls. Lobby and game deploy together per game, so one number covering
  both wires is correct; a lobby-shape change means the host game bumps. A
  lobby-owned version arrives only if the lobby becomes a real package.

**The refactor is wire-neutral**: no message shape changes, no version bump.
`goldenSocket`, `clientOverWire` and `versioning` passing untouched is the main
correctness gate.

## The server seam

`server/lobby/rooms.ts` becomes generic by making the room's game payload opaque and
inverting the three places it reaches into the game today:

- **Lifecycle.** The lobby owns `'lobby' | 'playing' | 'over'` and the roster
  broadcast. `beginGame` stays a lobby event — the host check and the lifecycle check
  are lobby rules — but what beginning *does* is injected: the game supplies an
  `onBegin(room)` callback that builds initial game state (today: entering the
  turn-order draw). The game flips `playing → over` through a lobby API call when
  scoring ends.
- **Seat bindings.** The lobby owns the socket↔seat binding — it is what tokens and
  rejoin produce. The game's `intent`/`undo` handlers ask the lobby "whose seat is
  this socket" instead of sharing a map. `server/index.ts` stays the composition
  root, wiring both halves onto one socket.io instance.
- **Persistence stays a game concern.** `store.ts` does not move. The lobby exposes
  `snapshotRoster(room)` / `restoreSeats(room, snapshot)`; the game's store keeps
  writing one record per room (roster + tokens + game state), calling those at save
  and at boot exactly where it does today. No storage interface is invented for a
  single implementer.

## The client seam

- **`useLobbyRoom`** is today's `useRoom` minus the session: it owns
  `connecting → joining → lobby` plus `error`, `gone`, `stale`, and exposes `roster`,
  `playerId`, `join` / `begin` / `rename` / `leaveSeat`, and the raw transport. It
  does not know what "playing" means.
- **The game keeps a thin `useRoom`** wrapping it: it listens on `onState` to build
  the `NetworkSession`, and computes the final phase with `stale` / `gone` ranked
  *above* `playing` — so even before the wrapper's effect disposes the session, a
  gone room renders `RoomGone`, never a live-looking dead board. That ordering is
  the ghost of the Phase 4 bug; the plan pins it with a test.
- **`connection.ts`** splits along the seam it already half-has: the lobby connection
  owns the socket plus the lobby sends; the game's `transport` (intent, undo,
  onState) hangs off it, as today.
- **`identity.ts`** moves as-is with one addition: a **key namespace**. Multiple
  games would sit on the same GitHub Pages origin, and `localStorage` is
  origin-scoped, so identity keys carry an app prefix or game #2's room `ABC123`
  collides with this game's.

## The UI kit and theming

The components lose their imports of the game's `tokens.ts`. Theming goes through
**CSS custom properties, not a theme prop**: each component reads a small deliberate
set of `--lobby-*` variables (accent, surface, radius — on the order of a dozen) with
working fallbacks. This game sets them once at its mount point by mapping `tokens.ts`
onto them; a future game themes the same components with one CSS block, or forks the
UI and keeps the headless layer. Copy takes one parameter — the game's display name —
for the few strings that say what is being joined; the rest is already game-neutral.
The seat emoji set from the lobby design ships as the default kit's, overridable via
the theme.

## Testing and migration

- **Sequencing:** after `revamp/turn-order-draw` merges and its v3 cutover deploys.
  That branch touches `protocol.ts` and the join path; rebasing a boundary refactor
  across a protocol cutover is pain for nothing.
- **The gate is the existing suite**, unchanged: `goldenSocket`, `clientOverWire`,
  `recovery`, `lobbySeat`, the page tests — green with no assertion edits. Tests move
  with their files.
- **Two new tests:** the import-boundary test (proven by breaking it), and the
  phase-ranking test on the game's thin `useRoom` (`gone`/`stale` outrank `playing`
  before the session is disposed).
- **Migration order inside the branch:** protocol split first (types only, everything
  still compiles) → server (`rooms.ts` → `server/lobby/` + the `onBegin` inversion)
  → client (`useLobbyRoom` + wrapper) → UI move + theming → boundary test last, since
  it can only pass once everything above it is done.
- **A by-hand pass at the end** — create, join, rename, leave, refresh-rejoin, kill
  the server, two browsers — because by-hand passes are what find bugs here, and this
  refactor walks straight through Phase 4's territory.

## Out of scope

- Generalizing the game transport (intents, projection, corrections, segments).
- Any storage interface beyond the two roster snapshot functions.
- Publishing, monorepo conversion, or a second repo.
- Any wire or behavior change visible to a player.
