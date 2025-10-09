// src/components/MergerPayoutModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { finalizeMergerPayout } from "../state/gameLogic";

export default function MergerPayoutModal({
  state,
  onUpdate,
}: {
  state: GameState;
  onUpdate: (s: GameState) => void;
}) {
  const bonuses: any[] = (state as any).pendingBonuses || [];
  const survivor = state.merger?.survivorId;
  const absorbed = state.merger?.absorbedIds || [];

  function handleContinue() {
    const newState = { ...state };
    finalizeMergerPayout(newState);
    onUpdate(newState);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg w-[500px]">
        <h2 className="text-lg font-bold mb-2">Merger Resolution</h2>
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
