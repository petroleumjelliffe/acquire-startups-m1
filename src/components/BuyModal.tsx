// src/components/BuyModal.tsx
import React, { useState } from "react";
import { GameState } from "../state/gameTypes";
import {
  getBuyableStartups,
  buyShares,
  endBuyPhase,
} from "../state/gameLogic";

interface BuyModalProps {
  state: GameState;
  onUpdate: (newState: GameState) => void;
}

interface SelectedShare {
  id: string;
  price: number;
}

export const BuyModal: React.FC<BuyModalProps> = ({ state, onUpdate }) => {
  const player = state.players[state.turnIndex];
  const buyables = getBuyableStartups(state);
  const [selectedShares, setSelectedShares] = useState<SelectedShare[]>([]);

  const totalCost = selectedShares.reduce((sum, share) => sum + share.price, 0);
  const remainingCash = player.cash - totalCost;

  function addShareToHand(startupId: string, price: number) {
    if (selectedShares.length >= 3) return;
    setSelectedShares([...selectedShares, { id: startupId, price }]);
  }

  function removeShareFromHand(index: number) {
    setSelectedShares(selectedShares.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    const newState = structuredClone(state);

    // Group purchases by startup ID
    const purchases: Record<string, number> = {};
    for (const share of selectedShares) {
      purchases[share.id] = (purchases[share.id] || 0) + 1;
    }

    // Execute purchases
    for (const [id, count] of Object.entries(purchases)) {
      buyShares(newState, player.id, id, count);
    }

    endBuyPhase(newState);
    onUpdate(newState);
  }

  function handleSkip() {
    const newState = structuredClone(state);
    endBuyPhase(newState);
    onUpdate(newState);
  }

  // Count how many of each startup are in hand
  const handCounts = selectedShares.reduce((counts, share) => {
    counts[share.id] = (counts[share.id] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-8 w-[900px] max-w-full">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {player.name}: Buy Shares
        </h2>

        {/* Cash display */}
        <div className="text-center mb-6">
          <div className="text-lg">
            <span className="font-semibold">Cash Available:</span>{" "}
            <span className={remainingCash < 0 ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
              ${remainingCash.toLocaleString()}
            </span>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Selected: {selectedShares.length}/3 shares (${totalCost.toLocaleString()})
          </div>
        </div>

        {/* Available startups as card stacks */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Available Startups
          </h3>
          <div className="flex gap-4 justify-center flex-wrap">
            {buyables.map((startup) => {
              const isAffordable = startup.price <= remainingCash;
              const sharesInHand = handCounts[startup.id] || 0;
              const canBuyMore = selectedShares.length < 3 &&
                               startup.availableShares > sharesInHand &&
                               isAffordable;

              return (
                <button
                  key={startup.id}
                  onClick={() => canBuyMore && addShareToHand(startup.id, startup.price)}
                  disabled={!canBuyMore}
                  className={`
                    relative w-32 h-40 rounded-lg border-2 shadow-md
                    transition-all duration-200
                    ${canBuyMore
                      ? 'hover:shadow-lg hover:scale-105 cursor-pointer'
                      : 'opacity-60 cursor-not-allowed grayscale'
                    }
                  `}
                >
                  {/* Stack effect */}
                  <div className={`absolute inset-0 rounded-lg border-2 -translate-x-1 -translate-y-1 opacity-60 startup-${startup.id}`}></div>
                  <div className={`absolute inset-0 rounded-lg border-2 -translate-x-0.5 -translate-y-0.5 opacity-80 startup-${startup.id}`}></div>

                  {/* Main card content */}
                  <div className={`relative h-full flex flex-col items-center justify-between p-3 rounded-lg border-2 startup-${startup.id}`}>
                    <div className="text-center flex-1 flex items-center">
                      <div className="font-bold text-sm leading-tight">{startup.id}</div>
                    </div>

                    <div className="text-center space-y-1">
                      <div className="text-xs opacity-75">
                        {startup.availableShares - sharesInHand} left
                      </div>
                      <div className="font-bold text-lg">
                        ${startup.price}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {buyables.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No startups available for purchase
            </div>
          )}
        </div>

        {/* Selected shares hand */}
        <div className="mb-6 min-h-[180px]">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Your Selection
          </h3>
          <div className="flex gap-4 justify-center items-center min-h-[140px] p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            {selectedShares.length === 0 ? (
              <div className="text-gray-400 text-center">
                Click a startup above to add shares to your hand
              </div>
            ) : (
              selectedShares.map((share, index) => (
                <button
                  key={index}
                  onClick={() => removeShareFromHand(index)}
                  className={`
                    w-24 h-32 rounded-lg border-2
                    shadow-md hover:shadow-lg
                    transition-all duration-200 hover:scale-105
                    cursor-pointer
                    startup-${share.id}
                  `}
                >
                  <div className="h-full flex flex-col items-center justify-between p-2">
                    <div className="text-center flex-1 flex items-center">
                      <div className="font-bold text-xs leading-tight">{share.id}</div>
                    </div>
                    <div className="font-bold text-sm">
                      ${share.price}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <button
            onClick={handleSkip}
            className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedShares.length === 0 || remainingCash < 0}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              selectedShares.length === 0 || remainingCash < 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Confirm Purchase
          </button>
        </div>
      </div>
    </div>
  );
};
