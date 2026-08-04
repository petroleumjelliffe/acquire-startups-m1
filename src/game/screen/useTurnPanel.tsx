import { useEffect, useState, type ReactNode } from 'react';
import { hasLegalTile, type Intent } from '../../../engine/intents';
import type { GameState, StartupId } from '../../../engine/gameTypes';
import type { SessionView } from '../session/GameSession';
import type { Coord } from '../../../engine/gameHelpers';
import { getDeadTilesInHand } from '../../../engine/placement';
import { ActiveStep } from '../panel/ActiveStep';
import { StagingZone } from '../panel/StagingZone';
import { FoundGroups } from '../FoundGroups';
import { floodFillUnclaimed } from '../../../engine/gameHelpers';
import { isStartupId, MAX_BUYS_PER_TURN, TRADE_RATIO } from '../../../engine/startups';
import { StockStack } from '../atoms/StockStack';
import { getSharePrice } from '../../../engine/gameLogic';
import { LiqQueue } from '../merger/LiqQueue';
import { LiqActions } from '../merger/LiqActions';
import { Brand } from '../atoms/Brand';

/**
 * The panel's two interactive slots for the current stage.
 *
 * They are returned together because they share state — the buy buttons sit in
 * `active` while the confirm button sits in `staging` — but they must render in
 * separate `Panel` slots, because the zone order is fixed and a staging zone
 * that came and went would resize every zone beneath it.
 */
export interface TurnPanelSlots {
  active: ReactNode;
  staging: ReactNode;
}

/** Everything a turn stages locally before committing it as one intent. */
interface Staged {
  picks: StartupId[];
  sell: number;
  trade: number;
}

const NOTHING_STAGED: Staged = { picks: [], sell: 0, trade: 0 };

/**
 * How big the chain being founded will be: the placed tile plus every
 * unclaimed tile it connects to. During `foundStartup` the tile is already on
 * the board, so the whole group is one flood fill from it — `previewPlacement`
 * would report `occupied` for a coord that is already placed.
 */
function foundingSize(state: GameState, coord: Coord): number {
  return floodFillUnclaimed([coord], state.board).length;
}

export function useTurnPanel(view: SessionView, dispatch: (intent: Intent) => void): TurnPanelSlots {
  const { state, actorId, error } = view;
  const [staged, setStaged] = useState<Staged>(NOTHING_STAGED);

  // An abandoned basket must never survive into another player's turn, or into
  // a different decision by the same player.
  useEffect(() => { setStaged(NOTHING_STAGED); }, [actorId, state.stage]);

  const problem = error ? (
    <div role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
      {error.message}
    </div>
  ) : null;

  // The default staging slot: present and reserving its height, holding
  // nothing. Stages that stage something replace it below.
  const idleStaging = <StagingZone label="Staging" />;

  if (state.stage === 'draw') {
    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label="Open the game"
          body={<span className="text-[13px] text-gray-600">Draw for turn order — highest tile plays first.</span>}
          button={
            <>
              <button
                type="button"
                onClick={() => actorId && dispatch({ type: 'startGame', playerId: actorId })}
                className="m-0 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Draw for turn order
              </button>
              {problem}
            </>
          }
        />
      ),
    };
  }

  if (state.stage === 'play') {
    const canPlace = actorId ? hasLegalTile(state, actorId) : false;
    const dead = actorId ? getDeadTilesInHand(state, actorId) : [];

    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label="Place a tile"
          body={
            <>
              <span className="text-[13px] text-gray-600">
                {canPlace
                  ? 'Choose one of your tiles on the board.'
                  : 'No tile you hold can be played. You may end your turn.'}
              </span>
              {dead.length > 0 && (
                <span className="text-[13px] text-gray-600">
                  {`${dead.join(', ')} can never be played — ${dead.length === 1 ? 'it joins' : 'they join'} two safe chains.`}
                </span>
              )}
              {problem}
            </>
          }
          button={
            !actorId ? undefined : (
              <div className="flex w-full flex-col gap-2">
                {dead.length > 0 && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'tradeInDeadTiles', playerId: actorId, coords: dead })}
                    className="m-0 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {`Trade in ${dead.length} dead tile${dead.length === 1 ? '' : 's'}`}
                  </button>
                )}
                {!canPlace && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'endTurn', playerId: actorId })}
                    className="m-0 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                  >
                    End turn
                  </button>
                )}
              </div>
            )
          }
        />
      ),
    };
  }

  if (state.stage === 'foundStartup') {
    const coord = state.pendingFoundTile;
    const available = Object.values(state.startups)
      .filter((s) => !s.isFounded).map((s) => s.id).filter(isStartupId);
    const taken = Object.values(state.startups)
      .filter((s) => s.isFounded).map((s) => s.id).filter(isStartupId);

    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label="Found a brand"
          body={
            <>
              <FoundGroups
                available={available}
                taken={taken}
                foundSize={coord ? foundingSize(state, coord) : 2}
                onSelect={(startupId) =>
                  actorId && dispatch({ type: 'chooseFoundingBrand', playerId: actorId, startupId })
                }
              />
              {problem}
            </>
          }
        />
      ),
    };
  }

  if (state.stage === 'chooseSurvivor' && actorId) {
    const tied = (state.pendingTiedStartups ?? []).filter(isStartupId);
    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label="Which chain survives?"
          body={
            <>
              {/*
                `mode="select"` because Brand renders its own <button> in that
                mode — wrapping it in another would nest buttons, which is
                invalid HTML and breaks getByRole('button', { name }).
              */}
              <div className="flex flex-wrap gap-2">
                {tied.map((id) => (
                  <Brand
                    key={id}
                    id={id}
                    mode="select"
                    onClick={() =>
                      dispatch({ type: 'chooseSurvivor', playerId: actorId, startupId: id })
                    }
                  />
                ))}
              </div>
              {problem}
            </>
          }
        />
      ),
    };
  }

  if (state.stage === 'mergerLiquidation' && actorId) {
    const ctx = state.mergerContext;
    const absorbedId = ctx?.absorbedIds[ctx.currentLiquidationIndex];
    const player = state.players.find((p) => p.id === actorId);

    if (ctx && absorbedId && isStartupId(absorbedId) && player && isStartupId(ctx.survivorId)) {
      const survivorId = ctx.survivorId;
      const held = player.portfolio[absorbedId] ?? 0;
      const keep = held - staged.sell - staged.trade;
      const unitPrice = ctx.absorbedPrices[absorbedId] ?? 0;

      const holders = ctx.shareholderQueue.map((id, i) => {
        const p = state.players.find((x) => x.id === id);
        return {
          emoji: p?.emoji,
          name: p?.name ?? id,
          qty: p?.portfolio[absorbedId] ?? 0,
          status: (i < ctx.currentShareholderIndex
            ? 'done'
            : i === ctx.currentShareholderIndex
              ? 'current'
              : 'pending') as 'done' | 'current' | 'pending',
        };
      });

      return {
        active: (
          <ActiveStep
            label="Liquidate your shares"
            body={
              <>
                <LiqQueue holders={holders} />
                <LiqActions
                  absorbedId={absorbedId}
                  survivorId={survivorId}
                  unitPrice={unitPrice}
                  canSell={keep >= 1}
                  canTrade={
                    keep >= TRADE_RATIO &&
                    (state.startups[survivorId]?.availableShares ?? 0) > staged.trade / TRADE_RATIO
                  }
                  onSell={() => setStaged({ ...staged, sell: staged.sell + 1 })}
                  onTrade={() => setStaged({ ...staged, trade: staged.trade + TRADE_RATIO })}
                />
                {problem}
              </>
            }
          />
        ),
        staging: (
          <StagingZone
            label={`Keeping ${keep}`}
            cashDelta={staged.sell * unitPrice}
            shares={<StockStack id={absorbedId} count={keep} size="sm" />}
            action={
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: 'liquidate',
                    playerId: actorId,
                    startupId: absorbedId,
                    sell: staged.sell,
                    trade: staged.trade,
                    keep,
                  });
                  setStaged(NOTHING_STAGED);
                }}
                className="m-0 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Confirm
              </button>
            }
          />
        ),
      };
    }
  }

  if (state.stage === 'buy' && actorId) {
    const player = state.players.find((p) => p.id === actorId);
    const spent = staged.picks.reduce((sum, id) => sum + getSharePrice(state, id), 0);
    const remaining = MAX_BUYS_PER_TURN - (state.currentBuyCount ?? 0) - staged.picks.length;

    const forSale = Object.values(state.startups).filter((s) => s.isFounded && s.availableShares > 0);
    const basket = Object.entries(
      staged.picks.reduce<Record<string, number>>(
        (acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }),
        {},
      ),
    );

    return {
      active: (
        <ActiveStep
          label="Buy shares"
          body={
            <>
              <div className="flex flex-wrap gap-2">
                {forSale.map((s) => {
                  // Bound to a const so the `isStartupId` narrowing survives
                  // into the click handler; narrowing a mutable property does
                  // not reach inside a closure.
                  const id = s.id;
                  if (!isStartupId(id)) return null;
                  const price = getSharePrice(state, id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`Buy one ${id}`}
                      disabled={remaining <= 0 || (player?.cash ?? 0) < spent + price}
                      onClick={() => setStaged({ ...staged, picks: [...staged.picks, id] })}
                      className="m-0 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {`${s.ticker} $${price}`}
                    </button>
                  );
                })}
              </div>
              {problem}
            </>
          }
        />
      ),
      staging: (
        <StagingZone
          label="Buying"
          cashDelta={-spent}
          shares={basket.map(([id, n]) =>
            isStartupId(id) ? <StockStack key={id} id={id} count={n} size="sm" /> : null,
          )}
          action={
            <div className="flex w-full gap-2">
              <button
                type="button"
                disabled={staged.picks.length === 0}
                onClick={() => {
                  dispatch({ type: 'buyShares', playerId: actorId, picks: staged.picks });
                  setStaged(NOTHING_STAGED);
                }}
                className="m-0 flex-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm purchase
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'endTurn', playerId: actorId })}
                className="m-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50"
              >
                End turn
              </button>
            </div>
          }
        />
      ),
    };
  }

  return { active: null, staging: idleStaging };
}
