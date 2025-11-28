// src/components/SurvivorSelectionModal.tsx
import React, { useState } from "react";
import { GameState } from "../state/gameTypes";
import { Coord } from "../utils/gameHelpers";

interface SurvivorSelectionModalProps {
  state: GameState;
  tiedStartupIds: string[];
  placedTile: Coord;
  onSelect: (survivorId: string) => void;
  onCancel: () => void;
}

export const SurvivorSelectionModal: React.FC<SurvivorSelectionModalProps> = ({
  state,
  tiedStartupIds,
  placedTile,
  onSelect,
  onCancel,
}) => {
  const [selectedSurvivor, setSelectedSurvivor] = useState<string | null>(null);
  const currentPlayer = state.players[state.turnIndex];

  function handleConfirm() {
    if (selectedSurvivor) {
      onSelect(selectedSurvivor);
    }
  }

  function handleCancel() {
    onCancel();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-w-full flex flex-col max-h-[90vh]">
        {/* Static Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b flex-shrink-0">
          <h2 className="text-xl font-bold text-center flex-1">
            Choose Surviving Chain
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-500 hover:text-gray-700 font-bold text-2xl leading-none px-2"
            title="Cancel and return to placement"
          >
            ×
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <p className="text-center text-gray-700 mb-6">
            {currentPlayer.name}, the following chains are tied in size. Select which chain will survive the merger:
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            {tiedStartupIds.map((startupId) => {
              const startup = state.startups[startupId];
              const isSelected = selectedSurvivor === startupId;

              return (
                <button
                  key={startupId}
                  onClick={() => setSelectedSurvivor(startupId)}
                  className={`
                    relative w-48 h-64 rounded-lg border-4 shadow-lg
                    transition-all duration-200
                    ${isSelected
                      ? 'border-blue-600 scale-105 shadow-xl'
                      : 'border-gray-300 hover:border-blue-400 hover:scale-102'
                    }
                  `}
                >
                  {/* Card background with startup color */}
                  <div className={`h-full flex flex-col items-center justify-center p-4 rounded-md startup-${startupId}`}>
                    <div className="text-center space-y-3">
                      <div className="font-bold text-2xl text-white drop-shadow-md">
                        {startupId}
                      </div>
                      <div className="text-white text-sm opacity-90">
                        Size: {startup.tiles?.length || 0} tiles
                      </div>
                      <div className="text-white text-sm opacity-90">
                        Tier: {startup.tier}
                      </div>
                    </div>
                  </div>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Static Footer */}
        <div className="p-6 pt-4 border-t flex-shrink-0">
          <div className="flex justify-between items-center">
            <button
              onClick={handleCancel}
              className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedSurvivor}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                selectedSurvivor
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
