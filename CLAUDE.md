# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current focus

The **React app revamp**, following the roadmap in
`docs/superpowers/specs/2026-07-31-react-app-revamp-roadmap-design.md`. **Every phase on it — 0
through 5 — is built.** The server is the authority (Phase 3a) and a real client speaks its
protocol (Phase 3b): `src/net/`'s `NetworkSession` wraps the same `GameSession`/`GameScreen`
pass-and-play uses, so two browsers can create a room, join it, and play a game against the server
over real sockets. The legacy modal UI (`src/Game.tsx`, `src/components/`, `src/context/`) is
deleted.

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

**Phase 4's prod debt is paid** (2026-08-07) — `specs/2026-08-07-prod-by-hand-notes.md`. A refresh
mid-turn on Render comes back to the actor's **open draft**, undo and all, and a dropped socket
shows the pill on one side and **the away dot on the other — observed on prod for the first time**.
The draft also stayed private across the drop: the other player's board read `C2: empty` while it
was held uncommitted.

**Still owed:** a recovery *time* — the reconnect beat the first 500ms sample, so there is still no
number — and the clipped away dot, which needs five or six seats. The prod pass was heads-up, so the
disconnected player was the **actor** and rotation kept them visible, which is the case that already
worked.

**The cold-start copy ruling may not be owed at all.** It was raised against copy for a server
*waking up*, which assumed a free instance that sleeps. The service is on `starter` and does not
sleep (see Environment, below), so the routine cold start the copy was written for does not happen.
What remains is **online-but-unreachable** — a deploy restart, or Render being down — which is a
different sentence and a rarer one. Re-ask the question before answering the old version of it.

**Continuing from another machine? Start at `plans/2026-08-07-continuation.md`** — it holds the
verify-merge-deploy steps for the pending branch, the machine-setup gotchas, and the queue.

**The next round is sequenced in `specs/2026-08-07-next-round-sequencing.md`.** **Stages 0–2 are
built and deployed** (2026-08-07): the two-browser full game was driven by hand (a dev-only
seeding route, `POST /dev/rooms`, makes any golden-game state two clicks away in a browser); the
wire and the save record carry versions (`PROTOCOL_VERSION` in `session/protocol.ts`,
`SAVE_VERSION` 5, skew refused with its own `versionMismatch` code and screen, `/health` reports
both); and **pass-and-play persists** — one game per device in `localStorage`
(`src/game/local/localSave.ts`), written at every segment close, resumed from `/pass-and-play`'s
Continue card, cleared only by End game or a confirmed discard.

**Protocol v2 is merged and deployed** (2026-08-07, `aef9428`) — `/health` reports
`protocolVersion: 2`. The board lost its row/column headers, the buy step gained a Pass gate so a
turn cannot end over an empty basket by accident, and the Lobby Flow design landed — in two passes,
not one. The first did Create Room (seats you immediately, no name form; `CreateRoomPage` deleted)
and left **Join Room untouched**, still a separate screen with "Room code" and "Your name" inputs.
An earlier version of this paragraph called that "implemented in full"; it was not, and the owner
found it by hand on 2026-08-07.

The corrections are in
`plans/2026-08-07-lobby-flow-corrections.md`: **New Room and Join Room are one card**
(`online/LobbyCard.tsx`) differing only in whether the code block is typed into or read from;
**no row has a ×** (`Leave` was always the same action — a deliberate deviation from the mockup);
and **nothing asks for a name anywhere**, so `name` is optional on the wire and the server names
an unnamed seat `Player N` from its seat index. `needName` and `JoinForm` are gone; a refused
join gets `RoomRefused` and a retry.

`PROTOCOL_VERSION` stayed 2 through all of that, because v2 was still undeployed and its shape was
therefore free to change. **That window is now closed** — v2 is live, so the next wire change is a
v3 bump and a second cutover.

**A Render deploy is ~40 seconds, push to live** — measured end to end on 2026-08-08
(`dep-d9r8a0rncjis7391usa0`): push returned 01:23:14, the deploy fired one second later, the build
finished at 01:23:32 and it was live at 01:23:53. **39 seconds.** Any note claiming ~6 or ~12
minutes is measuring waiting, not deploying, and is wrong.

**Auto-deploy is on and verified** (`autoDeploy: yes`, `autoDeployTrigger: commit`) — repaired by
the owner on 2026-08-08 after it was found broken, and confirmed by a push that produced a
`trigger: "new_commit"` deploy one second later.

**Check that a deploy fired before timing one.** The v2 deploy is `trigger: "manual"`: the push
before it started nothing at all, and the eleven idle minutes before a human deployed by hand got
written up as deploy duration, along with a "silent /health window" that was really a gap in the
polling loop. `mcp__render__list_deploys` reports the trigger and the true timings; **`/health`
alone cannot tell "still building" from "never started"**, so polling it until it changes measures
an interval and then invites you to attribute it to whatever you assumed.

The GH Pages bundle hash needs the same discipline — it served the old file for ~90 seconds. Read
the version back before believing either half.

**The next finding to build is the turn-order draw** — it resolves instantly for everyone instead
of passing the turn. Designed, not built: `specs/2026-08-07-turn-order-draw-design.md` and
`plans/2026-08-07-turn-order-draw.md`. It is protocol **v3** and wants its own branch off `main`.

**Still open: Stage 3** — the layout gate's flakiness, with a live lead: `verify-layout.mjs`
drives a *persistent* Chrome profile, so every run depends on run history; Stage 2 tripped over
exactly that when the gate's own saved game broke its next run. The PWA's two stated gates
(persistence, protocol version) both now exist. A spectator seat and a panel-only phone view are
wanted together, and are their own design pass. Presence still has two open findings from Stage 0:
the away dot rides a roster row designed to clip, and final scoring has no presence at all.

**Dev surfaces:** `/catalog` is every component state; `/scenarios` loads any golden-game state and
plays on from it, which is how to reach a merger in two clicks rather than several minutes.

Design specs and implementation plans live in `docs/superpowers/{specs,plans}/`. Each phase ends
with a carry-forward doc in `specs/` recording what it hands to the next one — read the newest
before starting work.

## Layout

| Path | What it is |
|---|---|
| `engine/` | The rules. Pure, immutable, no React. `applyIntent(state, intent)` is the single reducer; `history.ts` adds snapshot undo. |
| `engine/golden/` | Golden games G1–G17 (`ALL_GOLDEN_GAMES`) — the executable rules spec, stored as data. Run by `golden.test.ts` against the engine and by `server/goldenSocket.test.ts` over real sockets. |
| `src/game/` | The new component layer (Phase 1b). Pure, props-in, styled through `tokens.ts`. |
| `src/game/catalog/` | `/catalog` route — every component state, mostly replayed from golden games. The acceptance surface. Also `/scenarios`: any golden-game state, playable on from that point. Both lazily routed so the golden data stays out of the main chunk. |
| `session/` | Shared between client and server (Phase 3a). `GameSession` — the local draft/session model — and `protocol.ts`'s wire types (`WireIntent`, `StateMessage`, …). No React, no transport. |
| `src/net/` | The client's half of the wire (Phase 3b). `NetworkSession` — a `GameSession` whose authority is the server: six intents apply optimistically, three (`endTurn`, `tradeInDeadTiles`, `startGame`) wait on a `correction`. `connection.ts` is the socket.io transport, opened lazily on online routes only. `identity.ts` keeps a per-room `{ playerId, token, name }` in `localStorage` so a refresh rejoins the same seat. |
| `server/` | Express + Socket.io. Authoritative over intents as of Phase 3a — runs `applyIntent`, projects state per player before broadcast, rejects out-of-turn/illegal intents. `store.ts` (Phase 4) persists a room's roster, rejoin tokens and last committed state; `rooms.restore()` seats them at boot, before `listen`, forcing every seat disconnected. `recovery.test.ts` kills a server and reboots it against the same store. The XState layer is deleted. |
| `src/pages/` | Routes. `/room/:roomId` is the online game; `useRoom` (in `src/net/`) owns its `connecting → joining → lobby → playing` phase machine, plus `error`, `gone` and `stale`. (`needName` is gone — nothing asks for a name any more.) |
| `prototype/` | The buildless design lab the component layer was ported from. Reference, not a build target. |

**Root-level `*.md` are history, not guidance.** `MULTIPLAYER_ARCHITECTURE.md` and
`XSTATE_REFACTOR_PLAN.md` say so in a banner; `TESTING.md` (drives a deleted `server/test.html`) and
`TESTING_PLAN.md` ("no test suite exists" — there are 664, in 63 files) do not. `README.md` and
`DEPLOYMENT.md` are still current.

## Commands

```bash
npm run dev            # Vite dev server (5173). Pass-and-play, /catalog and /scenarios only
npm run dev:server     # Socket.io server (3001). Needed for anything under /online or /room
npm run dev:all        # both, concurrently — what an online by-hand pass needs
npx vitest run         # full suite
npx vitest run server/recovery.test.ts        # one file
npx vitest run -t 'the roster, the tokens'    # one test by name
npx vitest run --project node                 # engine + session + server only
npm run typecheck      # never run bare `tsc`
npx vite build
npm run check:bundle   # guards vitest and golden data out of the main chunk
npm run verify:layout  # drives a real Chrome over CDP — see the caveat below
```

- **Two vitest projects, and the split is load-bearing.** `node` runs
  `engine/`, `session/` and `server/`; `app` runs `src/` under jsdom with
  `src/test/setup.ts`. `engine`/`session`/`server` run in the *server process* in production, so a
  stray `window.` or `localStorage` there is a production crash that a single jsdom suite could
  never catch. `session/nodeEnvironment.test.ts` asserts that boundary; don't add root-level
  `setupFiles` (vitest 4 merges the array into both projects, silently disarming it).
- **`npm run verify:layout` is intermittently flaky**, project-wide and pre-existing, and **still
  unexplained** — the caveat stands. Treat a green run as weak evidence. It needs Chrome at
  `CHROME_PATH` (defaults to the macOS app bundle) and drives pass-and-play only — presence and
  online states are not on its path.

  Stage 3 (2026-08-08) ruled out more than it found. **Twenty consecutive runs came back green**, so
  it did not reproduce at all. Of four candidate mechanisms: the persistent-profile `localStorage`
  lead the plan was built around is **dead** (Stage 2's `clear()` already covered it); the
  first-page-wins target selection is **dead** (exactly one `type: page` target on a fresh profile
  *and* on the real 285MB one); Chrome's **singleton lock is real** — a second Chrome on the same
  `--user-data-dir` exits and leaves the first holding the port — but a run driving the stale
  browser still passed, because the script navigates and clears storage anyway. A **stale
  `vite --strictPort`** was found the same way and is the more dangerous of the two, since a
  surviving vite from another checkout would let this gate measure the wrong tree while reporting
  green.

  Both hazards are now removed — per-run `mkdtemp` profile, per-run vite port, and
  `--remote-debugging-port=0` read back from `DevToolsActivePort` — which is why two gates can run
  concurrently, and they do. **That is hazard removal, not a fix**: neither mechanism was ever shown
  to turn a run red, so nothing here explains the flakiness, and a green run is no more meaningful
  than it was. The remaining suspect is the fixed `sleep`s, which survived a concurrent double-load
  run without failing.
- **Before any by-hand pass, check which tree is serving.** Vite silently moves to the next free
  port when another checkout already holds 5173, and a Phase 4 round was measured against `main`
  before anyone noticed.

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
- **Prove a new test can fail — by breaking the code and reading real output, never by reading the
  check.** Eleven "hollow gates" have been caught this way and every one was found by running the
  break: a shared temp filename that made a write-ordering test pass by luck, an absence assertion
  looping over an empty array, a mount test satisfied by a `useState` initializer rather than the
  effect it claimed to guard. A green test that could never go red is worse than no test.
- **A measurement you did not measure is the same defect.** Phase 4 wrote up a confident "4–7
  seconds" from an unmeasured gap; against a shared clock it was 98ms.
- **Review the whole branch at the end, not only each task.** Both of Phase 4's worst bugs — a
  dead-looking board after a restart, and one bad save record stopping the server booting — spanned
  two tasks each and survived ten clean per-task reviews.

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
- **Persistence is best-effort and silent by design.** `save()` never rejects, so a commit lost to a
  failed write is unknowable to the room. `SAVE_VERSION` (4) covers the record's shape only —
  `isSavedRoom` trusts `state` past "is an object", so a `GameState` change without a bump is not
  caught. `rooms.restore()` is boot-only: at runtime it would swap live room objects out from under
  their socket bindings.

## Environment and deployment

Client on GitHub Pages under the base path `/acquire-startups-m1` (hardcoded in `vite.config.ts` and
`src/main.tsx`); server on Render, service `srv-d3klnhnfte5s73diht90`, **plan `starter`** (paid) —
*not* free, whatever older notes say. `VITE_SERVER_URL` points the client at a server, defaulting
to `http://<current hostname>:3001` in dev — the hostname, not `localhost`, so a phone on the LAN
works. The server reads `PORT` (3001) and writes rooms to `server/games/`, gitignored.

**Rooms are lost on restart because no disk is attached, not because of the plan.** The service runs
`numInstances: 1` with no `disk` in its details, so `server/games/` lives on the instance's
ephemeral filesystem and every deploy or restart empties it. The gone-room ending is still the
normal case in prod.

**That makes the durable-`RoomStore` item smaller than it was written up as.** It is queued as
"provision Key Value or Postgres and write a second `RoomStore` implementation", which was the right
plan for a *free* instance that cannot have a disk. A `starter` instance can: attaching one would
make the **existing file store** durable with no second implementation at all. `store.ts` staying an
interface is still worth it, but it may not need to be exercised. Worth pricing both before
building either — a disk pins the service to recreate-style deploys and one instance, which it
already is.

**Being a paid instance also means it does not spin down.** Free instances sleep after inactivity;
`starter` does not. This is Render's documented behaviour rather than something measured here (it
would take a 15-minute idle window to observe), but it is why the cold-start story below is
suspect.
