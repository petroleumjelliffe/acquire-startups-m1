import { useEffect, useState, type ReactNode } from 'react';
import type { Intent } from '../../../engine/intents';
import type { GameState, StartupId } from '../../../engine/gameTypes';
import type { SessionView } from '../session/GameSession';
import type { Coord } from '../../../engine/gameHelpers';
import { ActiveStep } from '../panel/ActiveStep';
import { StagingZone } from '../panel/StagingZone';
import { FoundGroups } from '../FoundGroups';
import { floodFillUnclaimed } from '../../../engine/gameHelpers';
import { isStartupId } from '../../../engine/startups';

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
          body={<span className="text-[13px] text-gray-600">Draw for turn order — lowest tile plays first.</span>}
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
    return {
      staging: idleStaging,
      active: (
        <ActiveStep
          label="Place a tile"
          body={
            <>
              <span className="text-[13px] text-gray-600">Choose one of your tiles on the board.</span>
              {problem}
            </>
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

  return { active: null, staging: idleStaging };
}
