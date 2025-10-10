// src/components/MergerChoiceModal.tsx
import React, { useState } from "react";
import { GameState } from "../state/gameTypes";
import { completePlayerMergerLiquidation } from "../state/gameLogic";

export const MergerLiquidationModal: React.FC<{
  state: GameState;
  onUpdate: (s: GameState) => void;
}> = ({ state, onUpdate }) => {
  const {
    survivorId,
    absorbedIds,
    payoutQueue,
    currentChoiceIndex,
    sharePrice,
  } = state.mergerContext!;
  const currentPlayer = state.players[payoutQueue[currentChoiceIndex]];
  const owned = currentPlayer.portfolio[absorbedIds] || 0;
  const [trade, setTrade] = useState(0);
  const [sell, setSell] = useState(0);

  const survivor = state.startups[survivorId];

  const maxTrade = Math.min(Math.floor(owned / 2), survivor.availableShares);
  const maxSell = owned - trade * 2;

  function confirmChoice() {
    const newState = structuredClone(state);
    completePlayerMergerLiquidation(newState, currentPlayer.id, {
      survivorId,
      absorbedId,
      trade,
      sell,
      sharePrice,
    });

    const nextIndex = currentChoiceIndex + 1;
    if (nextIndex < payoutQueue.length) {
      newState.mergerContext!.currentChoiceIndex = nextIndex;
    } else {
      // All players done, clean up
      delete newState.mergerContext;
      newState.stage = "buy";
    }

    onUpdate(newState);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-xl w-[600px] max-w-full">
        <h2 className="text-xl font-bold mb-2 text-center">
          {absorbedId} has merged into {survivorId}
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
                  disabled={trade <= 0}
                  onClick={() => setTrade(trade - 1)}
                >
                  -
                </button>
                <span className="px-2">{trade}</span>
                <button
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
                <button disabled={sell <= 0} onClick={() => setSell(sell - 1)}>
                  -
                </button>
                <span className="px-2">{sell}</span>
                <button
                  disabled={sell >= maxSell}
                  onClick={() => setSell(sell + 1)}
                >
                  +
                </button>
              </td>
              <td className="text-center">{maxSell}</td>
            </tr>
          </tbody>
        </table>

        <div className="text-right">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={confirmChoice}
          >
            {currentChoiceIndex < payoutQueue.length - 1
              ? "Next Player →"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
