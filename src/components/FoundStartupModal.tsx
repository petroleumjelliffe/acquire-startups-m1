// src/components/FoundStartupModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { foundStartup, grantFoundingShare } from "../state/gameLogic";
import { Coord, floodFillUnclaimed } from "../utils/gameHelpers";

interface FoundStartupModalProps {
  state: GameState;
  foundingTile: Coord; // coordinate of the tile that triggered the founding
  onUpdate: (s: GameState) => void;
}

export const FoundStartupModal: React.FC<FoundStartupModalProps> = ({
  state,
  foundingTile,
  onUpdate,
}) => {
  const available = Object.values(state.startups).filter((s) => !s.isFounded);
  const founded = Object.values(state.startups).filter((s) => s.isFounded);
  const currentPlayer = state.players[state.turnIndex];

  function handleSelect(startupId: string) {
    const newState = { ...state };
    //found the new startup that player selected
    foundStartup(newState, startupId, foundingTile);

    //floodfill the unclaimed tiles connected to the founding tile
    floodFillUnclaimed([foundingTile], newState.board);

    //grant a free share to the founder
    grantFoundingShare(newState, currentPlayer.id, startupId);

    //proceed to buy phase
    newState.stage = "buy"; // proceed to buy phase
    onUpdate(newState);
  }

  // Group by tier for display
  const tierGroups = [1, 2, 3].map((tier) => ({
    tier,
    startups: available.filter((s) => s.tier === tier),
  }));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-xl w-[700px] max-w-full">
        <h2 className="text-xl font-bold mb-4 text-center">
          Select a Startup to Found
        </h2>

        <div className="grid grid-cols-3 gap-4">
          {tierGroups.map(({ tier, startups }) => (
            <div key={tier}>
              <div className="text-center text-sm text-gray-600 mb-2">
                Tier {tier}
              </div>
              <div className="flex flex-col gap-2">
                {startups.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s.id)}
                    className="py-4 rounded-lg text-white font-semibold shadow hover:scale-105 transition-transform"
                    // style={{ backgroundColor: s.color }}
                  >
                    {s.id}
                  </button>
                ))}
                {/* Fill empty slots for consistent column height */}
                {Array.from({ length: Math.max(0, 3 - startups.length) }).map(
                  (_, i) => (
                    <div key={i} className="h-[52px]" />
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {founded.length > 0 && (
          <div className="mt-6 border-t pt-3">
            <h3 className="text-sm font-semibold mb-1 text-gray-700">
              Already Founded
            </h3>
            <div className="flex flex-wrap gap-2">
              {founded.map((s) => (
                <div
                  key={s.id}
                  className={`px-3 py-1 rounded text-xs text-white opacity-60 cursor-not-allowed startup-${s.id.replace(
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
  );
};
