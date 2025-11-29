// src/components/GameOverScreen.tsx
import React from "react";
import { GameState } from "../state/gameTypes";

export default function GameOverScreen({
  state,
}: {
  state: GameState;
}) {
  const finalScores = state.finalScores || [];
  const winners = state.winners || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-[700px] max-w-full flex flex-col max-h-[90vh]">
        {/* Static Header */}
        <div className="p-6 pb-4 border-b flex-shrink-0 bg-gradient-to-r from-yellow-400 to-yellow-500">
          <h2 className="text-2xl font-bold text-center text-white">Game Over!</h2>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {/* Winner Announcement */}
          {winners.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
              <h3 className="text-xl font-bold text-center text-yellow-800">
                {winners.length > 1 ? "🏆 Winners 🏆" : "🏆 Winner 🏆"}
              </h3>
              <p className="text-center text-lg font-semibold text-yellow-900 mt-2">
                {winners.map(winnerId => {
                  const winner = finalScores.find(s => s.playerId === winnerId);
                  return winner?.playerName;
                }).join(", ")}
              </p>
            </div>
          )}

          {/* Final Scores Table */}
          <div className="space-y-4">
            {finalScores.map((score, index) => {
              const isWinner = winners.includes(score.playerId);

              return (
                <div
                  key={score.playerId}
                  className={`border rounded-lg p-4 ${
                    isWinner
                      ? "border-yellow-400 bg-yellow-50 shadow-md"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-400">
                        #{index + 1}
                      </span>
                      <h3
                        className={`text-lg font-bold ${
                          isWinner ? "text-yellow-800" : "text-gray-800"
                        }`}
                      >
                        {score.playerName}
                        {isWinner && " 👑"}
                      </h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 uppercase font-semibold">
                        Final Cash
                      </div>
                      <div
                        className={`text-2xl font-bold ${
                          isWinner ? "text-yellow-700" : "text-green-700"
                        }`}
                      >
                        ${score.finalCash.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-blue-50 rounded p-2">
                      <div className="text-xs text-gray-600 mb-1">Cash on Hand</div>
                      <div className="font-semibold text-blue-800">
                        ${score.cashBefore.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded p-2">
                      <div className="text-xs text-gray-600 mb-1">Stock Value</div>
                      <div className="font-semibold text-purple-800">
                        ${score.stockValue.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded p-2">
                      <div className="text-xs text-gray-600 mb-1">Bonuses</div>
                      <div className="font-semibold text-green-800">
                        ${score.bonusTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Bonus Breakdown */}
                  {score.bonusTotal > 0 && state.endGameBonuses && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-600 mb-2 font-semibold">
                        Bonus Breakdown:
                      </div>
                      <div className="space-y-1">
                        {state.endGameBonuses.map(chainBonus => {
                          const playerBonuses = chainBonus.bonuses.filter(
                            b => b.playerId === score.playerId
                          );
                          return playerBonuses.map((bonus, i) => (
                            <div
                              key={`${chainBonus.startupId}-${i}`}
                              className="flex justify-between text-xs"
                            >
                              <span className="text-gray-600">
                                {chainBonus.startupId} ({bonus.type})
                              </span>
                              <span className="font-semibold text-green-700">
                                +${bonus.amount.toLocaleString()}
                              </span>
                            </div>
                          ));
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Static Footer */}
        <div className="p-6 pt-4 border-t flex-shrink-0 bg-gray-50">
          <p className="text-center text-sm text-gray-600">
            Thanks for playing! Refresh the page to start a new game.
          </p>
        </div>
      </div>
    </div>
  );
}
