# React app revamp — roadmap design

**Date:** 2026-07-31
**Status:** Approved design, pre-implementation

## Purpose

Bring the prototype's settled design and interaction model into the real app (`src/` + `server/`),
close the two rules gaps that make the game unfinishable, and replace the multiplayer architecture
that makes disconnection recovery unachievable.

This is a **roadmap spec**. It fixes the architecture, the decisions, and the phase boundaries. Each
phase gets its own implementation plan; two phases additionally need their own design pass before
they can be planned (noted in *Deferred to their own specs*).

## Findings that motivate this

Verified against the current tree, not assumed:

| Finding | Evidence |
|---|---|
| **The server is not authoritative.** The client computes the entire next `GameState` and ships it over the wire. | `src/Game.tsx:177,197`; `server/index.ts:299,331` validate only that the sender is *a player in the game* — not whose turn it is, not whether the move is legal |
| **The XState machine is decorative.** Its states mirror `gameState.stage`; every event assigns the client's `newState` and re-routes. `updateGame()` mutates actor context directly, bypassing the machine. | `server/machines/gameRoomMachine.ts:199–210`; `server/gameManagerXState.ts:175` |
| **No per-player projection.** The full state — every hand, the bag order, the seed — is broadcast to every client. Hidden hands are enforced only by the client declining to render them. | `server/index.ts:60,429`; no redaction anywhere in `server/` |
| **No end-game.** `Stage` includes `"end"` but nothing computes it. `>= 11` appears only to block illegal merges; `41` only as a pricing threshold. The sole path to `"end"` is the host pressing a button. | `src/state/gameTypes.ts:14`; `src/state/gameLogic.ts:149`, `:586` |
| **No dead tiles.** No detection of permanently-unplayable tiles, no trade-in. The only match in the engine is a log string. `CLAUDE.md` names this a key concept and `prototype/scenario-dead-tile.html` designs the flow. | `src/state/gameLogic.ts:154` |
| **Tied minority bonus does not split.** The loop pays each tied minority holder the full `price × 5`. | `src/state/gameLogic.ts:726` |
| **Sole holder receives majority only.** `minorityHolders` is derived as holders *strictly below* the majority, so it is empty for a sole holder and no minority is ever awarded. | `src/state/gameLogic.ts:700` |
| **Merger logic has a bug history and thin coverage.** All 8 tests are merger regressions (`Bug Fix #1/#2/#3`). Placement, founding, buying, turn advance, and draw have zero coverage. | `src/state/gameLogic.test.ts` |

The last four are why Phase 0 precedes all UI work: the rules are not "locked", they are merely
much-touched.

Two worries checked and dismissed: `server/games/` is empty, so there is no persisted state to
migrate; and the prototype's pricing and tier tables agree with the engine's, so the UI port
carries no numeric conflict. (`majorityHolderBonus` in `gameLogic.ts:24` is dead — `price * 10` is
computed inline.)

## Decisions

| Decision | Choice |
|---|---|
| Scope of the UI port | **Full replacement.** The prototype's component system, step-stack panel, motion, and final-scoring overlay become the React UI. The modal-driven flow is retired. |
| Undo in pass-and-play | Unchanged from the prototype — snapshot stack, undo over confirm. |
| Undo online | **Segment-scoped staging** (below). No undo-approval-by-other-players; no cross-turn undo. |
| Server authority | **Server-authoritative intents.** Client sends intents; server runs the engine and owns state. |
| Engine sharing | One pure module imported by both sides. No local server process, no duplicated rules. |
| End trigger | **Both triggers, player declares.** Any chain ≥41 *or* every founded chain safe (≥11); the active player *may* end it on their turn, and is never forced to. |
| Build order | Pass-and-play first, online second. |

## The segment-commit model

A turn is not atomic. It is a sequence of **segments**, separated by the points where a *different*
player must act. Within a segment nothing has been shared, so undo is free and purely local. At a
boundary the segment commits and becomes final.

| Segment | Actor | Ends at |
|---|---|---|
| Place tile → found brand / pick survivor | active player | **commit** — this is what opens liquidation |
| Liquidation | each shareholder in turn order, one at a time | **commit per liquidator**; the next cannot start until it lands |
| Buy shares → end turn | active player | **final commit**; turn passes |

When there is no merger the whole turn is a single segment, which is the intuitive "local until the
turn is confirmed" behaviour. The segment model is that idea generalised so mergers — the genuinely
multi-actor phase — do not break it.

Two consequences worth stating:

- **Undo-approval is unnecessary.** It would only apply to rewinding *committed* work, which
  segments make rare, and it blocks on other players being present — which defeats the async-play
  goal in `MULTIPLAYER_ARCHITECTURE.md`.
- **Observers need no special treatment.** Commits are frequent enough that the board never sits
  frozen; each arriving committed segment renders through the step-stack, which is already a turn
  narrative.

## The shared engine

`gameLogic.ts` is already pure and immutable. It moves to a top-level `engine/` imported by both
`src/` and `server/`, so the boundary is explicit rather than the server reaching into `src/` by
relative path. `tsx` and Vite both handle this with no build change; the server already cross-imports
`src/state/gameInit.js` today.

Both sides call the same reducer:

```ts
applyIntent(state: GameState, intent: Intent): GameState   // pure; throws on illegal move
```

- **Pass-and-play** — React calls it in the browser. Undo is retaining the prior state.
- **Online** — the client calls it *optimistically*, only to render the staged segment. It sends the
  intent; the server calls the same function as the authority and broadcasts. The client's copy is a
  prediction, never truth.

```ts
type Intent =
  | { type: 'placeTile';           playerId: string; coord: Coord }
  | { type: 'chooseFoundingBrand'; playerId: string; startupId: StartupId }
  | { type: 'chooseSurvivor';      playerId: string; startupId: StartupId }
  | { type: 'liquidate';           playerId: string; startupId: StartupId; sell: number; trade: number; keep: number }
  | { type: 'buyShares';           playerId: string; picks: StartupId[] }
  | { type: 'tradeInDeadTiles';    playerId: string; coords: Coord[] }
  | { type: 'declareEnd';          playerId: string }
  | { type: 'endTurn';             playerId: string }
```

### Randomness and projection

The RNG cursor (seed + counter) lives **in `GameState`**. This keeps `applyIntent` pure with no
injected dependencies and makes golden games deterministic by construction.

That is only safe alongside **per-player projection**, which does not exist today. Before broadcast,
the server strips from each recipient's copy: `bag`, `seed`/cursor, and every other player's `hand`.
Without this, a client holding the seed can compute the entire bag order. Projection is therefore
not a polish item — it is a precondition of putting the RNG in state, and it is what makes hidden
hands real rather than a client-side courtesy.

Tile draws resolve at end of turn, so the optimistic client simply shows no draw; the drawn tile
arrives with the commit response.

## Golden games

The two bonus bugs exist because the intended rule was written down nowhere except a fixture table
inside a prototype spec. Golden games fix that: each is a **named scenario with an authored starting
position, an ordered intent sequence, and asserted outcomes**, stored as data rather than imperative
test code.

```ts
interface GoldenGame {
  id: string;
  purpose: string;                        // the rule or edge case this pins down
  setup: GameStateFixture;                // authored board/portfolios — not played from turn 1
  steps: Array<{
    intent: Intent;
    expect?: Partial<StateAssertion>;     // stage, cash, portfolios, board, availableShares, log
  }>;
  expectFinal?: FinalScoreAssertion;
}
```

Authored starting positions are essential — a game reaching 41 tiles is unreachable in a
hand-written intent list. `prototype/scenario-win-41.html` already establishes this approach,
building a 40-tile board directly rather than playing to it.

**They serve three consumers**, which is the reason to make them data:

1. Phase 0 engine tests — `runGoldenGame(g)` folds the intents through `applyIntent` and asserts.
2. Phase 1's component catalog — the same fixtures drive scenario pages, exactly as
   `prototype/scenario.js` does today.
3. Phase 3 debugging — replaying a golden game against the server reproduces a protocol bug without
   a live client.

### The catalogue

| # | Scenario | Pins down |
|---|---|---|
| G1 | Baseline turn cycle — found, expand, buy, draw, advance | The entire currently-untested happy path |
| G2 | Two-way merger, distinct majority and minority holders | Bonus math on pre-merger prices, liquidation queue order, 2:1 trade, sell price |
| G3 | **Tied minority** | Splits `price × 5` between them — **currently wrong** |
| G4 | **Tied majority** | Splits `(maj + min)` between them, no separate minority — currently correct, lock it |
| G5 | **Sole holder** | Takes majority *and* minority combined (`Mm`) — **currently wrong** |
| G6 | Absorbed chain with no shareholders | No bonuses, no liquidation round, no crash — named as uncovered by the final-scoring spec |
| G7 | Three-way merger | Absorbed chains processed in order, each with its own payout and liquidation round |
| G8 | Safe-chain protection and dead tiles | Placement joining two safe chains is rejected; the tile is permanently dead; trade-in works |
| G9 | End by 41, declared | Trigger detection, declaration, final scoring — mirrors `scenario-win-41.html` |
| G10 | End by all-safe, declared | The all-safe trigger and its distinct reason string |
| G11 | End condition met, **declaration declined** | Play continues; a later player declares. Proves ending is optional. |
| G12 | Bag exhaustion / hand with no legal tile | Behaviour at the edge of the tile supply |

G3, G4, G5 and G6 are the four cases the final-scoring spec's own fixture table depends on. G3 and G5
should be written **before** their fixes, so they fail first.

## Phases

Each phase names what it deletes, so the window in which two code paths coexist stays visible and
bounded.

### Phase 0 — Extract the engine, make the rules true

No UI. Moves `src/state/*` and `src/utils/gameHelpers.ts` to `engine/`.

**Rules**

- Define `Intent` and `applyIntent` as a thin reducer over the functions that already exist.
- Fix tied-minority split and sole-holder combined bonus.
- Implement dead tiles: detection of permanently-unplayable tiles, and trade-in.
- Add `getEndCondition(state)`, the `declareEnd` intent, and `finalScore(state)` returning exactly
  the props shape the final-scoring spec defines.
- Replace the `(state as any).pendingBonuses` escape hatch with a typed field.
- Build the golden-game runner and the G1–G12 catalogue.

**The engine carries what the UI needs to render**

Phase 1 is blocked on each of these — they are things the prototype renders that the engine cannot
currently express:

| Gap | Change |
|---|---|
| `log: string[]` cannot carry a step stack. The prototype's entries are `{phase, detail, undo}`, each a rewind point (`prototype/components.js:130`); the engine stores formatted strings and `GameLog.tsx` prints them. The step stack is the centrepiece of the new UI. | Log becomes structured entries with a snapshot handle |
| No `ticker`. `$G $S $PP $C $M $Z $W` are settled in `prototype/DESIGN_PRINCIPLES.md` and live in the prototype's `STARTUPS`; `AVAILABLE_STARTUPS` carries only `id` and `tier`. | `ticker` on the startup config |
| Player emoji means different things in each codebase — the prototype gives a fixed avatar *beside* a name (🦊 Alex); `src/utils/emojiNames.ts` generates emoji as randomly-assigned *names*. `Player` has no `emoji` field. | Reconcile the two; add `emoji` to `Player` |
| No next-price computation. `price(value, {next})` renders `$300 ↑ $600` — the price a chain *will* have after this merger or growth. | Expose the post-change price the atom needs |

**Deletes:** `server/gameManager.ts` (dead), `majorityHolderBonus` (dead), the `as any` casts.

**Done when:** G1–G12 pass; the tied-minority and sole-holder tests demonstrably failed before their
fixes; and the four fields above exist with the golden games asserting on structured log entries.

### Phase 1 — Port the component layer

Prototype → React, against **static fixtures only**. No game wiring.

- Atoms: `brand`, `cash`, `price`, `stockCard`, `tile`.
- Containers: `stockStack`, `pile`, `player`.
- Composites: step-stack panel, `stagingZone`, `payoutLines`, `finalScoring`.
- Panel zone order: `stepstack → active → staging → hand → players`.
- `components.css` becomes the app stylesheet, design tokens first.
- Motion tokens from `transitions.js`; `prefers-reduced-motion` respected; panel-height stability
  enforced (panel zones must not resize as content changes — reveal via transition, never layout
  jump).

**The staging zone is UI only.** It is a scratchpad giving players feedback on items moving in and
out — shares and cash. It carries no commitment semantics and is unrelated to segment boundaries; it
is indifferent to whether the underlying data has been applied locally or on the server.

**Board parity.** `Board.tsx` diverges from the prototype in ways that are easy to miss: it renders
coordinates as `{r}-{c}` where the prototype deliberately uses `A1`; it badges the last-placed tile
with the player's **full name** rather than their initial; and it has no chain outlines, no
blocked/dead-tile treatment, and no hover-reveal of coordinates on founded tiles.

**Carried over undone.** Two prototype items are designed but unbuilt *there* too, and land here:
the founding screen grouped by starting price (refinement #3, still a flat row), and the
pass-and-play reveal overlay (built in the prototype, absent from `PassAndPlayPage.tsx`).

Ships a **component catalog route** — the React equivalent of `states.html`, driven by the same
golden-game fixtures. This is what makes "does it look right" verifiable independently of "does it
play right", and it is a workflow already proven in this repo.

**Done when:** every component in the catalog renders at parity with `states.html`, the board parity
items above are closed, and the catalog covers each golden game's terminal state.

### Phase 2 — Pass-and-play on the new stack

The game screen is rebuilt around the step-stack panel and wired to `applyIntent` with the snapshot
undo stack.

- Full turn cycle including **mergers with multiple liquidators**. The prototype's known
  simplification is that liquidation runs only for the active player; that is precisely the
  multi-actor case the commit model rests on, so it must be real here.
- Declare-end affordance and the final-scoring overlay on real `finalScore()` output.
- Dead-tile trade-in surfaced in the panel.

**Deletes:** `BuyModal`, `MergerLiquidation`, `SurvivorSelectionModal`, `FoundStartupModal`,
`DrawModal`, `TilePlacementConfirmModal`.

**Tests:** component-level tests for the step-stack's segment/undo behaviour, plus a driven
end-to-end pass over G2, G7 and G9 through the real UI.

**This is the first point at which the game can be finished.** Today no path to `end` exists.

### Phase 3 — Server authority

- Intents over the wire. The server runs `applyIntent`.
- **Per-player projection** before broadcast (`bag`, seed, other hands stripped).
- `gameRoomMachine` rewritten so its states are commit boundaries and who-we-are-waiting-on:

```
inGame → turn(activePlayerId)
  ├─ placement | foundChoice | survivorChoice   → awaiting active player
  ├─ liquidation                                → awaiting shareholderQueue[i]   ← multi-actor
  ├─ buy                                        → awaiting active player
  └─ endDeclaration (only when a trigger is met)→ awaiting active player
finalScoring → gameOver
```

- Turn-ownership and legality validation server-side.

`GameState.stage` **remains** the engine's phase field — the machine does not duplicate it. The
engine owns *what phase the rules are in*; the machine owns *which segment is open and whose input
is awaited*. Conflating the two is what made the current machine redundant.

**Deletes:** the `newState` payloads on `stateUpdate` and `tilePlacement`; the
`snapshot.context.gameState = state` bypass; the `routing`-mirrors-`stage` states.

**Tests:** golden games replayed through the socket layer, asserting that the server rejects
out-of-turn and illegal intents rather than trusting them, and that projected state contains no
foreign hands, bag, or seed.

**Cutover:** the frontend deploys to gh-pages against a Render server, so the wire protocol change
must ship server-first with the client following, or briefly break already-open tabs. There is no
persisted game state to migrate.

### Phase 4 — Presence and recovery

Disconnection becomes **presence only**, orthogonal to game state — the game simply waits, which is
what the async-play goal wanted. Reconnect fetches current state, the current segment, and whether
it is your move. Uncommitted local staging is discarded on reconnect; it was never real, which is
the entire point of the model. Includes Render cold-start handling. No turn timeouts.

### Phase 5 — Online UI

Hidden hands under the new component layer (now genuinely enforced by Phase 3's projection), the
step-stack as the spectator view of committed segments, and a `ReconnectionBanner` rework.

## Risks

**`applyIntent` signature churn.** Phase 3 will surface requirements — validation error shapes,
segment identity, projection boundaries — that Phase 0 cannot anticipate, while Phase 2 is already
built on the signature. *Mitigation:* a throwaway server-side spike calling `applyIntent` during
Phase 0, to pin the signature before Phase 2 depends on it. The golden games are the safety net for
whatever churn remains.

**Phase 1 sprawl.** The largest, vaguest phase. `components.js` is small (308 lines) but
`components.css` is 385 and the CSS is the risky half. *Mitigation:* the catalog route is the
acceptance criterion — parity with `states.html`, nothing more.

**Ordering cost.** Disconnection recovery is the stated pain and it lands in Phase 4. This is the
correct technical order — Phases 0 and 3 are what make recovery achievable at all — but it is
deliberately deferred, not overlooked.

## Out of scope

Cross-turn undo; undo-approval by other players; event sourcing; spectator mode.

### Deliberately not ported from the prototype

Listed so these read as decisions rather than omissions.

- **The side-panel / bottom-panel layout toggle.** It existed to make a choice, and the choice is
  made. Not a feature.
- **"Show the same thing to all players — nothing is hidden per-player."** This is listed as an
  interaction principle in `prototype/DESIGN_PRINCIPLES.md`, and Phases 3 and 5 deliberately break
  it. The prototype's principles were written for pass-and-play; the hidden-hand ones do not
  transfer.

## Deferred to their own specs

Neither is a gap in this roadmap; both are genuine design work that must land before the phase that
consumes them.

- **Declare-end affordance and the all-safe reason string** — nothing in the prototype designs a way
  to *offer* ending the game, and the final-scoring spec hardcodes its subhead around
  `Gobble reached 41 tiles`. Needed before Phase 2 can be planned.
- **Lobby and waiting room** — `WaitingRoom.tsx` (468 lines, the largest component in `src/`) and the
  five page components are untouched by the prototype and by every phase here. Needed before
  Phase 5.

One correction to the existing final-scoring spec: it specifies the overlay as **terminal** — no
dismiss, no "New game". Correct for a catalog entry, wrong for a real app, where players need a route
back to the lobby. Phase 2 adds one.

## Verification

The roadmap is satisfied when:

- G1–G12 pass against the engine (Phase 0) and, for G2/G7/G9, through the real UI (Phase 2).
- A pass-and-play game can be played from first tile to final scoring, by both end triggers, with
  ending declinable (Phase 2).
- The server rejects an out-of-turn intent and an illegal intent, and a captured broadcast contains
  no foreign hand, bag, or seed (Phase 3).
- A client killed mid-segment and reconnected resumes at the correct segment with its uncommitted
  staging discarded and no state divergence (Phase 4).
