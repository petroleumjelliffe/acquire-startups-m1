# By-Hand Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the thirteen findings from the first real two-player sessions on the merged Phase 3 client.

**Architecture:** No new layers. Every item is a change to an existing component, the shared `GameSession` interface, or (once) the engine's opening deal. The through-line is that Phase 3 replaced a shared device with two independent screens, and several things that were adequate when one person held the phone are not adequate when two people are watching different copies of the same board.

**Tech Stack:** TypeScript ESM, React 18, vitest 4 (`node` project for `engine|session|server`, `app`/jsdom for `src`), Tailwind classes inline, socket.io 4.

**Branch point:** `main` @ `9135482`. Phases 3a and 3b are merged; there is no worktree.

## Global Constraints

- **No `as any`.** Narrow with the engine's type guards (`isStartupId`, …).
- **`prototype/` is untouched.** `engine/` is untouched **except by Task 8**, which is the one rules change here and says so.
- **Test project placement:** tests under `src/` run in the `app` (jsdom) project; tests under `engine/`, `session/`, `server/` run in `node`. Run a single file with `npx vitest --root <repo> run --project app <path>`.
- **Import style follows the neighbouring file:** `src/` extensionless, `server/`/`session/` explicit `.js`.
- **Derive from the engine, never hardcode.**
- **jsdom reports zero for every layout measurement.** Nothing in jsdom may assert a height, a fit, or an overflow — those are settled by `npm run verify:layout` and by hand. Two items here (Tasks 1 and 2) are layout defects that jsdom structurally cannot catch; their tests pin structure only and say so.
- **Every new test is observed failing before it is trusted.** Each task below names the break to apply. A break that turns nothing red is a stop-and-report result, not something to work around. This project has shipped six hollow gates; two were found in the last week, one of them written by the author of this plan.
- **A jsdom-green change can still be wrong in a browser.** The tile-switching bug this plan opens with passed its test and was broken online, because the test drove the local session and the bug lived in the networked one. Where a behaviour differs between `GameSession` and `NetworkSession`, test both.
- **Commands:** `npx vitest run`, `npm run typecheck` (never bare `tsc`), `npx vite build`, `npm run check:bundle`, `npm run verify:layout`. Dev: `npm run dev:all` — and only ever one instance, or the second dies on `EADDRINUSE`.

---

## Already landed

Five of the thirteen are done and on `main`. Recorded here so this plan reads as the whole picture rather than the remainder.

| Finding | Commit | Note |
|---|---|---|
| Switching a placed tile did nothing online | `e1400fd` | Root cause was not the click handling. `undoTo` marks a `NetworkSession` pending and `dispatch` refuses while pending, so consecutive calls dropped the placement. `GameSession` gained `undoThen(stepId, intent)`; locally it is undo-then-dispatch, over a wire the replacement waits for the correction and is abandoned if the undo is refused. |
| Clicking a tile during buy raised an error | `e1400fd` | `onCellClick` is passed only when a placement can succeed; otherwise the tiles are inert, which the Phase 3b affordance work already made honest. |
| Turn toast showed a step that never changed | `9135482` | A watcher's state only advances on commit, so the stage label sat frozen while claiming to be live. Removed; the toast says who is up. |
| "No tile you hold can be played" | `9135482` | Removed. The board and the End turn button say it. The dead-tile explanation stays, because the board cannot show *why* a tile is unplayable. |
| Skip looked like a primary action | `9135482` | Hollow now. |

---

## Open decision, blocking Task 7

**How much history returns to the step stack?** Phase 3b scoped it to the open segment, which was too deep a cut: a watcher cannot see what the last player just did. Three options, and this plan cannot be executed past Task 7 without a ruling:

1. **The whole previous turn, read-only** — every step of the last committed segment, greyed and not undoable, above your own live steps. Precise, and bounded by one segment. *Recommended.*
2. **A one-line outcome** — "Alex founded Messla at E6", the turn collapsed to its result. Smallest, but loses a multi-step turn's detail (a merger is not one line).
3. **Everything, with only the open segment undoable** — the pre-3b behaviour, which is what the owner asked to change in the first place.

---

## Task 1: The panel must reach its own undo during a merger

**Finding:** in a merger the active zone grows — the liquidation queue plus its actions — and the step stack is pushed out of view with no way to scroll back to it. The undo you need is unreachable exactly when a merger makes you most likely to want it.

**Files:** `src/game/panel/Panel.tsx`; test `src/game/panel/Panel.test.tsx`; measured by `scripts/verify-layout.mjs`.

**Interfaces:** no prop changes expected. If one proves necessary, say so rather than widening the component quietly.

- [ ] **Step 1: Reproduce it in a browser first.** `npm run dev:all`, reach a merger with a liquidation queue, and confirm what actually happens: whether the panel scrolls at all, whether the step stack is clipped or merely off-screen, and which element owns the overflow. jsdom will not tell you any of this. Write down what you observed before changing anything.
- [ ] **Step 2:** Fix the overflow so the panel scrolls as one column and every zone is reachable at every stage. The zone order (`stepstack → active → staging → hand → players`) does not change, and a zone reservation is a floor, not a fixed height — a zone may grow to fit a genuinely new row.
- [ ] **Step 3:** A jsdom test pinning *structure* only: at a merger stage every one of the five `data-slot` zones is present and the scroll container is the one element that owns `overflow-y`. State in the test that it cannot prove reachability, because jsdom reports every height as zero.
- [ ] **Step 4:** Extend `scripts/verify-layout.mjs` to walk into a merger and assert the step stack is reachable — a real height, and inside the scrollable region. This is the only automated check that can actually fail on this defect. If the walk cannot reach a merger with the seeds it uses, say so and report it rather than asserting on a state it never visited.
- [ ] **Step 5: Break it** — restore the old overflow — and confirm the `verify:layout` check reports the step stack unreachable. Restore.
- [ ] **Step 6:** `npm run verify:layout`, `npx vitest run`, `npm run typecheck`, commit.

## Task 2: Liquidation options side by side

**Finding:** the sell and trade controls stack vertically and should sit side by side.

**Files:** `src/game/merger/LiqActions.tsx`; test `src/game/merger/LiqActions.test.tsx`.

- [ ] **Step 1:** Lay the two actions out in a row that survives a 320px panel, checked in a browser at 768px and 1440px. Keep the disabled treatment `canSell`/`canTrade` already drive.
- [ ] **Step 2:** The existing tests assert on roles and names; keep them passing rather than rewriting them around the new layout. Add nothing that asserts a width in jsdom.
- [ ] **Step 3:** `npm run verify:layout` — the merger state is one it already walks — plus the suite and typecheck. Commit.

## Task 3: Traded shares appear in the staging pile

**Finding:** trading absorbed shares two-for-one gives you survivor shares, and the staging pile never shows them. You are told what you are giving up and not what you are getting.

**Files:** `src/game/screen/useTurnPanel.tsx` (the `mergerLiquidation` branch); test `src/game/screen/useTurnPanel.test.tsx`.

**Interfaces:** `StagingZone`'s `shares` slot already takes any node; `StockStack` renders a counted stack. No new props expected.

- [ ] **Step 1: Write the failing test.** Drive the liquidation branch to a state with shares traded, and assert the staging zone shows the survivor shares gained — `staged.trade / TRADE_RATIO` of them — alongside the absorbed shares being kept. Derive both counts from `TRADE_RATIO`, never a literal.
- [ ] **Step 2:** Render them. The pile already shows `StockStack id={absorbedId} count={keep}`; the survivor stack joins it.
- [ ] **Step 3: Break it** by rendering only the absorbed stack; confirm the new test goes red. Restore.
- [ ] **Step 4:** Suite, typecheck, `npm run verify:layout` (the pile reservation is exactly what this grows). Commit.

## Task 4: A newly founded brand's shares are badged "new"

**Finding:** the prototype badged the brand founded this turn during the buy step, and the port lost it.

**Files:** `src/game/screen/boardMarks.ts` (or a sibling in `src/game/screen/`), `src/game/screen/useTurnPanel.tsx`; tests alongside.

**Interfaces:** `StockCard` already takes `badge?: string` — no atom change. Produce `foundedThisTurn(state, segmentStart): StartupId | null`.

- [ ] **Step 1: Write the failing test** for the derivation: replay to a state where a brand was founded inside the open segment and assert it is named; assert a brand founded in an *earlier* segment is not. Derive from the log the way `ownerBadges` does — a `Founded a brand` entry at or after `segmentStart` — rather than adding a field to the engine.
- [ ] **Step 2:** Implement, and pass `badge="new"` to that brand's `StockCard` in the buy step.
- [ ] **Step 3: Break it** by dropping the `segmentStart` bound so every founded brand counts; confirm the "earlier segment" case goes red. Restore.
- [ ] **Step 4:** Suite, typecheck, commit.

## Task 5: An "it's your turn" indicator

**Finding:** the toast tells you when someone else is up and says nothing when control arrives, which is the moment that actually needs announcing.

**Files:** `src/game/online/TurnToast.tsx`, `src/game/GameScreen.tsx`; tests in `src/game/online/TurnToast.test.tsx` and `src/game/GameScreen.test.tsx`.

**Interfaces:** `TurnToastProps` gains a discriminator — `mine?: boolean` or a `variant` — rather than a second component, so the two forms cannot drift apart in placement or z-index.

- [ ] **Step 1:** Decide the behaviour and write it down in the component's docstring before coding it: whether the your-turn form persists for the whole turn or announces and fades. A persistent banner over your own board competes with the panel that already says what to do; an announcement that fades is the reason this is a *toast*. Recommendation: it appears when the turn arrives and fades, while the someone-else form persists — because the second is a standing fact and the first is an event. Respect `prefers-reduced-motion`: no fade, just present then gone.
- [ ] **Step 2: Write the failing tests.** As the actor, the your-turn form appears; as a watcher, the other form appears; pass-and-play (`viewerId` absent) shows neither, because the curtain already announces the handoff at full-screen size.
- [ ] **Step 3:** Implement.
- [ ] **Step 4: Break it** by rendering the your-turn form unconditionally; confirm the pass-and-play case goes red. Restore.
- [ ] **Step 5:** Suite, typecheck, commit.

## Task 6: A tile landing on the board

**Finding:** tiles appear instantly, and on someone else's screen a whole turn arrives at once with nothing to draw the eye to what changed.

**Files:** `src/game/atoms/Tile.tsx` or `src/game/Board.tsx`, `src/game/tokens.ts` for the motion token; test alongside.

- [ ] **Step 1:** Use the existing motion tokens rather than a new duration. `prototype/transitions.js` is the reference the token set was ported from.
- [ ] **Step 2:** Animate the placed tile's arrival only — not every cell on every render, which is what a naive CSS transition on the grid produces when a commit replaces the whole board.
- [ ] **Step 3: Respect `prefers-reduced-motion`**, which this project treats as a hard rule: under it the tile appears with no animation at all.
- [ ] **Step 4:** Test the reduced-motion branch (jsdom can assert a class or attribute, not a frame) and state plainly in the test that the animation itself is settled by eye.
- [ ] **Step 5:** By-hand check that a commit carrying several changes does not animate the entire board. Suite, typecheck, commit.

## Task 7: The last completed turn comes back — BLOCKED

**Do not start this task until the open decision above is ruled on.**

**Finding:** scoping the step stack to the open segment means a watcher cannot see what the last player did.

**Files:** `src/game/screen/stepsOf.tsx`, `src/game/GameScreen.tsx`; test `src/game/screen/stepsOf.test.tsx`.

- [ ] **Step 1:** Implement whichever option was chosen. Under option 1, `stepsOf` needs the *previous* segment's start as well as the open one, and entries below `segmentStart` render read-only — `undoable: false` already exists for that.
- [ ] **Step 2:** The existing "drops every step below the open segment" test encodes the current rule and will need rewriting to the new one. Rewrite it; do not delete it.
- [ ] **Step 3: Break it** by dropping the previous segment again; confirm the new test goes red. Restore.
- [ ] **Step 4:** Suite, typecheck, commit.

## Task 8: Deal hands after the turn-order draw — the one engine change

**Finding:** `createInitialGame` fills every hand before setting `stage: "draw"` (`engine/gameInit.ts`), so a player holds six tiles before it is known who plays first. Hands should be dealt once the order is settled.

**Files:** `engine/gameInit.ts`, `engine/intents.ts` (`doStartGame`); tests in `engine/`, plus whatever in `src/` and `server/` assumes a dealt opening hand.

**This is the only task that touches `engine/`.** Treat a golden-game failure as a finding, not an obstacle: the golden corpus is the executable rules spec, and a change that moves it is a rules change that needs saying out loud.

- [ ] **Step 1: Measure the blast radius before changing anything.** Grep for construction of an opening state — `createInitialGame`, `buildFixture` with no explicit `hand` — and list what depends on hands existing at `stage: 'draw'`. `buildFixture` sets hands explicitly, so the golden games are expected to be unaffected; confirm that rather than assuming it.
- [ ] **Step 2: Write the failing test** in `engine/`: at `stage: 'draw'` every hand is empty; after `startGame`, every hand holds `HAND_SIZE` and the bag has shrunk by exactly `players.length * HAND_SIZE`.
- [ ] **Step 3:** Move the deal out of `createInitialGame` and into `doStartGame`, after the order is decided. The draw's own tiles are drawn from the bag first and returned to it (`engine/gameLogic.ts` does this in the legacy path) — preserve whatever the current `startGame` does with them.
- [ ] **Step 4:** Run the **whole** suite. Fix what genuinely depended on the old timing; report anything that looks like a rules change rather than absorbing it.
- [ ] **Step 5: Break it** by dealing at init again; confirm the empty-hands-at-draw test goes red. Restore.
- [ ] **Step 6:** By-hand check that the opening board shows no hand tiles before the draw, in both pass-and-play and online. Suite, typecheck, `npm run verify:layout`, commit.

---

## Verification

This plan is done when:

- All thirteen findings are closed, or explicitly parked with a ruling.
- Every new test has been observed failing, with the break named in its task.
- `npx vitest run`, `npm run typecheck`, `npx vite build`, `npm run check:bundle` and `npm run verify:layout` are green.
- **A full two-browser game has been played to final scoring**, including a merger whose liquidation queue reaches both players, an undo inside a merger (Task 1's finding), a tile switched mid-turn (online, the bug that opened this plan), and a mid-game refresh. This is the pass that found all thirteen of these; it is the only one that has ever found anything here.

## Risks

**Three of these are layout defects, and jsdom cannot see any of them.** Tasks 1, 2 and 6 are exactly the class of change that passes a structural test over a visibly broken page. `verify:layout` and a browser are the gates that matter; a green `vitest` run means nothing for them.

**Task 8 moves the opening deal, and the opening is what every fixture is built on.** The golden corpus should be indifferent because `buildFixture` sets hands explicitly, but "should be" is the phrasing that preceded this project's last two surprises.

**The by-hand session that produced these findings did not finish a game.** Everything past the early middlegame — the second merger, the endgame trigger, final scoring online — remains unobserved by a person. More findings should be expected from the pass this plan ends with, and that is the pass working, not failing.
