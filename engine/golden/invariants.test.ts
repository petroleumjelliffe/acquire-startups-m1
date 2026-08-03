import { describe, it, expect } from 'vitest';
import type { GameState } from '../gameTypes';
import type { Intent } from '../intents';
import { applyIntent, IllegalIntentError } from '../intents';
import { generateAllCoords, shuffleSeeded } from '../gameHelpers';
import { HAND_SIZE, TRADE_RATIO, isStartupId } from '../startups';
import { buildFixture } from './fixtures';
import { checkInvariants } from './invariants';

const MAX_STEPS = 400;
const SEEDS = Array.from({ length: 60 }, (_, i) => `prop-${i}`);
const NAMES = ['Alex', 'Sam', 'Jordan'];

/**
 * An opening position `applyIntent` can actually advance. `createInitialGame`
 * cannot be used: it yields `stage: 'draw'`, which no intent accepts.
 */
function newGame(seed: string): GameState {
  const all = shuffleSeeded(generateAllCoords(), seed);
  return buildFixture({
    players: NAMES.map((name, i) => ({ name, hand: all.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE) })),
    bag: all.slice(NAMES.length * HAND_SIZE),
    stage: 'play',
  });
}

/** A cheap deterministic picker: shuffles by seed+salt and takes the head. */
function pick<T>(items: T[], seed: string, salt: number): T | undefined {
  return shuffleSeeded(items, `${seed}:${salt}`)[0];
}

/**
 * One plausible intent for the current stage, or null when this driver has no
 * move to make. Null is a signal, not an exit: `playOne` records the stage, and
 * a stall anywhere but `end` is a finding.
 */
function nextIntent(state: GameState, seed: string, salt: number): Intent | null {
  const me = state.players[state.turnIndex];
  if (!me) return null;
  // `Startup.id` is declared `string` (see the TODO on gameTypes.ts's `Startup.id`),
  // though it is always drawn from the fixed 7-id set. `isStartupId` is the
  // sanctioned runtime narrowing (see its doc comment in startups.ts) — used
  // here instead of `as StartupId` so this stays a real check, not an assertion.
  const founded = Object.values(state.startups).filter((s) => s.isFounded).map((s) => s.id).filter(isStartupId);
  const unfounded = Object.values(state.startups).filter((s) => !s.isFounded).map((s) => s.id).filter(isStartupId);

  switch (state.stage) {
    case 'play': {
      const coord = pick(me.hand, seed, salt);
      return coord ? { type: 'placeTile', playerId: me.id, coord } : { type: 'endTurn', playerId: me.id };
    }
    case 'foundStartup': {
      const startupId = pick(unfounded, seed, salt);
      return startupId ? { type: 'chooseFoundingBrand', playerId: me.id, startupId } : null;
    }
    case 'chooseSurvivor': {
      // `pendingTiedStartups`/`absorbedIds` etc. are declared `string[]` on
      // `GameState`/`MergerContext` (same TODO as `Startup.id`); narrow
      // through `isStartupId` rather than asserting. `?.filter` only falls
      // back to `founded` when `pendingTiedStartups` itself is undefined —
      // matching the original `?? founded`, not falling back on an empty array.
      const tied = state.pendingTiedStartups?.filter(isStartupId);
      const startupId = pick(tied ?? founded, seed, salt);
      return startupId ? { type: 'chooseSurvivor', playerId: me.id, startupId } : null;
    }
    case 'mergerLiquidation': {
      // Multi-actor: the actor is the head of the shareholder queue, not the
      // player whose turn it is.
      const ctx = state.mergerContext;
      if (!ctx) return null;
      const playerId = ctx.shareholderQueue[ctx.currentShareholderIndex];
      const rawStartupId = ctx.absorbedIds[ctx.currentLiquidationIndex];
      if (!playerId || !rawStartupId || !isStartupId(rawStartupId)) return null;
      const startupId = rawStartupId;

      const held = state.players.find((p) => p.id === playerId)?.portfolio[startupId] ?? 0;
      // `trade` counts shares handed IN, so it must be a whole multiple of the
      // ratio or the reducer rejects with `oddTradeCount`.
      const trade = salt % 2 === 0 ? held - (held % TRADE_RATIO) : 0;
      return { type: 'liquidate', playerId, startupId, sell: held - trade, trade, keep: 0 };
    }
    case 'buy': {
      // three-way: buy something, declare the end, or just end the turn
      const choice = salt % 3;
      if (choice === 0) return { type: 'endTurn', playerId: me.id };
      if (choice === 1) return { type: 'declareEnd', playerId: me.id };
      const startupId = pick(founded, seed, salt);
      return startupId
        ? { type: 'buyShares', playerId: me.id, picks: [startupId] }
        : { type: 'endTurn', playerId: me.id };
    }
    default:
      return null;
  }
}

interface RunResult {
  seed: string;
  steps: number;
  reachedEnd: boolean;
  emptiedBag: boolean;
  stalledAt: string | null;
  violation: string | null;
  history: Intent[];
}

function playOne(seed: string): RunResult {
  let state = newGame(seed);
  const history: Intent[] = [];
  const base = { seed, reachedEnd: false, emptiedBag: false, stalledAt: null as string | null };
  let emptiedBag = false;
  let salt = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (state.stage === 'end') {
      return { ...base, steps: step, reachedEnd: true, emptiedBag, violation: null, history };
    }

    const intent = nextIntent(state, seed, salt++);
    if (!intent) {
      return { ...base, steps: step, emptiedBag, stalledAt: state.stage, violation: null, history };
    }

    try {
      state = applyIntent(state, intent);
      history.push(intent);
    } catch (e) {
      if (e instanceof IllegalIntentError) continue;
      return { ...base, steps: step, emptiedBag, violation: String(e), history };
    }

    if (state.bag.length === 0) emptiedBag = true;
    const problems = checkInvariants(state);
    if (problems.length) {
      return { ...base, steps: step, emptiedBag, violation: problems.join('; '), history };
    }
  }

  return { ...base, steps: MAX_STEPS, emptiedBag, reachedEnd: state.stage === 'end', violation: null, history };
}

describe('random-play invariants', () => {
  const runs = SEEDS.map(playOne);
  const report = (r: RunResult) =>
    `seed ${r.seed} @ step ${r.steps}: ${r.violation ?? r.stalledAt}\n  ${JSON.stringify(r.history)}`;

  it('holds every invariant across every seed', () => {
    expect(
      runs.filter((r) => r.violation).map(report),
      'a failing seed above is reproducible — paste its intent list into a golden game',
    ).toEqual([]);
  });

  // The Phase 0 deadlock in one assertion: a game that can go no further while
  // it is not over is a bug, whether the reducer refuses or the driver has no move.
  it('never stalls anywhere but end', () => {
    expect(runs.filter((r) => r.stalledAt).map(report)).toEqual([]);
  });

  // Guards against the probe that proves nothing: a policy that quits early
  // reports zero failures without ever visiting the states where bugs live.
  it('reaches deep states — at least one game empties the bag', () => {
    expect(runs.some((r) => r.emptiedBag)).toBe(true);
  });

  it('reaches terminal states — at least one game ends', () => {
    expect(runs.some((r) => r.reachedEnd)).toBe(true);
  });
});
