import type { GameState } from '../../../engine/gameTypes';
import type { StepStackEntry } from '../panel/StepStack';
import { LogDetail } from '../panel/LogDetail';
import { PayoutLines } from '../merger/PayoutLines';

/**
 * The engine's log, rendered as the panel's step stack.
 *
 * Most steps render their tokens through `LogDetail`. A step carrying a typed
 * payload renders the component that payload was made for — a merger payout is
 * a table of who was paid and why, not a sentence.
 */
export function stepsOf(
  state: GameState,
  undoableSteps: number[],
  segmentStart = 0,
): StepStackEntry[] {
  const undoable = new Set(undoableSteps);

  // This turn, not the whole game.
  //
  // The stack existed to be the undo surface for the open segment, and it was
  // accumulating every step ever taken instead — by the end of a game it was a
  // scrolling transcript in which the two or three steps you could actually
  // take back were buried. A segment's steps are exactly those filed at or
  // after its start.
  return state.log
    .filter((entry) => entry.stepId >= segmentStart)
    .map((entry) => ({
    stepId: entry.stepId,
    phase: entry.phase,
    undoable: undoable.has(entry.stepId),
    detail:
      entry.payload?.kind === 'payout' ? (
        <PayoutLines
          bonuses={entry.payload.bonuses.map((b) => ({
            playerName: b.playerName,
            emoji: state.players.find((p) => p.id === b.playerId)?.emoji,
            qty: b.shares,
            type: b.type,
            amount: b.amount,
          }))}
        />
      ) : (
        <LogDetail detail={entry.detail} />
      ),
  }));
}
