import type { GameState, Player, Stage, StartupId } from './gameTypes';
import type { Coord } from './gameHelpers';
import { previewPlacement, isDeadTile } from './placement';
import { getEndCondition } from './endGame';
import { tok, pushLog } from './log';
import { MAX_BUYS_PER_TURN, HAND_SIZE, TRADE_RATIO } from './startups';
import {
  handleTilePlacement,
  completeSurvivorSelection,
  finalizeMergerPayout,
  foundStartup,
  completePlayerMergerLiquidation,
  buyShares,
  getSharePrice,
  endBuyPhase,
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
  if (trade % TRADE_RATIO !== 0) reject('oddTradeCount');

  const survivor = state.startups[ctx.survivorId];
  const gained = trade / TRADE_RATIO;
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
 * Up to 3 shares per turn, cumulative across calls. The whole basket is
 * priced and validated against founding/stock/cash *before* anything is
 * charged — a basket the player can't afford must leave state untouched.
 * The actual bookkeeping (cash, portfolio, share pool, currentBuyCount,
 * logging) is delegated to gameLogic's `buyShares`, once per distinct
 * startup in the basket; the pre-check below guarantees each call succeeds.
 */
function doBuyShares(state: GameState, intent: Extract<Intent, { type: 'buyShares' }>): void {
  requireStage(state, 'buy');
  const player = requireCurrentPlayer(state, intent.playerId);

  const already = state.currentBuyCount ?? 0;
  if (already + intent.picks.length > MAX_BUYS_PER_TURN) reject('tooManyPicks');

  const wanted: Partial<Record<StartupId, number>> = {};
  let total = 0;
  for (const id of intent.picks) {
    const startup = state.startups[id];
    if (!startup || !startup.isFounded) reject('brandUnavailable');
    wanted[id] = (wanted[id] ?? 0) + 1;
    if (wanted[id]! > startup.availableShares) reject('notEnoughShares');
    total += getSharePrice(state, id);
  }
  if (total > player.cash) reject('notEnoughCash');

  for (const [id, count] of Object.entries(wanted) as [StartupId, number][]) {
    // `buyShares` returns false when *it* refuses the basket — a different
    // rule copy saying no after ours said yes. The validation above is
    // supposed to make that unreachable, so a false here is an engine-
    // invariant violation, not a player error: there is no IllegalIntentCode
    // that honestly describes it, and reporting one would tell the client to
    // fix an input that was fine. Assert instead, loudly. `applyIntent`
    // clones before delegating, so the throw still leaves the caller's state
    // untouched. Silently discarding this return is how a MAX_BUYS_PER_TURN
    // divergence would ship a partially-applied basket as a full success.
    if (!buyShares(state, player.id, id, count)) {
      throw new Error(
        `engine invariant: buyShares refused ${count}x ${id} for ${player.id} ` +
        `after doBuyShares validated the basket — the buy rules in intents.ts ` +
        `and gameLogic.ts have diverged`,
      );
    }
  }
}

function hasLegalTile(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return !!player && player.hand.some((c) => previewPlacement(state, c, playerId).legal);
}

/** Draws straight from `state.bag` up to `size`. See the note on
 * `completeTileTransaction` in `doPlaceTile` above — that helper is a
 * permanent no-op on the intent path, so `endTurn` must do its own drawing.
 */
function drawUpTo(state: GameState, playerId: string, size = HAND_SIZE): Coord[] {
  const player = state.players.find((p) => p.id === playerId)!;
  const drawn: Coord[] = [];
  while (player.hand.length < size && state.bag.length > 0) {
    const tile = state.bag.shift()!;
    player.hand.push(tile);
    drawn.push(tile);
  }
  return drawn;
}

/**
 * Legal from `buy` always. Legal from `play` only when the current player
 * has no legal placement anywhere in hand — otherwise they must place.
 * Draws the hand back up to 6 from the bag (never past what it holds),
 * resets `currentBuyCount`, and advances to the next player's `play` stage.
 */
function doEndTurn(state: GameState, intent: Extract<Intent, { type: 'endTurn' }>): void {
  const player = requireCurrentPlayer(state, intent.playerId);

  if (state.stage === 'play') {
    if (hasLegalTile(state, intent.playerId)) {
      reject('wrongStage', 'a legal placement exists — you must place a tile');
    }
  } else {
    requireStage(state, 'buy');
  }

  const drawn = drawUpTo(state, player.id);
  if (drawn.length > 0) {
    pushLog(state, 'Drew tiles', [tok.text(`${drawn.length} tile${drawn.length === 1 ? '' : 's'}`)], player.id);
  }
  pushLog(state, 'Ended turn', [], player.id);

  // Resets currentBuyCount, advances turnIndex, and lands on 'play' —
  // exactly what ending a turn needs, whether we arrived here from 'buy'
  // or from a dead-ended 'play'. This is also the fix for the stale
  // currentBuyCount hazard: gameLogic's foundStartup and
  // advanceToNextAbsorbedStartup enter 'buy' without resetting it, relying
  // on it already being 0 — which only holds if every path out of a turn
  // resets it here, unconditionally, regardless of how 'buy' was entered.
  endBuyPhase(state);
}

/**
 * Swaps genuinely dead tiles (would merge two safe chains) for fresh ones
 * from the bag. The turn continues — stage stays 'play'. Validates every
 * coord before mutating any of them, so a bad coord in the batch leaves the
 * hand and bag untouched.
 */
function doTradeInDeadTiles(state: GameState, intent: Extract<Intent, { type: 'tradeInDeadTiles' }>): void {
  requireStage(state, 'play');
  const player = requireCurrentPlayer(state, intent.playerId);

  // Dedupe before validating/mutating: a client sending the same coord twice
  // must not surrender one tile and draw two.
  const coords = [...new Set(intent.coords)];

  for (const c of coords) {
    if (!player.hand.includes(c)) reject('tileNotInHand');
    if (!isDeadTile(state, c)) reject('notADeadTile', c);
  }

  for (const c of coords) {
    player.hand = player.hand.filter((x) => x !== c);
    const replacement = state.bag.shift();
    const detail = [tok.tile(c)];
    if (replacement) {
      player.hand.push(replacement);
      detail.push(tok.text(' → drew '), tok.tile(replacement));
    } else {
      detail.push(tok.text(' → bag empty'));
    }
    pushLog(state, 'Traded a tile', detail, player.id);
  }
}

/**
 * Only legal once `getEndCondition` says the game is over. A player who
 * doesn't want to end declines simply by calling `endTurn` instead — the
 * engine never ends the game on its own.
 *
 * Stage gate, mirroring `doEndTurn`: legal from `buy` always, and from
 * `play` only when the current player has no legal placement anywhere in
 * hand. Restricting it to `buy` alone deadlocked the game: `buy` is
 * reachable only by placing a tile, so once the bag and every hand are
 * empty nobody can ever get back there — `declareEnd` was rejected forever
 * while `endTurn` succeeded forever, and the game could not terminate. G11
 * makes declining explicitly legal, so the engine actively steers play into
 * that state.
 *
 * The gate matters. Allowing `declareEnd` from `play` *ungated* would let a
 * player skip a placement they are able to make in order to freeze the
 * board — a real strategic change, not a bug fix. Gated, it changes nothing
 * about normal play: if you can place, you must (and land in `buy`, where
 * declaring already worked); if you cannot, declaring is the only way the
 * game ever finishes.
 */
function doDeclareEnd(state: GameState, intent: Extract<Intent, { type: 'declareEnd' }>): void {
  requireCurrentPlayer(state, intent.playerId);

  if (state.stage === 'play') {
    if (hasLegalTile(state, intent.playerId)) {
      reject('wrongStage', 'a legal placement exists — place your tile first');
    }
  } else {
    requireStage(state, 'buy');
  }

  const condition = getEndCondition(state);
  if (!condition.met) reject('endNotAvailable');

  const reason = condition.reasons[0];
  pushLog(state, 'Game over', reason.kind === 'size41'
    ? [tok.brand(reason.startupId), tok.text(` reached ${reason.size} tiles`)]
    : [tok.text('every founded chain is safe')], intent.playerId);
  state.stage = 'end';
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
    case 'buyShares':           doBuyShares(next, intent); break;
    case 'endTurn':             doEndTurn(next, intent); break;
    case 'tradeInDeadTiles':    doTradeInDeadTiles(next, intent); break;
    case 'declareEnd':          doDeclareEnd(next, intent); break;
    default:                    reject('unknownIntent', `no handler for ${(intent as Intent).type}`);
  }
  return next;
}
