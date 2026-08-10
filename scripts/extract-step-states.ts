/**
 * Extract every distinct step and phase the engine can be in, as data.
 *
 * The design project cannot run the app, so "pull the steps from the golden
 * games" has to mean: replay the corpus here, collect one real state per
 * distinct phase, and hand the *numbers* over — board, chains, hand, holdings,
 * prices, staging, the log — rather than a screenshot of them. A layout can
 * then be drawn against real values at any size, which a bitmap cannot.
 *
 * Two vocabularies come out, because the panel shows two different things:
 *
 *  - `turnPhases` — `state.phase`: what the actor is being *asked* to do
 *    (play, buy, foundStartup, chooseSurvivor, liquidate, mergerPayout, end).
 *    This is what the active zone renders.
 *  - `logPhases` — `LogEntry.phase`: what a *completed* step says in the stack
 *    ("Placed a tile", "Founded", "Merger payout", …).
 *
 * Every value is replayed, never authored: derive from the engine, never
 * hardcode. Run with `npx tsx scripts/extract-step-states.ts`.
 */
import { writeFileSync } from 'node:fs';
import { ALL_GOLDEN_GAMES } from '../engine/golden/index';
import { replayGoldenGame } from '../engine/golden/replay';
import { buildFixture } from '../engine/golden/fixtures';
import { getSharePrice } from '../engine/gameLogic';
import { getCurrentActor } from '../engine/actor';
import { isStartupId, AVAILABLE_STARTUPS } from '../engine/startups';
import { ROWS, COLS, coord as toCoord, getStartupSize } from '../engine/gameHelpers';
import type { Coord, GameState, LogEntry } from '../engine/gameTypes';

/** The Stage union, so the extract can report what the corpus never reaches. */
const STAGES_DECLARED = [
  'setup', 'draw', 'dealHands', 'play', 'foundStartup', 'chooseSurvivor',
  'buy', 'mergerPayout', 'mergerLiquidation', 'liquidation', 'liquidationPrompt', 'end',
];

interface Sample {
  /** Where this state came from, so any number can be traced back. */
  source: { game: string; title: string; stepIndex: number; stepName: string };
  stage: string;
  actor: { id: string; name: string; emoji?: string; cash: number } | null;
  turn: number;
  /** Only the cells that are on the board — an empty cell is the default. */
  board: { coord: string; startupId?: string; hq?: boolean }[];
  chains: { id: string; ticker: string; size: number; price: number; safe: boolean; shares: number }[];
  hand: string[];
  holdings: { startupId: string; ticker: string; count: number; price: number }[];
  players: { id: string; name: string; emoji?: string; cash: number; active: boolean }[];
  /** The last few completed steps, as the stack would show them. */
  log: { phase: string; playerId?: string; detail: string; payloadKind?: string }[];
}

const tokenText = (e: LogEntry): string =>
  e.detail
    .map((t) =>
      t.kind === 'text' ? t.text
      : t.kind === 'tile' ? t.coord
      : t.kind === 'brand' ? t.startupId
      : t.kind === 'cash' ? `$${t.amount}`
      : `${t.startupId}x${t.count}`,
    )
    .join(' ');

function sample(state: GameState, source: Sample['source']): Sample {
  const actorId = getCurrentActor(state);
  const actor = state.players.find((p) => p.id === actorId) ?? null;

  const board: Sample['board'] = [];
  for (const r of ROWS) {
    for (const c of COLS) {
      const id = toCoord(r, c);
      const cell = state.board[id];
      if (cell?.placed) {
        board.push({
          coord: id,
          ...(cell.startupId ? { startupId: cell.startupId } : {}),
        });
      }
    }
  }

  const chains = Object.values(state.startups)
    .filter((s) => s.isFounded && isStartupId(s.id))
    // Size comes from the *board* (`getStartupSize`), not `startup.tiles` —
    // that field is marked for deprecation and a fixture leaves it empty, so
    // reading it reported every chain as size 0, and with it a wrong price and
    // a wrong safe flag. Shares are `availableShares`; there is no
    // `sharesRemaining`, so that read was silently undefined.
    .map((s) => {
      const size = getStartupSize(state, s.id);
      return {
        id: s.id,
        ticker: s.ticker,
        size,
        price: getSharePrice(state, s.id),
        safe: size >= 11,
        shares: s.availableShares,
      };
    });

  const holdings = actor
    ? Object.entries(actor.portfolio ?? {})
        .filter(([id, n]) => n > 0 && isStartupId(id))
        .map(([id, n]) => ({
          startupId: id,
          ticker: AVAILABLE_STARTUPS.find((a) => a.id === id)?.ticker ?? id,
          count: n as number,
          price: getSharePrice(state, id),
        }))
    : [];

  return {
    source,
    stage: state.stage,
    actor: actor ? { id: actor.id, name: actor.name, emoji: actor.emoji, cash: actor.cash } : null,
    turn: state.turnIndex ?? 0,
    board,
    chains,
    hand: actor?.hand ?? [],
    holdings,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      cash: p.cash,
      active: p.id === actorId,
    })),
    log: (state.log ?? []).slice(-6).map((e) => ({
      phase: e.phase,
      playerId: e.playerId,
      detail: tokenText(e),
      payloadKind: e.payload?.kind,
    })),
  };
}

const turnStages = new Map<string, Sample>();
const logPhases = new Map<string, { phase: string; example: string; count: number; payloadKind?: string }>();

for (const game of ALL_GOLDEN_GAMES) {
  const states = replayGoldenGame(game);
  states.forEach((state, i) => {
    const src = {
      game: game.id,
      title: game.title,
      stepIndex: i,
      stepName: i === 0 ? 'opening position' : (game.steps[i - 1]?.name ?? ''),
    };

    // Keep the most *demanding* example of each stage, not the fullest board.
    //
    // Scoring on board tiles alone picked G9's endgame every time: 41 tiles of
    // one chain, an empty hand and no holdings — a wide-open panel, which is
    // the easiest case to lay out, not the hardest. What strains a layout is
    // the number of distinct things it has to show at once, so chains and
    // holdings dominate, a full hand counts, and the board is a tiebreaker.
    const demand = (s: Sample) =>
      s.chains.length * 6 + s.holdings.length * 4 + s.hand.length * 2 + s.board.length / 20;

    const existing = turnStages.get(state.stage);
    const candidate = sample(state, src);
    if (!existing || demand(candidate) > demand(existing)) {
      turnStages.set(state.stage, candidate);
    }

    for (const entry of state.log ?? []) {
      const seen = logPhases.get(entry.phase);
      if (seen) seen.count += 1;
      else
        logPhases.set(entry.phase, {
          phase: entry.phase,
          example: tokenText(entry),
          count: 1,
          payloadKind: entry.payload?.kind,
        });
    }
  });
}

/**
 * The stress case the golden corpus cannot supply.
 *
 * The corpus is built to prove *rules*, so its fixtures are deliberately
 * minimal: the busiest state in all 17 games has three chains, two players,
 * one hand tile and two holdings. A layout is not hard at that size. The iPad
 * mockup is explicitly a seven-startup stress test, so the demanding case has
 * to be built rather than found.
 *
 * Built, not authored: `buildFixture` is the same constructor the golden games
 * use, it enforces the share-conservation and no-double-placement invariants,
 * and every price and total below is read back out of the engine afterwards.
 * Nothing here is a typed-in number except the shape of the table.
 */
function stressState(): Sample {
  const spec = {
    players: [
      { name: 'pete_2004', cash: 4800, hand: ['F11', 'I11', 'A2', 'G7', 'B6', 'C11'] as Coord[],
        shares: { ZuckFace: 4, PaperfulPost: 2, WrecksonMobil: 7, Gobble: 1, Messla: 3, Scrapple: 5, CamCrooned: 2 } },
      { name: 'm_dot_liu', cash: 4800, hand: ['A1', 'D12', 'H4', 'E2', 'I3', 'B9'] as Coord[],
        shares: { ZuckFace: 3, WrecksonMobil: 2, Messla: 1 } },
      { name: 'j.ruiz', cash: 4800, hand: ['C5', 'F2', 'G9', 'H12', 'D7', 'E10'] as Coord[],
        shares: { PaperfulPost: 4, Gobble: 2, CamCrooned: 1 } },
    ],
    chains: [
      { id: 'ZuckFace' as const, coords: ['B2', 'B3', 'C2', 'C3', 'C4'] as Coord[] },
      { id: 'PaperfulPost' as const, coords: ['A7', 'A8', 'B7'] as Coord[] },
      { id: 'WrecksonMobil' as const, coords: ['E9', 'E10', 'F9', 'F10', 'G10'] as Coord[] },
      { id: 'Gobble' as const, coords: ['G3', 'G4', 'H3'] as Coord[] },
      { id: 'Messla' as const, coords: ['D6', 'E6', 'E7'] as Coord[] },
      { id: 'Scrapple' as const, coords: ['H6', 'I5', 'I6'] as Coord[] },
      { id: 'CamCrooned' as const, coords: ['A11', 'A12', 'B11'] as Coord[] },
    ],
    loners: ['C9', 'D1', 'F12', 'I1', 'I9'] as Coord[],
    stage: 'buy' as const,
    currentPlayerIndex: 0,
  };
  // j.ruiz's E10 would collide with WrecksonMobil's; fixtures reject a double
  // placement outright, which is the invariant doing its job.
  spec.players[2].hand = ['C5', 'F2', 'G9', 'H12', 'D7', 'B5'] as Coord[];

  return sample(buildFixture(spec), {
    game: 'STRESS',
    title: 'seven startups, three seats, full hands — built for the iPad layout, not replayed',
    stepIndex: 0,
    stepName: 'all seven startups founded, every seat holding',
  });
}

const out = {
  generated: 'scripts/extract-step-states.ts — replayed from engine/golden, never authored',
  games: ALL_GOLDEN_GAMES.length,
  /** Stages the Stage union declares but the golden corpus never reaches. */
  stagesNotInCorpus: STAGES_DECLARED.filter((s) => !turnStages.has(s)),
  turnStages: Object.fromEntries([...turnStages].sort()),
  logPhases: Object.fromEntries([...logPhases].sort()),
  stress: stressState(),
};

const target = process.argv[2] ?? 'step-states.json';
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`✓ ${target}`);
console.log(`  turn stages: ${[...turnStages.keys()].sort().join(', ')}`);
console.log(`  log phases:  ${[...logPhases.keys()].sort().join(', ')}`);
