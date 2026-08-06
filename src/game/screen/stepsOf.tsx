import type { GameState } from '../../../engine/gameTypes';
import type { StepStackEntry } from '../panel/StepStack';
import { LogDetail } from '../panel/LogDetail';
import { PayoutLines } from '../merger/PayoutLines';

/**
 * Log phases the panel does not show.
 *
 * A display filter over an intact log — the entries are still written, still
 * projected per player (with the tiles redacted for everyone but their owner),
 * still asserted by the golden corpus, and still there for Phase 4's recovery
 * to read back. This is the reason the filter lives here and not in the
 * engine: nothing about the record changes, only what the panel is willing to
 * spend a row on.
 *
 * `Drew tiles` is the bag refilling a hand at the end of a turn — bookkeeping,
 * not a move anyone made, and it doubled the length of every history.
 * `Drew for turn order` is deliberately *not* here: it is the one draw the
 * table watches, and the only record of who won the order.
 */
const HIDDEN_PHASES = new Set(['Drew tiles']);

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
  from = 0,
): StepStackEntry[] {
  const undoable = new Set(undoableSteps);

  // This turn and the one before it — not the whole game, and not the open
  // segment alone.
  //
  // Scoping it to the open segment was too deep a cut: a watcher could not see
  // what the player before them had just done, which is most of what the panel
  // is for when it is not your turn. Showing everything is the other failure —
  // by the end of a game the two or three steps you can actually take back are
  // buried in a transcript.
  //
  // One completed turn back is the whole of what someone else did: the tile
  // they placed, the brand they founded, how the merger resolved, what they
  // bought. Those entries render read-only, because `undoableSteps` only ever
  // holds ids from the open segment.
  return state.log
    .filter((entry) => entry.stepId >= from && !HIDDEN_PHASES.has(entry.phase))
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
