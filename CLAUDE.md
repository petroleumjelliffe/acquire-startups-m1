# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current focus

UI prototyping only. Work happens in **`prototype/`** — buildless HTML/CSS/JS, no dev server, no React. Edit a file and refresh the browser. The React app (`src/`) and multiplayer server (`server/`) are out of scope for now; leave them untouched unless asked.

## The `prototype/` lab

Standalone pages sharing `components.css` + `components.js` (the single source of truth for atoms and panel/board renderers). Ideas settle here before being ported back into React.

- `index.html` — live single-turn engine (its own small game model: 9×12 board, coords `A1`–`I12`, 7 startups, share pricing on size × tier). Panel render order: `stepstack → active → staging → hand → players`.
- `states.html` — fixture catalog of panel/board states (`FIX_BOARD` builds boards from chain lists).
- `motion.html` + `transitions.js` — motion lab.
- `components.js` / `components.css` — shared renderers/styles.
- `README.md`, `DESIGN_PRINCIPLES.md` — how it works and its design goals.

Design specs + plans live in `docs/superpowers/{specs,plans}/`.

## Run it

```bash
open prototype/index.html            # simplest
python3 -m http.server 8777          # or serve, then http://127.0.0.1:8777/prototype/
```

## Key concepts

- **Safe chain** = ≥11 tiles; two safe chains can't merge. A tile whose placement would join two safe chains is permanently unplayable (a dead tile).
- **Panel-height stability**: panel zones must not resize as content changes — reveal via transitions, not layout jumps.
- Respect `prefers-reduced-motion` (skip enter animations), matching the existing lab.

## Reference (not the current focus)

- Rules engine: `src/state/gameLogic.ts` (+ `gameTypes.ts`, `gameHelpers.ts`) — pure, immutable `GameState`.
- Client app: `src/` (React + Vite + react-router). Server: `server/` (Express + Socket.io + XState).
- Commands (`npm run dev`, `build`, `test`, `dev:server`, …) matter only when work returns to `src/`/`server/`.
