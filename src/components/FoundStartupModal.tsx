// src/components/FoundStartupModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { foundStartup, completeTileTransaction } from "../state/gameLogic";
import { Coord } from "../utils/gameHelpers";

interface FoundStartupModalProps {
  state: GameState;
  foundingTile: Coord; // coordinate of the tile that triggered the founding
  onUpdate: (s: GameState) => void;
  onCancel?: () => void;
}

export const FoundStartupModal: React.FC<FoundStartupModalProps> = ({
  state,
  foundingTile,
  onUpdate,
  onCancel,
}) => {
  const available = Object.values(state.startups).filter((s) => !s.isFounded);
  const founded = Object.values(state.startups).filter((s) => s.isFounded);
  const currentPlayer = state.players[state.turnIndex];

  function handleSelect(startupId: string) {
    // const newState = { ...state };
    const newState = JSON.parse(JSON.stringify(state)) as GameState; //deep copy to avoid mutating original state
    //found the new startup that player selected
    foundStartup(newState, startupId, foundingTile);

    // Complete the tile transaction (remove from hand, draw new tile)
    completeTileTransaction(newState);

    //floodfill the unclaimed tiles connected to the founding tile
    // floodFillUnclaimed([foundingTile], newState.board);

    //grant a free share to the founder
    // grantFoundingShare(newState, currentPlayer.id, startupId);

    //proceed to buy phase
    // newState.stage = "buy"; // proceed to buy phase
    onUpdate(newState);
  }

  function handleCancel() {
    if (onCancel) {
      // Just call onCancel - Game.tsx will handle state reversion
      onCancel();
    }
  }

  // Group by tier for display
  const tierGroups = [0,1,2].map((tier) => ({
    tier,
    startups: available.filter((s) => s.tier === tier),
  }));

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-white rounded-t-xl shadow-2xl w-full pointer-events-auto max-h-[50vh] overflow-y-auto">
        <div className="flex justify-between items-center px-4 py-3 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-center flex-1">
            Select a Startup to Found
          </h2>
          {onCancel && (
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700 font-bold text-xl leading-none px-2"
              title="Cancel and return to placement"
            >
              ×
            </button>
          )}
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-3">
            {tierGroups.map(({ tier, startups }) => (
              <div key={tier}>
                <div className="text-center text-xs text-gray-600 mb-2">
                  Tier {tier}
                </div>
                <div className="flex flex-col gap-2">
                  {startups.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      className={`py-3 rounded-lg text-white font-semibold shadow hover:scale-105 transition-transform startup-${s.id} text-sm`}
                      // style={{ backgroundColor: s.color }}
                    >
                      {s.id}
                    </button>
                  ))}
                  {/* Fill empty slots for consistent column height */}
                  {Array.from({ length: Math.max(0, 3 - startups.length) }).map(
                    (_, i) => (
                      <div key={i} className="h-[44px]" />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {founded.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <h3 className="text-xs font-semibold mb-2 text-gray-700">
                Already Founded
              </h3>
              <div className="flex flex-wrap gap-2">
                {founded.map((s) => (
                  <div
                    key={s.id}
                    className={`px-2 py-1 rounded text-[10px] text-white opacity-60 cursor-not-allowed startup-${s.id.replace(
                      /\s+/g,
                      ""
                    )}`}
                    //   style={{ backgroundColor: s.color }}
                  >
                    {s.id}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
