// src/components/EndGameBonusModal.tsx
import React from "react";
import { GameState } from "../state/gameTypes";
import { finalizeEndGame } from "../state/gameLogic";

export default function EndGameBonusModal({
  state,
  onUpdate,
  isReadOnly = false,
  currentPlayerName,
}: {
  state: GameState;
  onUpdate: (s: GameState) => void;
  isReadOnly?: boolean;
  currentPlayerName?: string;
}) {
  const endGameBonuses = state.endGameBonuses || [];

  function handleContinue() {
    const newState = structuredClone(state);
    finalizeEndGame(newState);
    onUpdate(newState);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-[600px] max-w-full flex flex-col max-h-[90vh]">
        {/* Static Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold flex-1">End Game Bonuses</h2>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <p className="text-sm text-gray-700 mb-4">
            The game has ended. Final bonuses are being awarded for all remaining chains.
          </p>

          {endGameBonuses.map((chainBonus) => (
            <div key={chainBonus.startupId} className="mb-6 last:mb-0">
              <h3 className="text-md font-semibold mb-2 text-blue-800">
                {chainBonus.startupId}
              </h3>
              <table className="w-full text-sm border-collapse mb-3">
                <thead>
                  <tr className="border-b font-semibold bg-gray-50">
                    <th className="text-left py-2 px-2">Player</th>
                    <th className="text-center py-2 px-2">Type</th>
                    <th className="text-right py-2 px-2">Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {chainBonus.bonuses.map((b, i) => (
                    <tr key={i} className="border-b last:border-none hover:bg-gray-50">
                      <td className="py-2 px-2">{b.playerName}</td>
                      <td className="text-center py-2 px-2 capitalize">{b.type}</td>
                      <td className="text-right py-2 px-2 font-semibold">${b.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {endGameBonuses.length === 0 && (
            <p className="text-sm text-gray-500 italic">No active chains to award bonuses for.</p>
          )}
        </div>

        {/* Static Footer */}
        <div className="p-6 pt-4 border-t flex-shrink-0">
          {isReadOnly ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-4 py-3 text-sm text-yellow-800">
              Waiting for <strong>{currentPlayerName}</strong> to continue...
            </div>
          ) : (
            <button
              className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 w-full font-semibold"
              onClick={handleContinue}
            >
              Continue to Final Scores
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
