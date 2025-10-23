// src/components/MergerPayoutModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { finalizeMergerPayout, completeTileTransaction } from "../state/gameLogic";

export default function MergerPayoutModal({
  state,
  onUpdate,
  onCancel,
}: {
  state: GameState;
  onUpdate: (s: GameState) => void;
  onCancel?: () => void;
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg w-[500px]">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold flex-1">Merger Resolution</h2>
          {onCancel && (
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700 font-bold text-2xl leading-none px-2"
              title="Cancel and return to placement"
            >
              ×
            </button>
          )}
        </div>
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

        <button
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
