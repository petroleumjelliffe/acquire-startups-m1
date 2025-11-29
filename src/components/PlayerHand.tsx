import React from "react";
import { Coord, compareTiles } from "../utils/gameHelpers";
import { GameState } from "../state/gameTypes";
import { isUnplayableTile } from "../state/gameLogic";

export function PlayerHand({
  name,
  hand,
  onSelect,
  selectedTile,
  gameState,
}: {
  name: string;
  hand: Coord[];
  onSelect: (c: Coord) => void;
  selectedTile?: Coord | null;
  gameState?: GameState;
}) {
  return (
    <div>
      <h3 className="font-semibold">{name}'s Hand</h3>
      <div className="flex flex-wrap gap-2 mt-1">
        {/* render a sorted copy of the hand */}
        {(() => {
          const sorted = [...hand].sort(compareTiles);
          return sorted.map((h) => {
            const isSelected = selectedTile === h;
            const isUnplayable = gameState ? isUnplayableTile(gameState, h) : false;
            return (
              <button
                key={h}
                onClick={() => onSelect(h)}
                className={`border rounded px-3 py-1 transition-colors relative ${
                  isSelected
                    ? "bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300"
                    : isUnplayable
                    ? "bg-orange-100 border-orange-500 border-2 hover:bg-orange-200"
                    : "hover:bg-gray-50 border-gray-300"
                }`}
                title={isUnplayable ? "Unplayable tile - click to trade for a new tile" : undefined}
              >
                {h}
                {isUnplayable && (
                  <span className="absolute -top-1 -right-1 text-xs bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    !
                  </span>
                )}
              </button>
            );
          });
        })()}
      </div>
    </div>
  );
}
