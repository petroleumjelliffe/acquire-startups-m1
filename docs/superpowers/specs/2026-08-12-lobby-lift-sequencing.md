# Lifting the lobby out — sequencing and rulings

**Date:** 2026-08-12
**Status:** sequencing decided; steps 3–7 each still need their own plan
**Predecessor:** [2026-08-12-lobby-lift-carry-forward.md](./2026-08-12-lobby-lift-carry-forward.md)
**Second consumer:** [railbaron#7](https://github.com/petroleumjelliffe/railbaron/pull/7) — Rail Baron's
local half is built and imports no lobby code yet.

Seven steps, across two repos, to get the lobby living on its own and consumed by both games.
This records the order, the four rulings behind it, and which steps are cheap versus which
need their own design pass.

## The rulings

| Question | Ruling |
|---|---|
| Workspace or separate repos | **Separate repos, lobby as a git submodule.** The owner does not want the two games sharing folders long term. The cost is accepted: every lobby change is commit-in-submodule → push → bump the pointer in each consumer. |
| Shared build artifact or shared source | **Source.** Acquire is React 18.2 and Rail Baron is React 19.2; a built package bakes in one React's JSX runtime and hook types. Source lets each app compile the lobby with its own React. |
| React version | **19 everywhere, Acquire moves first.** Making 19 the baseline removes the dual-React CI job the split would otherwise need, and the upgrade turns out to be a four-dependency bump. |
| Branch point | **`main`, not `revamp/aqua-titanium-reskin`.** The reskin is 12 commits ahead across 31 files and touches none of `package.json`, `src/main.tsx`, `src/net/` or `src/lobby/`. Stacking on it would mean the lobby work cannot merge until a reskin does — the wrong dependency direction. |

**The one overlap with the reskin**, and it is later: step 3 touches
`src/pages/OnlineLobbyPage.tsx`, which aqua also edits by 6 lines. Trivial conflict, and it
vanishes if aqua merges first.

## The risk that is invisible today

**Acquire does not use StrictMode. Rail Baron does.**

So the lobby's sockets, mount effects and subscriptions in `useLobbyRoom` have **never once run
under StrictMode**, and the moment Rail Baron consumes it they will. Double-invoked mount
effects are exactly where socket code breaks: double connect, double join, a rejoin racing its
own token. Rail Baron's `useGame` carries a long comment about that hazard precisely because it
bit them there.

This is why step 2 exists and why it comes before anything is extracted. Finding it in one repo,
with 771 tests and a working by-hand routine, is far cheaper than finding it across a submodule
boundary in a game that has no server yet.

## The order

### Step 1 — React 19 in Acquire · *plan written*

Four dependencies. Nothing to migrate: audited for every React 19 removal
(`ReactDOM.render`, `findDOMNode`, `react-dom/test-utils`, `defaultProps`, `propTypes`, string
refs) and there are **zero hits**. `@testing-library/react` is already on `^16.3.0`, the React
19–compatible line; `@vitejs/plugin-react` 5.2 and `react-router-dom` 7 both support 19.

Plan: [2026-08-12-react-19-baseline.md](../plans/2026-08-12-react-19-baseline.md).

### Step 2 — StrictMode on · *same plan as step 1*

Folded into step 1's plan because the upgrade and the switch want one by-hand pass between them,
not two. Expect it to surface something in `src/net/`; that is the point of doing it.

### Step 3 — `src/lobby/ui/` moves out of the lobby

Its ~580 lines of components are Acquire's screens, not a kit. The whole theming contract is
three CSS variables over hardcoded Tailwind, and Rail Baron has neither Tailwind nor
`className`. Lifting it and then un-lifting it is wasted motion, so it leaves the lobby before
anything is extracted.

Also rewrites `lobby/README.md`, which currently advertises the themeable UI as part of the
contract — a claim that did not survive first contact with a consumer.

**Needs its own plan.** Touches `src/pages/` and the import-boundary test's roots.

### Step 4 — The game supplies the seat-id space

[Issue #13](https://github.com/petroleumjelliffe/acquire-startups-m1/issues/13). A `seatIds` list
or `mintSeatId(taken)` hook on `createLobbyRegistry`, so Acquire keeps `p1..pN` and Rail Baron
passes its six fixed colours. Kills the duplicate-seat-id bug by construction — ids stop coming
from a shrinking array's length — and yields **capacity**, which the lobby has no notion of
today and which step 5 needs.

Before the split, because it changes a public signature both consumers bind to on day one.

**Needs its own plan.** Behaviour-adjacent on the join path; wants a test replaying exactly the
leave-then-join sequence, proven to fail first.

### Step 5 — `LobbyView`

The element-inventory layer: `seats` (occupied *and* empty), `you`, `code`, `canBegin` +
`beginBlocked`, `connection`, `terminal`; and per seat `isYou`, `canRename`, `isHost`,
`connected`. Shapes in the carry-forward doc.

Today every consumer re-derives the same four facts from the raw roster, and cannot derive the
fifth — which seats are empty — because the roster sends only occupied ones.

**Needs its own plan.** Pure, testable without either game's UI, and the thing that makes Rail
Baron's boards `1d`/`1e`/`1f` buildable.

### Step 6 — Reorganise into one prefix

`git subtree split` operates on a single prefix, and the lobby is three directories. To carry
the 12 commits of history out, they first become:

```
packages/lobby/{protocol,server,client}/
```

Imports, the boundary test's roots, and the vitest project globs move with them. Skip this step
and copy files into a fresh repo instead if the history is judged not worth the churn — that is
a real option, not a failure.

**Needs its own plan**, mostly mechanical.

### Step 7 — Split and wire as a submodule

```bash
git subtree split -P packages/lobby -b lobby-only
git submodule add https://github.com/petroleumjelliffe/lobby vendor/lobby
```

Per consumer: add `vendor/lobby` to `tsconfig.include`, point the vitest project globs at it,
rewrite imports, and in Acquire delete the originals. Rail Baron additionally adds
`socket.io-client`, which it does not currently have.

**Four things that will bite:**

- **Each consumer includes only the parts it uses.** Rail Baron has no server; if its
  `tsconfig.include` swallows `vendor/lobby/server/`, `npm run typecheck` fails on a missing
  `socket.io`. `protocol` + `client` only, until it has one.
- **Forgetting to push the submodule first** commits a pointer to a commit that exists on one
  machine, and the repo becomes unclonable for everyone else. Push submodule, *then* bump.
- **Clones and CI need `--recurse-submodules`** / `actions/checkout` with `submodules: true`.
- **Two consumers, one source tree.** With React 19 everywhere (step 1) this stops needing a
  dual-version CI job — which is most of why step 1 is first.

The compensation: each game pins its own commit, so Rail Baron can sit on a known-good lobby
while Acquire's churns.

**Needs its own plan.**

## Then, in Rail Baron

Boards `1d` (online lobby), `1e` (new room) and `1f` (join room) are already designed and
approved in the *Rail Baron Game Board Design* project, so that work has a target rather than a
blank page. Its `Row`/`ScreenDef` model maps onto `LobbyView` directly: a seat becomes a row, the
share link becomes a row, begin becomes a row that is dim until `canBegin`, and each terminal
state becomes a whole `ScreenDef`.

## Still open, and not resolved by this sequencing

- **`1e` shows five seats; both games seat six.** The room code takes a row. Rail Baron's
  saved-game board solved the same squeeze with a summary row; the room board has not.
- **Hosting** — a second Render service is a second paid instance, versus both games' servers in
  one process.
- **Honor-reclaim policy**, and the game-flavoured rejection codes (`notYourTurn` meaning "not
  the host") whose renaming costs a protocol bump.
- **[Issue #14](https://github.com/petroleumjelliffe/acquire-startups-m1/issues/14)** — the
  `RoomRefused` dead end. Rail Baron's approved `1f` has the optional name field that fixes it,
  which argues for building that behaviour into the shared half rather than only into Rail Baron.
- **The name of the lobby repo.** `lobby` is assumed above and is not a decision.
