import { useEffect, useState, type ReactNode } from 'react';
import { hasLegalTile, type Intent } from '../../../engine/intents';
import type { GameState, StartupId } from '../../../engine/gameTypes';
import type { SessionView } from '../../../session/GameSession';
import type { Coord } from '../../../engine/gameHelpers';
import { getDeadTilesInHand } from '../../../engine/placement';
import { getEndCondition } from '../../../engine/endGame';
import { reasonText } from '../FinalScoring';
import { ActiveStep } from '../panel/ActiveStep';
import { StagingZone } from '../panel/StagingZone';
import { FoundGroups } from '../FoundGroups';
import { floodFillUnclaimed } from '../../../engine/gameHelpers';
import { isStartupId, MAX_BUYS_PER_TURN, TRADE_RATIO } from '../../../engine/startups';
import { StockStack } from '../atoms/StockStack';
import { StockCard } from '../atoms/StockCard';
import { foundedThisTurn } from './boardMarks';
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

/**
 * The label for the step a stage is asking for.
 *
 * One map rather than one string per branch, because the waiting panel shows
 * the same label the actor sees — a second copy would drift the moment a
 * label is reworded.
 */
export function stageLabel(stage: GameState['stage']): string {
  switch (stage) {
    case 'draw': return 'Open the game';
    case 'foundStartup': return 'Found a brand';
    case 'chooseSurvivor': return 'Which chain survives?';
    case 'mergerLiquidation': return 'Liquidate shares';
    case 'buy': return 'Buy shares';
    default: return 'Place a tile';
  }
}

export function useTurnPanel(
  view: SessionView,
  dispatch: (intent: Intent) => void,
  canAct: boolean = true,
): TurnPanelSlots {
  const { state, actorId, error, pending } = view;
  /** Founded this turn, so its shares are new to the table. */
  const freshBrand = foundedThisTurn(state, view.segmentStart);
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

  // Derived every render, never latched: 'every founded chain is safe' stops
  // being true the moment a merger makes one unsafe again, and an affordance
  // remembered from an earlier render would offer an end the engine refuses.
  const endCondition = getEndCondition(state);
  const declareEnd = endCondition.met && actorId ? (
    <div className="mt-2 flex flex-col gap-1 rounded-md bg-amber-50 px-2 py-1.5">
      <span className="text-[13px] font-semibold text-amber-900">
        {`${reasonText(endCondition.reasons[0] ?? null)}. You may end the game now.`}
      </span>
      <button
        type="button"
        onClick={() => dispatch({ type: 'declareEnd', playerId: actorId })}
        className="m-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
      >
        End the game
      </button>
    </div>
  ) : null;

  /**
   * The panel never stops showing this player their own step.
   *
   * It used to: when it was not your turn, every branch below was replaced by
   * "Waiting for Alex." in one line of grey. Played by hand, that read as the
   * screen going blank — the step you were in the middle of understanding was
   * taken away and nothing said whose turn it was in any way you would notice.
   * Whose turn it is now belongs to `TurnToast`, which is unmissable; the
   * panel's job is to keep showing the step, minus the controls that are not
   * yours to press.
   *
   * `pending` is this player's own action in flight, not someone else's turn,
   * so it stays a caption on the step rather than a toast.
   */
  const waiting = pending ? (
    <span className="text-[13px] font-semibold text-gray-500">Sending…</span>
  ) : null;

  if (state.stage === 'draw') {
    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label={stageLabel(state.stage)}
          body={<span className="text-[13px] text-gray-600">Draw for turn order — highest tile plays first.</span>}
          button={
            <>
              {canAct && (
                <button
                  type="button"
                  onClick={() => actorId && dispatch({ type: 'startGame', playerId: actorId })}
                  className="m-0 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Draw for turn order
                </button>
              )}
              {waiting}
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
          label={stageLabel(state.stage)}
          body={
            <>
              {/*
                No prose about your own tiles. They are on the board, lit and
                clickable, which says it better than a sentence does — and the
                "no tile you hold can be played" line was telling you something
                the empty board and the End turn button already told you.
              */}
              {dead.length > 0 && (
                <span className="text-[13px] text-gray-600">
                  {`${dead.join(', ')} can never be played — ${dead.length === 1 ? 'it joins' : 'they join'} two safe chains.`}
                </span>
              )}
              {!canPlace && canAct && declareEnd}
              {waiting}
              {problem}
            </>
          }
          button={
            !actorId || !canAct ? undefined : (
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
          label={stageLabel(state.stage)}
          body={
            <>
              <FoundGroups
                available={available}
                taken={taken}
                foundSize={coord ? foundingSize(state, coord) : 2}
                onSelect={
                  canAct
                    ? (startupId) =>
                        actorId && dispatch({ type: 'chooseFoundingBrand', playerId: actorId, startupId })
                    : undefined
                }
              />
              {waiting}
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
          label={stageLabel(state.stage)}
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
                    mode={canAct ? 'select' : 'static'}
                    onClick={
                      canAct
                        ? () => dispatch({ type: 'chooseSurvivor', playerId: actorId, startupId: id })
                        : undefined
                    }
                  />
                ))}
              </div>
              {waiting}
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
            label={stageLabel(state.stage)}
            body={
              <>
                <LiqQueue holders={holders} />
                <LiqActions
                  absorbedId={absorbedId}
                  survivorId={survivorId}
                  unitPrice={unitPrice}
                  canSell={canAct && keep >= 1}
                  canTrade={
                    canAct &&
                    keep >= TRADE_RATIO &&
                    (state.startups[survivorId]?.availableShares ?? 0) > staged.trade / TRADE_RATIO
                  }
                  onSell={() => setStaged({ ...staged, sell: staged.sell + 1 })}
                  onTrade={() => setStaged({ ...staged, trade: staged.trade + TRADE_RATIO })}
                />
                {waiting}
                {problem}
              </>
            }
          />
        ),
        staging: (
          <StagingZone
            label={`Keeping ${keep}`}
            cashDelta={staged.sell * unitPrice}
            shares={
              <>
                <StockStack id={absorbedId} count={keep} size="sm" />
                {/*
                  What you are getting, not only what you are giving up. A
                  trade hands in `TRADE_RATIO` absorbed shares for one survivor
                  share, and the pile showed the absorbed side alone — so the
                  staging zone answered "what am I losing" and left "what am I
                  gaining" to arithmetic. Derived from `TRADE_RATIO` rather
                  than written down, because it is a rule.
                */}
                {staged.trade > 0 && (
                  <StockStack
                    id={survivorId}
                    count={staged.trade / TRADE_RATIO}
                    size="sm"
                  />
                )}
              </>
            }
            action={
              canAct ? (
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
              ) : undefined
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

    // Every founded brand, sold out or not. Filtering on `availableShares > 0`
    // made a brand vanish from the row the moment its last share was bought —
    // and sold out is information: it is how you learn the brand is locked and
    // what everyone else has been spending on. A row that quietly gets shorter
    // says none of that.
    const founded = Object.values(state.startups).filter((s) => s.isFounded);
    const basket = Object.entries(
      staged.picks.reduce<Record<string, number>>(
        (acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }),
        {},
      ),
    );

    return {
      active: (
        <ActiveStep
          label={stageLabel(state.stage)}
          body={
            <>
              <div className="flex flex-wrap gap-2">
                {founded.map((s) => {
                  // Bound to a const so the `isStartupId` narrowing survives
                  // into the click handler; narrowing a mutable property does
                  // not reach inside a closure.
                  const id = s.id;
                  if (!isStartupId(id)) return null;
                  const price = getSharePrice(state, id);
                  const soldOut = s.availableShares === 0;
                  // The atom, not a bare button: shares are portrait
                  // certificates everywhere else in this UI — in the staging
                  // pile, in the hand zone, in the payout lines — and the buy
                  // row was the one place they appeared as unstyled text. It
                  // carries its own ticker, price and disabled treatment, so
                  // there is nothing here to restyle.
                  return (
                    <StockCard
                      key={id}
                      id={id}
                      price={price}
                      size="sm"
                      mode="add"
                      // The pill has room for one short word at 9px on a 40px
                      // card, so the badge says "sold" and the accessible name
                      // carries the whole phrase — a card nobody can press
                      // should not be announced as "Buy one Messla".
                      label={soldOut ? `${id} — sold out` : `Buy one ${id}`}
                      badge={soldOut ? 'sold' : id === freshBrand ? 'new' : undefined}
                      badgeTone={soldOut ? 'muted' : 'info'}
                      // Sold out is a third, independent reason to be inert.
                      // Folding it into the cash or buy-count test would make
                      // an empty pool look like an affordability problem.
                      disabled={
                        soldOut || !canAct || remaining <= 0 || (player?.cash ?? 0) < spent + price
                      }
                      onClick={() => setStaged({ ...staged, picks: [...staged.picks, id] })}
                    />
                  );
                })}
              </div>
              {canAct && declareEnd}
              {waiting}
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
          action={!canAct ? undefined : (
            /*
              One button, because the buy step has exactly two outcomes and
              they are the same move: you take what you staged and your turn is
              over. A separate "End turn" beside it asked the player to say
              twice what they had already said once, and reading "Confirm
              purchase" with an empty basket is the same dead end from the
              other side — hence "End turn" with an empty basket, which is all
              that press actually does. It says the outcome rather than the
              omission: "Skip" invited the question "skip what?".
            */
            <button
              type="button"
              onClick={() => {
                if (staged.picks.length > 0) {
                  dispatch({ type: 'buyShares', playerId: actorId, picks: staged.picks });
                }
                dispatch({ type: 'endTurn', playerId: actorId });
                setStaged(NOTHING_STAGED);
              }}
              className={
                staged.picks.length === 0
                  // Ending without buying is not the thing you came here to
                  // do, so it does not wear the primary treatment.
                  ? 'm-0 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50'
                  : 'm-0 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700'
              }
            >
              {staged.picks.length === 0 ? 'End turn' : 'Confirm purchase'}
            </button>
          )}
        />
      ),
    };
  }

  return { active: null, staging: idleStaging };
}
