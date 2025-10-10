// src/components/MergerLiquidation.tsx
import React, { useState } from "react";
import { GameState } from "../state/gameTypes";
import { completePlayerMergerLiquidation } from "../state/gameLogic";

export const MergerLiquidationModal: React.FC<{
  state: GameState;
  onUpdate: (s: GameState) => void;
}> = ({ state, onUpdate }) => {
  const ctx = state.mergerContext!;
  const {
    survivorId,
    absorbedIds,
    currentLiquidationIndex,
    shareholderQueue,
    currentShareholderIndex,
    sharePrice,
  } = ctx;

  const absorbedId = absorbedIds[currentLiquidationIndex];
  const playerId = shareholderQueue[currentShareholderIndex];
  const currentPlayer = state.players.find((p) => p.id === playerId)!;
  const owned = currentPlayer.portfolio[absorbedId] || 0;

  const [trade, setTrade] = useState(0);
  const [sell, setSell] = useState(0);

  const survivor = state.startups[survivorId];

  const maxTrade = Math.min(Math.floor(owned / 2), survivor.availableShares);
  const maxSell = owned - trade * 2;
  const held = owned - trade * 2 - sell;

  function confirmChoice() {
    const newState = structuredClone(state);
    completePlayerMergerLiquidation(newState, currentPlayer.id, {
      absorbedId,
      trade,
      sell,
    });

    onUpdate(newState);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-xl w-[600px] max-w-full">
        <h2 className="text-xl font-bold mb-2 text-center">
          {absorbedId} merged into {survivorId}
        </h2>
        <p className="text-center mb-4">
          {currentPlayer.name}, you own <b>{owned}</b> shares of {absorbedId}.
        </p>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-gray-600 border-b">
              <th className="text-left">Action</th>
              <th>Count</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Trade 2:1 for {survivorId}</td>
              <td className="text-center">
                <button
                  className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                  disabled={trade <= 0}
                  onClick={() => setTrade(trade - 1)}
                >
                  -
                </button>
                <span className="px-2">{trade}</span>
                <button
                  className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                  disabled={trade >= maxTrade}
                  onClick={() => setTrade(trade + 1)}
                >
                  +
                </button>
              </td>
              <td className="text-center">{maxTrade}</td>
            </tr>

            <tr>
              <td>Sell to bank @ ${sharePrice}</td>
              <td className="text-center">
                <button
                  className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                  disabled={sell <= 0}
                  onClick={() => setSell(sell - 1)}
                >
                  -
                </button>
                <span className="px-2">{sell}</span>
                <button
                  className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                  disabled={sell >= maxSell}
                  onClick={() => setSell(sell + 1)}
                >
                  +
                </button>
              </td>
              <td className="text-center">{maxSell}</td>
            </tr>

            <tr>
              <td>Hold</td>
              <td className="text-center font-semibold">{held}</td>
              <td className="text-center">—</td>
            </tr>
          </tbody>
        </table>

        <div className="text-right">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={confirmChoice}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
