import React from "react";
import { Coord, compareTiles } from "../utils/gameHelpers";
export function PlayerHand({
  name,
  hand,
  onSelect,
  selectedTile,
}: {
  name: string;
  hand: Coord[];
  onSelect: (c: Coord) => void;
  selectedTile?: Coord | null;
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
            return (
              <button
                key={h}
                onClick={() => onSelect(h)}
                className={`border rounded px-3 py-1 transition-colors ${
                  isSelected
                    ? "bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300"
                    : "hover:bg-gray-50 border-gray-300"
                }`}
              >
                {h}
              </button>
            );
          });
        })()}
        
      </div>
    </div>
  );
}
