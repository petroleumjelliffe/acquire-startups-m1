# Catalog → Claude Design Sync — Design Spec

**Status:** Designed, not built. Written 2026-08-07; revised 2026-08-09 (gate-logic fixes: the
treated ledger, the offline check; lobby paths post-extraction; turn-order draw states; shared
Chrome launcher). Companion to `plans/2026-08-07-aqua-titanium-reskin.md` (which can consume this
as a Task 0, or it can run independently before/alongside any reskin work).

## Problem

The Claude Design project (`cce01fd6-ffa9-4e50-8457-f01d6d376666`, "Board 10a Aqua Titanium" and
siblings) is a hand-authored parallel universe: mockups with invented data (`board-data.js` fakes
six chains — ZOOB, FLPR, MNCH… — none of them real tickers) and only the happy path. If a reskin
is judged against those mockups, it will skin the happy path and miss exactly the states the
catalog exists to protect: blocked tiles, sold-out buy rows, the four-liquidator merger, staging
parity across steps.

Meanwhile the app already has the state inventory, executable: `/catalog` renders every component
state *replayed from golden games* (14 sections in `src/game/catalog/sections.tsx` today), and it
is already the acceptance surface. The gap is purely that the design project can't see it.

## Goal

Make the running app the single source of truth for "which states and screens exist," and make
the Claude Design project a rendered, always-current mirror of it — so that design-system
coverage is a **mechanical diff between enumerable lists**, not a judgment call.

## Non-goals

- Not a visual-regression system. Snapshots are for the design pane's eyes, not pixel-diff gates.
- Not re-editable design sources. The mockups stay hand-authored; the synced cards are renders.
- Not a CI gate (v1). The generator is rerunnable and idempotent; a human runs it. See Caveats.

## Design

Five parts, in dependency order, plus the ledger that ties them together.

### 0. The ledger: `docs/design-sync/manifest.json` (committed)

One committed JSON file records the sync's state, written by the push procedure (§3) and read by
the check (§4). It is the design project's state made inspectable from the repo, with no MCP
access needed:

```json
{
  "pushedAt": "2026-08-09T...",
  "current": ["tiles-vocabulary", "merger-pick-victor", "..."],
  "treatments": { "aqua": ["tiles-vocabulary", "..."] },
  "treated": { "aqua": ["tiles", "buy-rows"] }
}
```

- `current` — slugs whose rendered card exists in the design project.
- `treatments.aqua` — slugs that have a hand-authored `aqua/` treatment card.
- `treated.aqua` — **sections whose reskin has landed in the app.** Once a section is treated,
  its `current/` cards *are* the aqua renders, its treatment cards retire, and the coverage
  requirement for it is satisfied by definition. This is what keeps the gate meaningful after the
  loop closes (§5) instead of red forever.

### 1. The catalog defines the inventory

`sections.tsx` is the canonical list of card-worthy states. Three changes make it machine-usable:

- **Slugs as committed data.** `src/game/catalog/slugs.json` is a flat JSON list of every card
  slug (kebab-case, section + variant: `tiles-vocabulary`, `merger-pick-victor`,
  `staging-buy-step`). `sections.tsx` imports it and stamps `data-catalog-card="<slug>"` on each
  card root; node scripts read the same file directly. One source, importable from both worlds —
  no grep over `.tsx`, so the inventory survives sections being split across files later.
- **A parity test.** An app-project test renders the catalog and asserts: every declared slug
  appears in the DOM exactly once, and every `data-catalog-card` in the DOM is declared. This is
  also where uniqueness is enforced. Prove it can fail both ways before trusting it (delete a
  slug from the JSON; add an undeclared attribute) — per the house rule, by running the break and
  reading real output, since eleven hollow gates have been caught here exactly that way.
- **Close the known blind spots.** States not reachable from `/catalog` are invisible to the
  pipeline, so the enforced discipline becomes: *a state that isn't in the catalog doesn't exist
  for design purposes.* Sections to add (this is the real work; the sync is plumbing):
  - Lobby (these live in the generic kit `src/lobby/ui/`, themed via the three `--lobby-*`
    variables; snapshot them **as the game mounts them**, variables and seat emoji applied, since
    that composed render is what players see): `LobbyCard` in both modes (code typed vs. code
    shown), `JoinRoomCard`, `RoomLobby` with seats filled/empty, `ShareRoomButton` (copied-state
    included), `ConnectionStrip`, `RoomRefused` + retry, `StaleClient` (`versionMismatch`),
    `RoomGone`.
  - **Turn-order draw** (live on prod as v3, and easy to repaint blind): mid-draw with some seats
    resolved, the last-drawer-wins commit case, and the winner-announcement step (an owner ruling
    — announced, not merely arrived at). Plus `TurnToast`, the hand-off toast.
  - Setup: `LocalSetupScreen` / `PlayerRoster` / `SeatRow` states, including the Continue card.
  - Presence: the seat pill, the away dot (including the clipping case — Stage 0's open finding),
    the disconnect toast.
  - Final scoring — with presence (known gap: final scoring has no presence at all today).
  - Online-only phases: `connecting`, `resume` (open draft restored), `error`, `gone`.
  - `RevealOverlay`.

### 2. Snapshot each card from the running app

A generator script (working name `scripts/catalog-snapshots.mjs`) drives a real Chrome over CDP.

**It reuses `verify-layout.mjs`'s launch harness rather than growing a second one.** Since the
2026-08-08 fix, verify-layout already does everything the generator needs at launch: a `mkdtemp`
profile per run, its own vite port, `--remote-debugging-port=0` read back from
`DevToolsActivePort`, `CHROME_PATH` resolution. Extract that into a shared module (working name
`scripts/lib/chrome.mjs`), have both scripts import it, and the generator inherits the
concurrent-runs property for free. Two hardened launchers would drift; one is a maintained asset.
This also answers "which tree is serving" — the harness owns its vite instance, so the generator
can never screenshot another checkout.

Capture rules:

- **Pinned viewport widths: 1280px, and 900px as a follow-up** (not v1). Tile labels size in
  `cqi` and the panel narrows below 1024, so a snapshot is only reproducible at a pinned width —
  and one desktop width hides exactly the squeezed states a reskin gets wrong. Ship 1280 first;
  add 900 as `<slug>@900` cards once the pipeline is boring.
- For each `[data-catalog-card]` element on `/catalog`: a screenshot PNG, one file per slug, into
  a gitignored `snapshots/` directory, plus `snapshots/manifest.json` listing
  `{ slug, section, pngPath, width, height, domHash }`.
- **`domHash` is the change signal, never pixels.** PNGs are not byte-stable across runs or
  machines (anti-aliasing, GPU), so pixel comparison would report churn forever. The hash is of
  the card's serialized subtree + the computed `font-family`/dimensions of its root — enough to
  say "this card's content changed since the last push." Where hashes are unchanged the push may
  skip the card; where in doubt, re-pushing everything is correct and merely slow, and the first
  implementation may simply always re-push.
- Determinism: wait for `document.fonts.ready`, emulate `prefers-reduced-motion: reduce` (the app
  already respects it by skipping enter animations). Any remaining run-to-run DOM difference is a
  generator bug.

Screenshots, not serialized HTML, for v1: computed-style inlining loses hover/focus states and
`cqi` scaling, and the design pane needs to *show* states, not be re-editable. (v2 could add
style-inlined HTML per card if editable references turn out to be wanted.) Hover/focus/active
variants need their own catalog cards to be seen at all — the catalog already leans this way.

### 3. Push snapshots into the Claude Design project

Agent-driven, via the DesignSync MCP tool, following its required ordering (`list_files` →
`finalize_plan` → `write_files`):

- Each card is written to `current/<section>/<slug>.html` — a minimal HTML wrapper embedding the
  PNG, with the first line `<!-- @dsCard group="Current — <Section>" -->` so the Design System
  pane indexes it without explicit registration.
- Groups mirror catalog sections: Current — Tiles, Current — Buy rows, Current — Panel,
  Current — Merger, Current — Lobby, Current — Turn order, …
- The hand-authored mockups stay where they are, untouched. The pane then shows two populations
  side by side: aspirational (Board 10a/10b/10c) and real-as-rendered-today.
- Writes are incremental by slug where `domHash` says a card changed (never a wholesale replace —
  DesignSync's own contract); a full re-push of all cards is always a safe fallback.
- **The push's last step writes the ledger** (§0): `current` from what was written, `treatments`
  and `treated` carried forward (updated only by the workflows below). The ledger commit is part
  of the push procedure — a push that doesn't update the ledger didn't happen, as far as the
  check is concerned, and the check will say so.

### 3b. Treatment cards: Claude Design generates them (owner decision, 2026-08-09)

The `aqua/<section>/<slug>.html` cards are **generated by Claude Design inside the design
project**, from the prompt in the Appendix, after the first `current/**` push lands. The pairing
rule stands: Board 10a is the *style* source, each `current/` card is the *state* source, and a
treatment card answers "this exact state, in the new skin" — same data, same layout, new paint.
One treatment card per current card, path-mirrored (`current/tiles/tiles-vocabulary.html` →
`aqua/tiles/tiles-vocabulary.html`), so the ledger's `treatments.aqua` list can be read straight
off the design project's file listing after the run. Treatment cards are DC HTML like the
mockups; the check cares that they exist per slug, not how polished they are.

### 4. Coverage is a diff — offline, no MCP required

`scripts/check-design-coverage.mjs` compares committed data only, so it runs anywhere
(`npm run design:check`, exit 0/1 + table):

- **App side:** `src/game/catalog/slugs.json` (§1).
- **Design side:** `docs/design-sync/manifest.json` (§0).

| Finding | Meaning |
|---|---|
| Slug in `slugs.json`, not in `current` | Sync stale — run snapshot + push |
| Slug in an **untreated** section, not in `treatments.aqua` | Reskin coverage gap — the actual gate |
| Slug in a **treated** section still in `treatments.aqua` | Retirement missed — delete the treatment card, update the ledger |
| Treatment slug not in `slugs.json` | Scope creep (ticker strip, ACTIVITY feed) **or** a missing catalog section — either way, surfaced |

The treated-section scoping (rows 2–3) is what keeps the gate from going red forever once
sections start landing: a landed section owes no treatment cards, because its `current/` renders
*are* the treatment now.

**Prove the gate can fail before adopting it** — one break per row: remove a slug from
`current`, remove a treatment entry for an untreated section, leave a stale treatment on a
treated section, add a treatment for a slug that doesn't exist. Run the check after each, read
the red output. A checker that can't go red certifies nothing.

### 5. The loop closes through the catalog

When a reskin task lands in the app, for each section it painted:

1. Re-run the generator; re-push — the `current/` cards become the aqua-skinned renders.
2. Delete that section's `aqua/` treatment cards in the same DesignSync plan.
3. Move the section into `treated.aqua` and drop its slugs from `treatments.aqua` in the ledger.
4. `npm run design:check` — green is the definition of that section being done.

End state: every section treated, `treatments.aqua` empty, the design project a rendered mirror
of the catalog. Drift stays impossible only as long as re-running stays cheap, which is why
snapshot + push must remain a short, boring, idempotent ritual.

**Mockup retirement is part of the end state.** Once 10a has won and the loop has closed, Board
10b ("Blue Gloss") and 10c ("Perpetual Beta") — and eventually 10a itself — become the new
"parallel universe" the Problem section complains about. Move them to an `archive/` folder in the
design project (or delete them) in the final push, deliberately, so the pane's only populations
are the mirror and whatever the *next* exploration hand-authors.

## Interfaces (proposed, for the plan that builds this)

- `src/game/catalog/slugs.json` — the inventory; imported by `sections.tsx`, read by scripts.
- `scripts/lib/chrome.mjs` — launch harness extracted from `verify-layout.mjs`, shared by both.
- `npm run design:snapshot` → `scripts/catalog-snapshots.mjs` → `snapshots/*.png` +
  `snapshots/manifest.json` (gitignored).
- `npm run design:check` → `scripts/check-design-coverage.mjs` → exit 0/1 + table; reads only
  committed files, so it needs neither a browser nor MCP.
- Push is agent-driven (DesignSync requires a finalized plan and a permission prompt), a
  documented procedure rather than an npm script: snapshot → `list_files` → `finalize_plan`
  (writes `current/**`, localDir `snapshots/`) → `write_files` with `localPath` per card →
  **write and commit `docs/design-sync/manifest.json`**.

## Caveats, stated up front

- **Second Chrome-driving script.** The first one was *believed* famously flaky; on 2026-08-08 the
  cause turned out to be the gate's own pixel rounding, not Chrome — see `CLAUDE.md` under
  Commands. So the risk this bullet guards against is smaller than it looked. **The transferable
  lesson: compare measurements with a tolerance, and never round before comparing** — for this
  pipeline, the corollary is §2's rule that change detection keys on a DOM hash, never on pixels.
  The launch hazards verify-layout did have (profile lock, stale vite port) are inherited-solved
  by sharing its harness rather than re-solving them. Still fair to treat the generator as
  rerunnable tooling rather than a CI gate until it has a track record.
- **The ledger is trust, not proof.** `docs/design-sync/manifest.json` says what the last push
  *claims* the design project holds; a hand-edit in the claude.ai/design UI (a card deleted in the
  pane) desyncs it silently until the next push reconciles. Acceptable for v1 — the push procedure
  starts with `list_files`, so every push is also an audit — but worth remembering when the check
  is green and the pane looks wrong: believe the pane.
- **Fidelity limits.** Screenshots capture one state at one width (two, once `@900` ships);
  hover/focus/active variants need their own catalog cards to be seen at all.
- **The catalog's blind spots are the pipeline's blind spots.** Section 1's additions are load-
  bearing; skipping them ships a coverage checker that certifies incomplete coverage.
- **Slug stability.** A slug rename orphans a design card and a ledger entry. The check catches
  it (rows 1 and 4 both fire), which is acceptable — but renames should be rare and intentional.

## Sequencing

1. `slugs.json` + `data-catalog-card` stamping + the parity test — **broken both ways on purpose,
   red output read** — then the new catalog sections (lobby, turn-order draw, setup, presence,
   final scoring, online phases, RevealOverlay).
2. Extract `scripts/lib/chrome.mjs` from `verify-layout.mjs`; verify-layout still green ×2 after
   the refactor (it is the proven consumer; don't break it to help its sibling).
3. Generator script at 1280px.
4. First push; eyeball the pane; commit the first ledger.
5. Coverage checker — then **break it four ways per §4 and read each failure** before calling it
   a gate.
6. Adopt as the per-task done-check for the aqua reskin plan (its Tasks 3–8 each finish with the
   §5 ritual: re-push, retire, mark treated, `design:check` green).
7. Later, once boring: the 900px pass; mockup archival rides the final section's push.

## Appendix: the treatment-generation prompt for Claude Design

Run this **in the claude.ai/design project** (`cce01fd6-ffa9-4e50-8457-f01d6d376666`), only
*after* the first `current/**` push exists. Paste as-is:

> Every file under `current/<section>/<slug>.html` in this project is a screenshot of one real
> state of the game, captured from the running app. For **each one**, create
> `aqua/<section>/<slug>.html`: that exact state re-rendered in the visual language of
> `Board 10a Aqua Titanium.dc.html`.
>
> Rules:
> 1. **State from the current card, skin from 10a.** Copy every label, coordinate, ticker, count,
>    price and player name from the current card verbatim — invent nothing, drop nothing. Keep
>    the current card's layout and element arrangement; 10a contributes only paint: Lucida Grande
>    stack, gradient/gloss tiles, lozenge controls, pinstripe/well/parchment surfaces.
> 2. **One output card per current card, path-mirrored.** Do not merge states into composites, do
>    not add states that have no current card, and do not add 10a's layout inventions (ticker
>    strip, ACTIVITY feed, header chips row).
> 3. **Color reservations:** blue only for hand/selection, green only for cash — no chain may use
>    either. Chain hue families: Gobble red, Scrapple orange, WrecksonMobil amber, PaperfulPost
>    lime, ZuckFace teal, Messla purple, CamCrooned pink — each as a two-stop gloss gradient in
>    10a's style.
> 4. **First line of every file:** `<!-- @dsCard group="Aqua — <Section>" -->` where `<Section>`
>    matches the current card's group name.
> 5. **Semantics must survive the paint:** the placed-this-turn outline, chain group outlines,
>    the 🚫 blocked overlay, disabled/sold-out dimming — if the current card shows a state cue,
>    the aqua card must show an equivalent cue.
> 6. When done, output two lists: every `aqua/` file you created, and every `current/` card you
>    could **not** treat, with one line on why. Do not silently skip anything — an honest gap
>    list is worth more than a complete-looking one.

The two lists in rule 6 are what feed `treatments.aqua` in the ledger; the "could not treat"
list goes straight into the reskin plan as open design questions.
