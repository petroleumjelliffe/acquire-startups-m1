# Prototype refinement workflow — design

How we keep refining the flat-HTML prototype (`prototype/index.html`) efficiently,
and turn that work into durable input for the eventual (hand-written) React port.

## Goals

- Tighten the review loop (top friction: **review handoff**).
- Make the prototype **document its own styles + interactions** so it can guide
  writing improved React components — even though the prototype **code is
  throwaway** (we reimplement in React by hand, not port the HTML/JS).
- A repeatable **look-and-feel** refinement loop.

## Durable vs throwaway

The HTML/JS is throwaway. Three artifacts survive into the React work:

1. **The component gallery** (`galleryHtml()` / `phaseShowcase()`) — code-driven,
   so it never drifts. The living visual + interaction spec.
2. **`DESIGN_PRINCIPLES.md`, slimmed to a decisions log** — the *why* behind
   locked choices (undo-over-confirm, cash-vs-price, brand-vs-share, height
   stability, ticker/emoji decisions). Not a description of current pixels.
3. **`COMPONENT_MAP.md`** (new, thin, grows over time) — each prototype
   atom / panel-state → the React component it should become + notable props and
   interactions. The actual port hand-off.

The gallery is authoritative for *what it looks like*; prose docs cover *why* and
*how it maps to React*. This kills the current drift (both docs already describe a
removed reset button, single-player liquidation, and "planned" work that's built).

## The loop

1. A change lands at the **atom / render-function level** (`brand`, `stockCard`,
   `stockStack`, `cash`, `stagingHtml`, step entry) so it cascades everywhere.
2. The **gallery re-renders every state** — reviewed on one screen instead of
   playing through a turn.
3. Review by **pointing at a named state** (not pasting markup):
   - Cheapest: a **screenshot + one-line pointer**, or just the pointer.
   - When showing a concrete *target* layout: a **file** (`sidebar snippet.html`),
     not the chat box.
   - Pasting HTML into the chat is the fallback for a tiny fragment only.
   - Rationale: we edit source render-functions, so rendered HTML has to be
     translated back to source — a screenshot or a labelled pointer skips that.
4. I apply; the gallery updates itself.

## Gallery upgrade (the core build)

Today the gallery covers **atoms + the active-step per phase**. Extend it to the
**full panel**, and — critically — **group related states adjacently** so
cross-state consistency is reviewable at a glance.

### Coverage to add
- **Step entries**: active vs **completed** version of each phase, side by side
  (place, found, the merger steps, payout, liquidate, buy).
- **Staging**: `empty` · `shares` · `leaving + revert ×` · `net placeholder` ·
  `cart + net`.
- **Merger sequence**: pick-victor → completed "X absorbed Y" → payout (active) →
  payout (completed) → liquidate — as an ordered strip.
- **Liquidation**: queue states (pending / current / done), the sell and trade
  actions, the staged result.

### Comparison-first layout
- Every state has a **stable label** (kebab-case id, e.g. `payout-active`,
  `payout-completed`, `staging-leaving`). Labels are the review vocabulary AND
  the anchor the docs reference.
- Related states render **as a labelled group / row** so "these two should have
  more in common" is a direct instruction against a visible pair. Primary pairs:
  - `*-active` vs `*-completed` for each phase (do they read as the same thing?)
  - the staging variants together (height stability, net treatment)
  - sell vs trade liquidation actions (same visual grammar?)
- A group can carry a one-line **intent note** ("active and completed should read
  identically except for interactivity") so the consistency bar is explicit.

## Review handoff — decided

**Approach A: named gallery states.** Reviews reference a state's label; I keep a
running change-list. Screenshots welcome. The `sidebar snippet.html` file stays
for the occasional exact-target-layout case. No routine HTML pasting.

## Look-and-feel loop

- Aesthetic changes happen at the **atom** level so they propagate; review in the
  gallery's comparison groups.
- Use the **frontend-design** skill for aesthetic direction when a change is about
  overall feel rather than a single fix.
- Honor **panel height stability**: containers don't resize as content updates;
  reveal via transitions (see the height-stability memory / decisions log).

## Doc hygiene (part of this work)

- Slim `DESIGN_PRINCIPLES.md` to the decisions log; delete stale "planned
  refinements" (all built) and any removed-feature descriptions.
- Prune `README.md` drift (reset button, single-player liquidation).
- Add `COMPONENT_MAP.md` seeded with the current atoms + panel states.

## First concrete steps (implementation order)

1. Gallery upgrade: full-panel coverage + stable labels + comparison groups.
2. Prune README / DESIGN_PRINCIPLES drift; convert principles to a decisions log.
3. Seed `COMPONENT_MAP.md`.

(Only step 1 is meaningful code; 2–3 are doc edits.)

## Out of scope

- The React port itself.
- Automated visual/screenshot diffing or a live-reload server (you eyeball).
- Any new game-rule behavior.
