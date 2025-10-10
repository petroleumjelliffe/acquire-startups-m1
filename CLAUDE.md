# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript implementation of the board game "Acquire" (renamed with startup-themed brands). Players place tiles on a 9×12 grid, found startups, buy shares, and compete through mergers. The game is deployed to GitHub Pages.

## Commands

### Development
```bash
npm run dev          # Start dev server on port 5173
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build
npm run deploy       # Deploy to GitHub Pages using gh-pages
```

Note: No test suite exists yet. No linter is configured.

## Architecture

### State Management Pattern

The game uses **immutable state updates** via React's `useState`. The main `GameState` object is cloned/updated in `gameLogic.ts` functions and passed back through `setState` callbacks. Avoid direct mutation—always return a new object.

### Game Flow & Stage System

The game progresses through discrete stages (defined in `src/state/gameTypes.ts`):

- `setup` → `draw` (initial tile draw to determine turn order)
- `dealHands` → `play` (main tile placement)
- `foundStartup` (modal prompts player to choose startup brand)
- `mergerPayout` → `mergerLiquidation` → `liquidationPrompt` (multi-step merger resolution)
- `buy` (purchase up to 3 shares, then advance turn)
- `end` (game over)

Stage transitions happen in `src/state/gameLogic.ts`. The `Game.tsx` component renders different modals/UI based on `state.stage`.

### File Organization

**Core State Files:**
- `src/state/gameTypes.ts` — TypeScript types for `GameState`, `Player`, `Startup`, `Stage`, `MergerContext`
- `src/state/gameInit.ts` — `createInitialGame()` factory
- `src/state/gameLogic.ts` — All game rules (tile placement, mergers, buying, liquidations)

**Board & Coordinates:**
- `src/utils/gameHelpers.ts` — Coord type (`"A1"` to `"I12"`), adjacency, flood fill, seeded shuffle
- Board is stored as `Record<Coord, TileCell>` where each cell tracks `placed: boolean` and optional `startupId`

**Components:**
- `src/App.tsx` — Entry point; toggles between `SetupScreen` and `Game`
- `src/Game.tsx` — Main game loop; renders board, hand, modals based on stage
- `src/components/` — UI pieces: `Board`, `PlayerHand`, modals for founding/buying/mergers, `GameLog`

**Barrel File:**
- `src/components/index.ts` exports components for cleaner imports

### Merger Logic

Mergers are the most complex mechanic:

1. **Trigger**: Placing a tile adjacent to 2+ startups triggers a merge (unless >1 safe chain exists, which blocks the placement per `handleTilePlacement:134-152`)
2. **Survivor Selection**: Largest startup survives; ties prompt user via `window.prompt` (see `gameLogic.ts:219-225`)
3. **Payout Phase** (`stage: "mergerPayout"`):
   - `prepareMergerPayout()` calculates majority/minority bonuses for absorbed startups
   - Bonuses stored in `state.pendingBonuses` (not in types—cast to `any`)
   - `MergerPayoutModal` displays results and calls `finalizeMergerPayout()`
4. **Liquidation Phase** (`stage: "mergerLiquidation"` → `liquidationPrompt`):
   - Players decide how to handle absorbed shares: trade 2:1 for survivor shares, sell at share price, or hold
   - `MergerLiquidation.tsx` modal handles UI (currently has syntax errors: `gameLogic.ts:18`, `gameLogic.ts:54`)
   - Functions: `startLiquidations()`, `handleLiquidationChoice()`, `advanceLiquidationTurn()`, `completeLiquidation()`
5. **Cleanup**: Absorbed startups reset `isFounded=false`, tiles reassigned to survivor, available shares reset

### Share Pricing

Computed in `getSharePrice(state, startupId)` (`gameLogic.ts:423-439`):
- Based on startup **size** (number of tiles) and **tier** (0-2, set in `AVAILABLE_STARTUPS`)
- Uses lookup table `sharePrices` with 9 tiers of prices
- Safe chains (≥11 tiles) cannot merge with other safe chains (`gameLogic.ts:142`)

### Seeded Randomness

- Tile bag and initial draws use `shuffleSeeded()` from `gameHelpers.ts`
- Accepts a string seed (e.g., `"scaffold-seed"`) for reproducible games
- Useful for testing/debugging specific game states

### Vite Configuration

- Base path: `/acquire-startups-m1` (for GitHub Pages deployment)
- Dev server runs on port 5173
- Uses `@vitejs/plugin-react` for Fast Refresh

## Common Patterns

### Adding a New Modal

1. Create component in `src/components/`, accept `{ state, onUpdate }` props
2. Clone state with `structuredClone(state)` or spread operator
3. Modify cloned state, then call `onUpdate(newState)`
4. Add conditional render in `Game.tsx` based on `state.stage`
5. Export from `src/components/index.ts` if desired

### Modifying Game Rules

- All game logic lives in `src/state/gameLogic.ts`
- Board operations (flood fill, adjacency) use helpers from `gameHelpers.ts`
- When changing stage transitions, update both the logic function and the modal rendering in `Game.tsx`

### Debugging State

- Check `state.log` array for game event history (displayed in `GameLog.tsx`)
- Use `console.log("Game state:", state.stage)` (example in `Game.tsx:32`)
- Seed value allows replaying exact games

## Known Issues

- `MergerLiquidation.tsx` has syntax errors (extra bracket on line 18, undefined `absorbedId` on line 54)
- Some game logic uses `window.prompt()` for tie-breaking (see `gameLogic.ts:221-225`, `gameLogic.ts:302-306`)—consider replacing with modals for consistency
- No TypeScript strict mode enabled (check `tsconfig.json` if it exists)
- Liquidation phase implementation appears incomplete (multiple code paths for mergers/liquidations)

## Deployment

The project deploys to GitHub Pages via `npm run deploy` (uses `gh-pages` package). The production build is in the `dist/` folder. Ensure `vite.config.ts` `base` path matches your repository name.
