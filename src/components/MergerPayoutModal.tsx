// src/components/MergerPayoutModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { finalizeMergerPayout, completeTileTransaction } from "../state/gameLogic";

export default function MergerPayoutModal({
  state,
  onUpdate,
  onCancel,
  isReadOnly = false,
  currentPlayerName,
}: {
  state: GameState;
  onUpdate: (s: GameState) => void;
  onCancel?: () => void;
  isReadOnly?: boolean;
  currentPlayerName?: string;
}) {
  const bonuses: any[] = (state as any).pendingBonuses || [];
  const survivor = state.mergerContext?.survivorId;
  const absorbed = state.mergerContext?.absorbedIds || [];

  function handleContinue() {
    const newState = { ...state };

    // Complete the tile transaction (remove from hand, draw new tile)
    completeTileTransaction(newState);

    finalizeMergerPayout(newState);
    onUpdate(newState);
  }

  function handleCancel() {
    if (onCancel) {
      // Just call onCancel - Game.tsx will handle state reversion
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-[500px] max-w-full flex flex-col max-h-[90vh]">
        {/* Static Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold flex-1">Merger Resolution</h2>
          {onCancel && !isReadOnly && (
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700 font-bold text-2xl leading-none px-2"
              title="Cancel and return to placement"
            >
              ×
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <p className="text-sm text-gray-700 mb-3">
            {absorbed.join(", ")} have been absorbed into {survivor}.
          </p>

          <table className="w-full text-sm border-collapse mb-3">
            <thead>
              <tr className="border-b font-semibold">
                <th className="text-left py-1">Player</th>
                <th className="text-center py-1">Type</th>
                <th className="text-right py-1">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {bonuses.map((b, i) => (
                <tr key={i} className="border-b last:border-none">
                  <td className="py-1">{b.playerName}</td>
                  <td className="text-center py-1 capitalize">{b.type}</td>
                  <td className="text-right py-1">${b.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Static Footer */}
        <div className="p-6 pt-4 border-t flex-shrink-0">
          {/* Show appropriate button based on read-only state */}
          {isReadOnly ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-4 py-3 text-sm text-yellow-800">
              Waiting for <strong>{currentPlayerName}</strong> to continue...
            </div>
          ) : (
            <button
              className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 w-full"
              onClick={handleContinue}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
