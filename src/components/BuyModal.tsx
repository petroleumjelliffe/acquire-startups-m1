// src/components/BuyModal.tsx
import React, { useState } from "react";
import { GameState } from "../state/gameTypes";
import {
  getBuyableStartups,
  buyShares,
  endBuyPhase,
  completeTileTransaction,
} from "../state/gameLogic";

interface BuyModalProps {
  state: GameState;
  onUpdate: (newState: GameState) => void;
  onCancel?: () => void;
}

interface SelectedShare {
  id: string;
  price: number;
}

export const BuyModal: React.FC<BuyModalProps> = ({ state, onUpdate, onCancel }) => {
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

    // Complete the tile transaction (remove from hand, draw new tile)
    completeTileTransaction(newState);

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

    // Complete the tile transaction (remove from hand, draw new tile)
    completeTileTransaction(newState);

    endBuyPhase(newState);
    onUpdate(newState);
  }

  function handleCancel() {
    if (onCancel) {
      // Just call onCancel - Game.tsx will handle state reversion
      onCancel();
    }
  }

  // Count how many of each startup are in hand
  const handCounts = selectedShares.reduce((counts, share) => {
    counts[share.id] = (counts[share.id] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-white rounded-t-xl shadow-2xl w-full flex flex-col max-h-[40vh] pointer-events-auto">
        {/* Static Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-center flex-1">
            {player.name}: Buy Shares
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {/* Cash display - compact */}
          <div className="text-center mb-3">
            <span className="text-sm font-semibold">Cash: </span>
            <span className={remainingCash < 0 ? "text-red-600 font-bold text-sm" : "text-green-600 font-bold text-sm"}>
              ${remainingCash.toLocaleString()}
            </span>
            <span className="text-xs text-gray-600 ml-3">
              ({selectedShares.length}/3 selected)
            </span>
          </div>

          {/* Single row layout: Available startups + Selected shares */}
          <div className="flex gap-3 items-start justify-center">
            {/* Available startups - smaller cards, no stack effect */}
            <div className="flex gap-2">
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
                      w-20 h-24 rounded-md border-2 shadow
                      transition-all duration-200 startup-${startup.id}
                      ${canBuyMore
                        ? 'hover:shadow-md hover:scale-105 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed grayscale'
                      }
                    `}
                  >
                    <div className="h-full flex flex-col items-center justify-between p-1.5">
                      <div className="text-center flex-1 flex items-center">
                        <div className="font-semibold text-xs leading-tight">{startup.id}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] opacity-75">
                          {startup.availableShares - sharesInHand} left
                        </div>
                        <div className="font-bold text-sm">
                          ${startup.price}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {buyables.length === 0 && (
                <div className="text-xs text-gray-500 py-4 px-2">
                  No startups available
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-24 w-px bg-gray-300 mx-1"></div>

            {/* Selected shares - smaller */}
            <div className="flex gap-2 min-w-[260px]">
              {[0, 1, 2].map((slotIndex) => {
                const share = selectedShares[slotIndex];
                return share ? (
                  <button
                    key={slotIndex}
                    onClick={() => removeShareFromHand(slotIndex)}
                    className={`
                      w-20 h-24 rounded-md border-2
                      shadow hover:shadow-md
                      transition-all duration-200 hover:scale-105
                      cursor-pointer
                      startup-${share.id}
                    `}
                  >
                    <div className="h-full flex flex-col items-center justify-between p-1.5">
                      <div className="text-center flex-1 flex items-center">
                        <div className="font-semibold text-xs leading-tight">{share.id}</div>
                      </div>
                      <div className="font-bold text-sm">
                        ${share.price}
                      </div>
                    </div>
                  </button>
                ) : (
                  <div
                    key={slotIndex}
                    className="w-20 h-24 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center"
                  >
                    <span className="text-gray-400 text-xs">Slot {slotIndex + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Static Footer - compact */}
        <div className="flex justify-between items-center px-4 py-2 border-t flex-shrink-0">
          <button
            onClick={handleSkip}
            className="px-4 py-1.5 border-2 border-gray-300 rounded hover:bg-gray-100 transition-colors text-sm"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedShares.length === 0 || remainingCash < 0}
            className={`px-4 py-1.5 rounded font-semibold transition-colors text-sm ${
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
