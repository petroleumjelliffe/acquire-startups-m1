import type { GameState, Player, Stage, StartupId } from './gameTypes';
import type { Coord } from './gameHelpers';
import { previewPlacement } from './placement';
import {
  handleTilePlacement,
  completeSurvivorSelection,
  finalizeMergerPayout,
  foundStartup,
  completePlayerMergerLiquidation,
} from './gameLogic';

/**
 * The single server-authoritative vocabulary of player actions. Field names are
 * fixed by the roadmap spec — do not rename them.
 */
export type Intent =
  | { type: 'placeTile';           playerId: string; coord: Coord }
  | { type: 'chooseFoundingBrand'; playerId: string; startupId: StartupId }
  | { type: 'chooseSurvivor';      playerId: string; startupId: StartupId }
  | { type: 'liquidate';           playerId: string; startupId: StartupId; sell: number; trade: number; keep: number }
  | { type: 'buyShares';           playerId: string; picks: StartupId[] }
  | { type: 'tradeInDeadTiles';    playerId: string; coords: Coord[] }
  | { type: 'declareEnd';          playerId: string }
  | { type: 'endTurn';             playerId: string };

export type IllegalIntentCode =
  | 'wrongStage' | 'notYourTurn' | 'tileNotInHand' | 'illegalPlacement'
  | 'brandUnavailable' | 'notATiedSurvivor' | 'shareCountMismatch'
  | 'oddTradeCount' | 'notEnoughShares' | 'notEnoughCash'
  | 'tooManyPicks' | 'notADeadTile' | 'endNotAvailable' | 'unknownIntent';

export class IllegalIntentError extends Error {
  readonly code: IllegalIntentCode;
  constructor(code: IllegalIntentCode, message?: string) {
    super(message ?? code);
    this.name = 'IllegalIntentError';
    this.code = code;
  }
}

function reject(code: IllegalIntentCode, message?: string): never {
  throw new IllegalIntentError(code, message);
}

function requireStage(state: GameState, ...stages: Stage[]): void {
  if (!stages.includes(state.stage)) {
    reject('wrongStage', `expected ${stages.join(' | ')}, got ${state.stage}`);
  }
}

function requireCurrentPlayer(state: GameState, playerId: string): Player {
  const player = state.players[state.turnIndex];
  if (!player || player.id !== playerId) reject('notYourTurn');
  return player;
}

/**
 * `handleTilePlacement` / `completeSurvivorSelection` park an uncontested merger
 * on the legacy `mergerPayout` stage so a modal can acknowledge it. The intent
 * machine has no such stage: a payout the player cannot decline is not a
 * decision point, so we settle it immediately. `finalizeMergerPayout` pays the
 * bonuses that were computed from pre-merger prices, then lands on
 * `mergerLiquidation` (someone still holds absorbed shares) or `buy`.
 */
function settleMergerPayout(state: GameState): void {
  if (state.stage === 'mergerPayout') finalizeMergerPayout(state);
}

function doPlaceTile(state: GameState, intent: Extract<Intent, { type: 'placeTile' }>): void {
  requireStage(state, 'play');
  const player = requireCurrentPlayer(state, intent.playerId);
  if (!player.hand.includes(intent.coord)) reject('tileNotInHand');

  const preview = previewPlacement(state, intent.coord, player.id);
  if (!preview.legal) reject('illegalPlacement', preview.block);

  // Board work, chain classification and stage transition all live in
  // gameLogic. It leaves the played tile pending so the legacy modal path can
  // cancel; the intent path commits immediately instead.
  handleTilePlacement(state, intent.coord);

  // INVARIANT: the hand is settled here and nowhere else on the intent path —
  // the played tile is gone and `pendingTileToRemove` is cleared. The
  // replacement draw is `endTurn`'s job.
  //
  // Do NOT reach for `completeTileTransaction` to do that draw. It is the
  // obvious existing "remove from hand + draw" helper, but it early-returns
  // when `pendingTileToRemove` is unset — which is always, here. It would
  // silently draw nothing, and the failure would only surface once hands ran
  // dry. `endTurn` must shift from `state.bag` itself.
  player.hand = player.hand.filter((c) => c !== intent.coord);
  state.pendingTileToRemove = undefined;

  settleMergerPayout(state);
}

function doChooseFoundingBrand(
  state: GameState,
  intent: Extract<Intent, { type: 'chooseFoundingBrand' }>,
): void {
  requireStage(state, 'foundStartup');
  requireCurrentPlayer(state, intent.playerId);

  const startup = state.startups[intent.startupId];
  if (!startup || startup.isFounded) reject('brandUnavailable');

  const coord = state.pendingFoundTile;
  if (!coord) reject('illegalPlacement', 'no pending founding tile');

  // Claims the connected unclaimed group, grants the founder share, logs, and
  // moves to `buy`.
  foundStartup(state, startup.id, coord);
}

function doChooseSurvivor(
  state: GameState,
  intent: Extract<Intent, { type: 'chooseSurvivor' }>,
): void {
  requireStage(state, 'chooseSurvivor');
  requireCurrentPlayer(state, intent.playerId);

  const tied = state.pendingTiedStartups ?? [];
  if (!tied.includes(intent.startupId)) reject('notATiedSurvivor');

  // `completeSurvivorSelection` reads these two siblings and bails with a bare
  // console.error if either is missing. Without this guard that bail would
  // surface as a *successful* intent that changed nothing, wedging the game in
  // `chooseSurvivor` forever. The authoritative reducer must reject instead.
  if (!state.pendingMergerTile || !state.pendingMergerStartups) {
    reject('illegalPlacement', 'no pending merger');
  }

  // Absorbs every touching chain — the tied losers and any smaller ones —
  // capturing pre-merger prices before the board is repainted.
  completeSurvivorSelection(state, intent.startupId);
  settleMergerPayout(state);
}

/**
 * Resolves one absorbed-chain holder's shares: sell for cash at the
 * pre-merger price, trade two-for-one into survivor shares, or keep the
 * rest. Players resolve one at a time, in the order `finalizeMergerPayout` /
 * `advanceToNextAbsorbedStartup` queued them (`mergerContext.shareholderQueue`).
 * Validation happens here; the bookkeeping (cash, portfolios, share pools,
 * logging, and advancing to the next shareholder or absorbed chain) is
 * entirely `completePlayerMergerLiquidation`'s job — it already knows how to
 * walk `shareholderQueue`/`currentLiquidationIndex` and hand off to
 * `advanceToNextAbsorbedStartup` when a chain's queue empties, including the
 * multi-absorbed-chain case (moving on to the next chain's liquidation, or
 * to `buy` once every absorbed chain is settled).
 */
function doLiquidate(state: GameState, intent: Extract<Intent, { type: 'liquidate' }>): void {
  requireStage(state, 'mergerLiquidation');
  const ctx = state.mergerContext;
  if (!ctx) reject('wrongStage', 'no merger in progress');

  const head = ctx.shareholderQueue[ctx.currentShareholderIndex];
  if (!head || head !== intent.playerId) reject('notYourTurn');

  const currentAbsorbed = ctx.absorbedIds[ctx.currentLiquidationIndex];
  if (currentAbsorbed !== intent.startupId) {
    reject('wrongStage', 'wrong chain for this queue entry');
  }

  const player = state.players.find((p) => p.id === intent.playerId)!;
  const held = player.portfolio[intent.startupId] ?? 0;
  const { sell, trade, keep } = intent;

  if (sell < 0 || trade < 0 || keep < 0) reject('shareCountMismatch');
  if (sell + trade + keep !== held) reject('shareCountMismatch', `holds ${held}`);
  if (trade % 2 !== 0) reject('oddTradeCount');

  const survivor = state.startups[ctx.survivorId];
  const gained = trade / 2;
  if (gained > survivor.availableShares) reject('notEnoughShares');

  // `completePlayerMergerLiquidation`'s own `trade` param is the number of
  // *survivor* shares gained (it derives its 2-for-1 cost internally), not
  // the number of absorbed shares handed in — so pass `gained`, not `trade`.
  completePlayerMergerLiquidation(state, intent.playerId, {
    absorbedId: intent.startupId,
    trade: gained,
    sell,
  });
}

/**
 * The one entry point for player actions. Pure by contract: it clones the
 * incoming state, then delegates to the (mutating) rules functions.
 * Throws `IllegalIntentError` and leaves the caller's state untouched if the
 * intent is not legal in the current stage.
 */
export function applyIntent(state: GameState, intent: Intent): GameState {
  const next = structuredClone(state);
  switch (intent.type) {
    case 'placeTile':           doPlaceTile(next, intent); break;
    case 'chooseFoundingBrand': doChooseFoundingBrand(next, intent); break;
    case 'chooseSurvivor':      doChooseSurvivor(next, intent); break;
    case 'liquidate':           doLiquidate(next, intent); break;
    default:                    reject('unknownIntent', `no handler for ${(intent as Intent).type}`);
  }
  return next;
}
