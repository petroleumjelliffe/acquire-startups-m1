// src/components/PlayerStatusPanel.tsx
import React from "react";
import { GameState } from "../state/gameTypes";

export function PlayerStatusPanel({ state, currentPlayerId }: { state: GameState; currentPlayerId?: string }) {
  // Helper to obscure cash for other players (single player shows all for now)
  const getCashDisplay = (player: any, isCurrentPlayer: boolean) => {
    if (!currentPlayerId || isCurrentPlayer) {
      return `$${player.cash}`;
    }
    // Show n '$' characters where n = cash/2000 rounded
    const dollarCount = Math.round(player.cash / 2000);
    return '$'.repeat(Math.max(1, dollarCount));
  };

  // Helper to get portfolio count
  const getPortfolioCount = (portfolio: Record<string, number>) => {
    return Object.values(portfolio).reduce((sum, count) => sum + count, 0);
  };

  return (
    <div className="text-sm">
      <h2 className="text-base font-semibold mb-2">Players</h2>

      {state.players.map((player) => {
        const isCurrentTurn = state.players[state.turnIndex].id === player.id;
        const isYou = currentPlayerId ? player.id === currentPlayerId : true; // In single player, show all
        const portfolioCount = getPortfolioCount(player.portfolio);

        return (
          <div
            key={player.id}
            className={`border-b last:border-none pb-2 mb-2 ${
              isCurrentTurn ? "bg-blue-50 border-blue-300 rounded p-2" : ""
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="font-medium">{player.name}</div>
              <div
                className={`font-mono ${
                  player.cash < 0 ? "text-red-600" : "text-gray-800"
                }`}
              >
                {getCashDisplay(player, isYou)}
              </div>
            </div>

            {/* Portfolio summary - show details for you, count for others */}
            {isYou ? (
              <div className="mt-1 pl-1">
                {Object.entries(player.portfolio)
                  .filter(([_, count]) => count > 0)
                  .map(([startupId, count]) => {
                    return (
                      <div
                        key={startupId}
                        className="flex justify-between text-xs items-center mb-[1px]"
                      >
                        <span className="flex items-center">
                          <span className="inline-block w-2 h-2 rounded-full mr-1" />
                          {startupId}
                        </span>
                        <span className="font-mono">{count}</span>
                      </div>
                    );
                  })}

                {/* No shares */}
                {Object.values(player.portfolio).every((v) => v === 0) && (
                  <div className="text-xs text-gray-400 italic">No holdings</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-600 mt-1 pl-1">
                {portfolioCount > 0 ? `${portfolioCount} shares` : 'No holdings'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
