// src/components/PlayerStatusPanel.tsx
import React from "react";
import { GameState } from "../state/gameTypes";

export function PlayerStatusPanel({ state }: { state: GameState }) {
  return (
    <div className="bg-white rounded-lg shadow p-3 text-sm w-64 max-h-[80vh] overflow-y-auto">
      <h2 className="text-base font-semibold mb-2">Players</h2>

      {state.players.map((player) => (
        <div
          key={player.id}
          className={`border-b last:border-none pb-2 mb-2 ${
            state.players[state.turnIndex].id === player.id
              ? "bg-blue-50 border-blue-300 rounded"
              : ""
          }`}
        >
          <div className="flex justify-between items-center">
            <div className="font-medium">{player.name}</div>
            <div
              className={`font-mono ${
                player.cash < 0 ? "text-red-600" : "text-gray-800"
              }`}
            >
              ${player.cash}
            </div>
          </div>

          {/* Portfolio summary */}
          <div className="mt-1 pl-1">
            {Object.entries(player.portfolio)
              .filter(([_, count]) => count > 0)
              .map(([startupId, count]) => {
                const s = state.startups[startupId];
                // const color = s?.color || "#ccc";
                return (
                  <div
                    key={startupId}
                    className="flex justify-between text-xs items-center mb-[1px]"
                  >
                    <span className="flex items-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1 "
                        // style={{ backgroundColor: color }}
                      />
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
        </div>
      ))}
    </div>
  );
}
