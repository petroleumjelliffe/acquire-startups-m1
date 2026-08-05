import type { GameSession } from '../../session/GameSession';
import { useGameSession } from './session/useGameSession';
import { Board } from './Board';
import { Panel } from './panel/Panel';
import { StepStack } from './panel/StepStack';
import { HandZone } from './panel/HandZone';
import { PlayersStrip } from './panel/PlayersStrip';
import { RevealOverlay } from './RevealOverlay';
import { FinalScoring } from './FinalScoring';
import { useTurnPanel } from './screen/useTurnPanel';
import { stepsOf } from './screen/stepsOf';
import { getDeadTilesInHand } from '../../engine/placement';
import { isStartupId } from '../../engine/startups';
import { getSharePrice } from '../../engine/gameLogic';
import { finalScore } from '../../engine/endGame';

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
  /**
   * The player at this device. Absent in pass-and-play, where one device is
   * shared and the viewer is therefore whoever is acting; present online,
   * where the viewer never changes and the curtain has nothing to protect.
   */
  viewerId?: string;
  /** Start over from setup. Omitted when nothing is hosting the screen. */
  onNewGame?: () => void;
  /** Leave the game entirely. Omitted when nothing is hosting the screen. */
  onExit?: () => void;
}

export function GameScreen({ session, viewerId, onNewGame, onExit }: GameScreenProps) {
  const view = useGameSession(session);
  const { state, actorId, awaitingReveal, undoableSteps, pending } = view;

  // Inert while someone else is acting, and while an answer only the server
  // can give is in flight — otherwise the buy panel stays live after "End
  // turn" and the next click is a rejection waiting to happen.
  const canAct = (viewerId === undefined || viewerId === actorId) && !pending;
  const { active, staging } = useTurnPanel(view, (intent) => session.dispatch(intent), canAct);

  const actor = state.players.find((p) => p.id === actorId);

  /**
   * Whose private state the screen shows — their tiles on the board, their
   * shares in the hand zone.
   *
   * Online that is always me: my own device, my own hand, at every stage
   * including the turn-order draw. Pass-and-play keeps its own rule, which is
   * the actor at every stage but the draw: seat one presses that button for
   * the table rather than taking a turn, and showing their hand put six of
   * their tiles on a shared board before play began.
   */
  const viewer = viewerId === undefined
    ? (state.stage === 'draw' ? undefined : actor)
    : state.players.find((p) => p.id === viewerId);

  /** Nobody is "up" until the draw has decided who is. */
  const turnKnown = state.stage !== 'draw';

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
          hand={viewer?.hand ?? []}
          placed={viewer?.lastPlacedTile ?? null}
          blocked={viewer ? getDeadTilesInHand(state, viewer.id) : []}
          onCellClick={
            canAct && actorId
              ? (coord) => session.dispatch({ type: 'placeTile', playerId: actorId, coord })
              : undefined
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
            name={viewer?.name ?? ''}
            portfolio={viewer?.portfolio ?? {}}
            cash={viewer?.cash}
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
              active: turnKnown && p.id === actorId,
            }))}
          />
        }
      />

      {viewerId === undefined && awaitingReveal && actor && (
        <div data-testid="curtain" className="absolute inset-0 z-20">
          <RevealOverlay
            playerName={actor.name}
            emoji={actor.emoji}
            onReveal={() => session.reveal()}
          />
        </div>
      )}

      {state.stage === 'end' && (
        <div
          data-testid="final-overlay"
          className="absolute inset-0 z-30 overflow-y-auto bg-white/95 p-6"
        >
          {/*
            The scoreboard is `finalScore(state)` spread straight in — its
            props *are* the engine's report, which is why there is no adapter
            here and no figure written down in `src/`. `actions` is a plain
            slot: `FinalScoring` renders whatever node it is given and still
            owns no routes or click handlers of its own. It used to be a
            sibling of `FinalScoring` instead — found by hand at 768px to sit
            on top of the winner banner, because `FinalScoring`'s root is
            `absolute inset-0` and contributes no flow height, so a "next"
            sibling anchors to the scrim's top edge rather than the card's
            bottom. Passing it as `actions` keeps it in the card's own flow,
            below the table, at every width.
          */}
          <FinalScoring
            {...finalScore(state)}
            actions={
              (onNewGame || onExit) && (
                <>
                  {onNewGame && (
                    <button
                      type="button"
                      onClick={onNewGame}
                      className="m-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                    >
                      New game
                    </button>
                  )}
                  {onExit && (
                    <button
                      type="button"
                      onClick={onExit}
                      className="m-0 rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50"
                    >
                      Back to menu
                    </button>
                  )}
                </>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
