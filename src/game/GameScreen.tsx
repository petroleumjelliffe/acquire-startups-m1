import type { GameSession } from './session/GameSession';
import { useGameSession } from './session/useGameSession';
import { Board } from './Board';
import { Panel } from './panel/Panel';
import { StepStack } from './panel/StepStack';
import { HandZone } from './panel/HandZone';
import { PlayersStrip } from './panel/PlayersStrip';
import { RevealOverlay } from './RevealOverlay';
import { useTurnPanel } from './screen/useTurnPanel';
import { stepsOf } from './screen/stepsOf';
import { getDeadTilesInHand } from '../../engine/placement';
import { isStartupId } from '../../engine/startups';
import { getSharePrice } from '../../engine/gameLogic';

/**
 * The composed game: board left, panel right, one curtain over both.
 *
 * The curtain covers the whole surface rather than just the board because the
 * two secrets live in different columns — the actor's tiles are on the board,
 * their shares are in the panel's hand zone — while cash is public either way
 * through the players strip. Covering one column would leak the other.
 *
 * Every panel slot is passed on every render so the zone order and the zone
 * heights never depend on the stage.
 *
 * Composition only. New interaction beats belong in `./screen/`.
 */
export interface GameScreenProps {
  session: GameSession;
}

export function GameScreen({ session }: GameScreenProps) {
  const view = useGameSession(session);
  const { state, actorId, awaitingReveal, undoableSteps } = view;
  const { active, staging } = useTurnPanel(view, (intent) => session.dispatch(intent));

  const actor = state.players.find((p) => p.id === actorId);
  const prices = Object.fromEntries(
    Object.values(state.startups)
      .filter((s) => s.isFounded && isStartupId(s.id))
      .map((s) => [s.id, getSharePrice(state, s.id)]),
  );

  return (
    <div
      data-testid="game-surface"
      className="relative flex h-screen w-full overflow-hidden bg-gray-50"
    >
      <div className="flex min-w-0 flex-1 items-center justify-center p-4">
        <Board
          board={state.board}
          hand={actor?.hand ?? []}
          placed={actor?.lastPlacedTile ?? null}
          blocked={actorId ? getDeadTilesInHand(state, actorId) : []}
          onCellClick={(coord) =>
            actorId && session.dispatch({ type: 'placeTile', playerId: actorId, coord })
          }
        />
      </div>

      <Panel
        stepstack={
          <StepStack
            entries={stepsOf(state, undoableSteps)}
            onUndo={(stepId) => session.undoTo(stepId)}
          />
        }
        active={active}
        staging={staging}
        hand={
          <HandZone
            name={actor?.name ?? ''}
            portfolio={actor?.portfolio ?? {}}
            cash={actor?.cash ?? 0}
            prices={prices}
          />
        }
        players={
          <PlayersStrip
            players={state.players.map((p) => ({
              id: p.id,
              emoji: p.emoji,
              name: p.name,
              cash: p.cash,
              active: p.id === actorId,
            }))}
          />
        }
      />

      {awaitingReveal && actor && (
        <div data-testid="curtain" className="absolute inset-0 z-20">
          <RevealOverlay
            playerName={actor.name}
            emoji={actor.emoji}
            onReveal={() => session.reveal()}
          />
        </div>
      )}
    </div>
  );
}
