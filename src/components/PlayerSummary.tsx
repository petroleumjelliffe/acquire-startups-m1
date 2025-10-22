// src/components/PlayerSummary.tsx
import React from 'react';
import type { GameState } from '../state/gameTypes';

interface PlayerSummaryProps {
  state: GameState;
  currentPlayerId?: string;
}

export const PlayerSummary: React.FC<PlayerSummaryProps> = ({ state, currentPlayerId }) => {
  // Helper to obscure cash for other players
  const getCashDisplay = (player: any, isYou: boolean) => {
    if (isYou) {
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
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <h3 className="font-bold text-lg mb-3">Players</h3>
      <div className="flex gap-3 flex-wrap">
        {state.players.map((player, index) => {
          const isCurrentTurn = index === state.turnIndex;
          // In multiplayer: isYou means the logged-in player
          // In single-player: isYou means the current turn player
          const isYou = currentPlayerId ? player.id === currentPlayerId : isCurrentTurn;
          const isConnected = (player as any).isConnected !== false;
          const portfolioCount = getPortfolioCount(player.portfolio);

          return (
            <div
              key={player.id}
              className={`flex-1 min-w-[180px] p-3 rounded-lg border-2 ${
                isCurrentTurn
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex flex-col h-full justify-between gap-2">
                {/* Top section: name and badges */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      isConnected ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                    title={isConnected ? 'Online' : 'Offline'}
                  />
                  <span className="font-semibold text-lg">{player.name}</span>
                </div>

                {/* Badges row */}
                <div className="flex gap-1 flex-wrap">
                  {isYou && (
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                      You
                    </span>
                  )}
                  {isCurrentTurn && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      Turn
                    </span>
                  )}
                </div>

                {/* Cash - obscured for other players */}
                <div className="font-bold text-green-700 text-xl">
                  {getCashDisplay(player, isYou)}
                </div>

                {/* Shares - show details for you, count for others */}
                {isYou ? (
                  <div className="flex gap-1 flex-wrap min-h-[24px]">
                    {Object.entries(player.portfolio).map(([startupId, count]) => {
                      if (count === 0) return null;
                      const startup = state.startups[startupId];
                      if (!startup?.isFounded) return null;

                      return (
                        <div
                          key={startupId}
                          className={`text-xs px-2 py-1 rounded startup-${startupId} font-semibold`}
                          title={`${count} shares of ${startupId}`}
                        >
                          {count}×
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">
                    {portfolioCount > 0 ? `${portfolioCount} shares` : 'No shares'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
