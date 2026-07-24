# Acquire — Flat HTML Turn-Flow Prototype

A single self-contained HTML file (`prototype-mock.html`) for iterating on the
UI/layout and turn flow of the Acquire startup-themed board game, **decoupled
from the React app**. Inline CSS + JS, no build step, no dependencies, no server
required.

> Why flat HTML: layout/interaction ideas can be edited and viewed on refresh in
> seconds, instead of the minutes each change costs in the real React app
> (install → dev server → browser automation). Once a direction settles here, it
> gets ported back into the React `/prototype` route (branch
> `prototype/ui-layout-rethink`).

## Run it

```bash
# simplest: just open the file
open prototype-mock.html

# or serve it (clean HTTP origin, refresh to pick up edits)
python3 -m http.server 8777
# → http://127.0.0.1:8777/prototype-mock.html
```

Controls (top bar): **Layout** (side panel / bottom panel), **Pass-and-play
mode** (on/off), **Reset turn**.

---

## What it models

The prototype is a **live, mutable single-turn state machine** — not a set of
static screenshots. You place a tile and it transitions through the real phases
of a turn, computing everything (adjacency, mergers, bonuses, share prices,
conversions, cash) from a small game model.

### Board & pricing
- 9×12 grid, coordinates `A1`–`I12`.
- 7 startups, each on a tier (0–2). Share price is a lookup on **tier × size**:
  - size thresholds `[2,3,4,5,6,11,21,31,41]`
  - per-tier price rows (tier 0 cheapest → tier 2 dearest), e.g. tier 0 =
    `[200,300,400,500,600,700,800,900,1000]`.
- This mirrors the pricing logic in the real `gameLogic.ts` closely enough for
  the numbers on screen to be plausible.

### Starting position (designed to exercise every path)
- Two **equal** size-3 chains: **Messla** `E3–E5` and **ZuckFace** `E7–E9`,
  separated by a single empty **mergeable gap at `E6`**.
- A **lone unaffiliated tile at `G5`** (so a tile placed beside it founds a new
  chain).
- Players: **Alex** ($4,200), **Sam** ($5,800), **Jordan** ($3,100), each holding
  Messla/ZuckFace shares (so payouts, cap tables, and liquidation are meaningful).
- **Alex's hand is hand-picked** so each tile demonstrates a different outcome
  (see use cases below).

### Real logic implemented
- Adjacency-based placement resolution (expand / found / merge / isolated).
- Merger survivor selection incl. **ties**; majority/minority **bonus
  computation** from actual shareholdings; **2:1 trade** conversion; share-price
  recomputation as chains grow.

---

## Use cases (Alex's hand → outcome)

Placing a tile routes to the right phase, then always ends at **Buy**:

| Tile | Placement means | Flow |
|------|-----------------|------|
| `E2` | adjacent to Messla | **expand** → Buy |
| `E10`| adjacent to ZuckFace | **expand** → Buy |
| `G6` | adjacent to lone `G5` | **found** a brand → Buy |
| `E6` | bridges Messla + ZuckFace (equal size) | **merger tie** → choose survivor → payout → liquidation → Buy |
| `A12` / `I1` | touches nothing | **isolated** → Buy |

The **turn-step stack** in the sidebar records each completed step as you go
(e.g. `Placed E6 → merger`, `Survivor: ZuckFace`, `Payout: …`, `Liquidated: …`),
and **End turn** shows a turn summary with a "Start new turn" button.

---

## UI / layout ideas being explored

- **Fixed-viewport, no-scroll board** — the full 9×12 grid always fits; nothing
  scrolls the page.
- **Two layout variants, toggled live** against identical state: board + **side
  panel** (320px column) vs board + **bottom panel** — the core comparison this
  prototype exists to make.
- **Player indicators in the sidebar** — all players with cash; the active player
  is highlighted and shows their holding chips; opponents' holdings stay hidden.
- **Stacked turn phases** — completed steps accumulate as a breadcrumb above the
  current decision, so buying stock still shows the tile you placed and any
  merger result.
- **Tile hand as pills + board highlight** — hand tiles highlight their board
  cells; tap either the pill or the cell to select, then **Confirm placement**.
- **Board legibility** — coordinates on every cell (no dash: `A1` not `A-1`),
  hidden-until-hover on founded-startup tiles so brand color/label reads cleanly.
- **Buy** — tap a share card to stage it as a removable pill; tap the pill to
  unstage; running total + cash-after.
- **Merger tie screen** — each survivor candidate shows the **active player's
  owned shares** in that chain, plus a **"winner's future share price"** preview
  (differs by tier even at equal size).
- **Liquidation** — reuses the purchase-style **pile** metaphor: a **Sell** pile
  and a **Trade 2:1** pile you sort shares into, with two **"you'll receive"**
  cards (cash, and converted survivor stock).
- **Pass-and-play** — a reveal overlay hides the board and shows "Pass to
  <player>" until that player taps to reveal.

---

## Known simplifications (open items)

- **End turn restarts the same Alex turn** (for repeatable demoing) rather than
  advancing to Sam/Jordan.
- **Liquidation runs only for the active player**; other shareholders of an
  absorbed chain don't yet get their own liquidation step.
- Single starting setup (2-way merge). The model handles ties generally; a
  scripted 3-way merge setup was explored earlier and can be re-added.
- All numbers are mock; this file is **throwaway/exploratory** and intentionally
  not wired to the real `gameLogic.ts`.

---

## Relationship to the real code

- This branch contains **only** the flat prototype and this brief — none of the
  React app.
- The real, typed React prototype (the `/prototype` route, mock `GameState`
  scenarios, side/bottom layout components, per-stage panels) lives on branch
  **`prototype/ui-layout-rethink`**.
- Live hosted copy of this flat prototype:
  <https://claude.ai/code/artifact/5b0d6c3b-1f7e-4834-bb20-f2842d948030>
