# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current focus

The **React app revamp**, following the roadmap in
`docs/superpowers/specs/2026-07-31-react-app-revamp-roadmap-design.md`. **Phases 0 through 3b and 5
are done.** The server is the authority (Phase 3a) and a real client speaks its protocol (Phase
3b): `src/net/`'s `NetworkSession` wraps the same `GameSession`/`GameScreen` pass-and-play uses, so
two browsers can create a room, join it, and play a game against the server over real sockets. The
legacy modal UI (`src/Game.tsx`, `src/components/`, `src/context/`) is deleted.

**Phase 5 (2026-08-06) closed twenty-six findings from playing it by hand** —
`docs/superpowers/plans/2026-08-06-phase-5-online-ui.md`. Most of the panel changed: the step stack
attributes every step and shows the previous turn, the staging piles are removable, the active
zone's *height* is the panel's one animation, and the founding step is one row carrying a share
certificate. Read that plan before changing anything in `src/game/panel/` — several of its tasks
reverse decisions the 3b carry-forward describes as shipped.

**Still not done, and it is the thing that finds bugs here:** a full two-browser game to final
scoring, including a merger whose liquidation queue reaches both players. Every one of those
twenty-six findings came from a by-hand pass; none came from the suite.

**Phase 4 (2026-08-07) is built** — presence and recovery. A game now survives a page refresh, a
dropped socket and a server restart, and all three were driven by hand in real browsers as well as
tested. `server/store.ts` keeps the roster and its rejoin tokens and is read back before `listen`;
a `resume` state reason hands a reconnecting actor its own **open draft** rather than the state at
the start of their turn, which is the bug the phase turned out to exist for. A room the server does
not have says so by name; a dropped player shows on the seat and in the toast. See
`docs/superpowers/specs/2026-08-07-phase-4-carry-forward.md`, and
`2026-08-07-phase-4-by-hand-notes.md` for the five findings a human found that 661 tests could not.

**Still owed by Phase 4:** the same three scenarios by hand **on prod** (everything so far is
local), and a ruling on the cold-start copy, which still says "waking the server" when the real
condition is online-but-unreachable.

**Dev surfaces:** `/catalog` is every component state; `/scenarios` loads any golden-game state and
plays on from it, which is how to reach a merger in two clicks rather than several minutes.

Design specs and implementation plans live in `docs/superpowers/{specs,plans}/`. Each phase ends
with a carry-forward doc in `specs/` recording what it hands to the next one — read the newest
before starting work.

## Layout

| Path | What it is |
|---|---|
| `engine/` | The rules. Pure, immutable, no React. `applyIntent(state, intent)` is the single reducer; `history.ts` adds snapshot undo. |
| `engine/golden/` | Golden games G1–G16 — the executable rules spec, stored as data. Run by `golden.test.ts`. |
| `src/game/` | The new component layer (Phase 1b). Pure, props-in, styled through `tokens.ts`. |
| `src/game/catalog/` | `/catalog` route — every component state, mostly replayed from golden games. The acceptance surface. Also `/scenarios`: any golden-game state, playable on from that point. Both lazily routed so the golden data stays out of the main chunk. |
| `session/` | Shared between client and server (Phase 3a). `GameSession` — the local draft/session model — and `protocol.ts`'s wire types (`WireIntent`, `StateMessage`, …). No React, no transport. |
| `src/net/` | The client's half of the wire (Phase 3b). `NetworkSession` — a `GameSession` whose authority is the server: six intents apply optimistically, three (`endTurn`, `tradeInDeadTiles`, `startGame`) wait on a `correction`. `connection.ts` is the socket.io transport, opened lazily on online routes only. `identity.ts` keeps a per-room `{ playerId, token, name }` in `localStorage` so a refresh rejoins the same seat. |
| `server/` | Express + Socket.io. Authoritative over intents as of Phase 3a — runs `applyIntent`, projects state per player before broadcast, rejects out-of-turn/illegal intents. `store.ts` (Phase 4) persists a room's roster, rejoin tokens and last committed state; `rooms.restore()` seats them at boot, before `listen`, forcing every seat disconnected. `recovery.test.ts` kills a server and reboots it against the same store. The XState layer is deleted. |
| `prototype/` | The buildless design lab the component layer was ported from. Reference, not a build target. |

## Commands

```bash
npm run dev            # Vite dev server
npx vitest run         # full suite (engine in node, src/server in jsdom)
npm run typecheck      # never run bare `tsc`
npx vite build
npm run check:bundle   # guards vitest and golden data out of the main chunk
```

## Working rules

- **Derive from the engine, never hardcode.** Every price, total and board position in the UI comes
  from replayed state. Phase 0 shipped a wrong-number bug from a copied figure; the catalog exists so
  that cannot recur.
- **No `as any`.** Narrow with the engine's type guards (`isStartupId`, …).
- **Never import `engine/golden/runner` from `src/`** — it pulls vitest into the bundle. Use
  `replayGoldenGame`.
- **Verify in a browser.** jsdom reports zero for all layout, so a structural test can pass while the
  thing it guards is visibly broken. This has happened. Measure real pages for anything about size,
  fit or overflow.

## Key concepts

- **Safe chain** = ≥11 tiles; two safe chains cannot merge. A tile whose placement would join two
  safe chains is permanently unplayable — a dead tile.
- **Segment** = a run of steps by one actor, ending when a *different* player must act. It is the
  undo boundary, the pass-the-device boundary, and (Phase 3a) the server's commit boundary — a
  segment close is what turns a private draft into `room.committed()` and broadcasts it.
- **Panel-height stability**: a zone's reservation is a *floor*, not a fixed height. Reserve enough
  that ordinary content changes move nothing (the point is to stop labels and controls jittering
  between transitions). Growing to fit a genuinely new row is fine — mark the zone
  `data-may-grow="true"` and let it adjust gracefully; the panel scrolls. What is not fine is a zone
  changing height *without* gaining a row, or clipping its own content. `npm run verify:layout`
  checks all three on a real page.
- Panel zone order: `stepstack → active → staging → hand → players`.
- **The panel has exactly one animation**, and it is the active zone's *height* (`panel/StepReveal`).
  The step stack has none: it moves because the zone below it grows, so its bottom edge is that
  zone's top edge. Two earlier attempts animated the contents instead, both passed their gates, and
  both were wrong — if a transform appears on the step list again, that is the mistake returning.
- Respect `prefers-reduced-motion` (skip enter animations).
