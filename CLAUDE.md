# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current focus

The **React app revamp**, following the roadmap in
`docs/superpowers/specs/2026-07-31-react-app-revamp-roadmap-design.md`. Phases 0 through 2b are
done — pass-and-play is playable end to end and a game can be finished and scored. **Phase 3a**
makes the server the authority: intents over the wire, per-player projection, and the XState layer
deleted. It ships headless; **Phase 3b** brings the client to it.

Design specs and implementation plans live in `docs/superpowers/{specs,plans}/`. Each phase ends
with a carry-forward doc in `specs/` recording what it hands to the next one — read the newest
before starting work.

## Layout

| Path | What it is |
|---|---|
| `engine/` | The rules. Pure, immutable, no React. `applyIntent(state, intent)` is the single reducer; `history.ts` adds snapshot undo. |
| `engine/golden/` | Golden games G1–G16 — the executable rules spec, stored as data. Run by `golden.test.ts`. |
| `src/game/` | The new component layer (Phase 1b). Pure, props-in, styled through `tokens.ts`. |
| `src/game/catalog/` | `/catalog` route — every component state, mostly replayed from golden games. The acceptance surface. |
| `src/components/`, `src/Game.tsx` | **Legacy.** Modal-driven UI, still serving `/room/:roomId`. Do not build on it. Deleted in Phase 3/5, not before — online depends on it. |
| `server/` | Express + Socket.io + XState. Not authoritative yet; that is Phase 3. |
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
  undo boundary, the pass-the-device boundary, and (in Phase 3) the commit boundary.
- **Panel-height stability**: a zone's reservation is a *floor*, not a fixed height. Reserve enough
  that ordinary content changes move nothing (the point is to stop labels and controls jittering
  between transitions). Growing to fit a genuinely new row is fine — mark the zone
  `data-may-grow="true"` and let it adjust gracefully; the panel scrolls. What is not fine is a zone
  changing height *without* gaining a row, or clipping its own content. `npm run verify:layout`
  checks all three on a real page.
- Panel zone order: `stepstack → active → staging → hand → players`.
- Respect `prefers-reduced-motion` (skip enter animations).
