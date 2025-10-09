// src/components/BuyModal.tsx
import React, { useState, useMemo } from "react";
import { GameState } from "../state/gameTypes";
import {
  getBuyableStartups,
  getSharePrice,
  buyShares,
  endBuyPhase,
} from "../state/gameLogic";

interface BuyModalProps {
  state: GameState;
  onUpdate: (newState: GameState) => void;
}

export const BuyModal: React.FC<BuyModalProps> = ({ state, onUpdate }) => {
  const player = state.players[state.turnIndex];
  const buyables = getBuyableStartups(state);
  const [purchases, setPurchases] = useState<Record<string, number>>({});

  const totalShares = Object.values(purchases).reduce((a, b) => a + b, 0);
  const subtotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of buyables) {
      map[s.id] = (purchases[s.id] || 0) * s.price;
    }
    return map;
  }, [buyables, purchases]);
  const grandTotal = Object.values(subtotals).reduce((a, b) => a + b, 0);

  const exceedsLimit = totalShares > 3;
  const insufficientFunds = grandTotal > player.cash;

  function adjust(id: string, delta: number) {
    setPurchases((prev) => {
      const next = { ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) };
      return next;
    });
  }

  function handleConfirm() {
    if (exceedsLimit || insufficientFunds) return;
    const newState = { ...state };
    for (const [id, count] of Object.entries(purchases)) {
      if (count > 0) buyShares(newState, player.id, id, count);
    }
    endBuyPhase(newState);
    onUpdate(newState);
  }

  function handleSkip() {
    const newState = { ...state };
    endBuyPhase(newState);
    onUpdate(newState);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-[500px] max-w-full">
        <h2 className="text-lg font-semibold mb-4">Buy Shares</h2>
        <div className="text-sm text-gray-700 mb-2">
          Cash: ${player.cash} | Shares remaining: {3 - totalShares}/3
        </div>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b font-semibold">
              <th className="text-left py-1">Startup</th>
              <th className="text-right py-1">Price</th>
              <th className="text-right py-1">Available</th>
              <th className="text-center py-1">Buy</th>
              <th className="text-right py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {buyables.map((s) => (
              <tr key={s.id} className="border-b last:border-none">
                <td className="py-1">{s.id}</td>
                <td className="py-1 text-right">${s.price}</td>
                <td className="py-1 text-right">{s.availableShares}</td>
                <td className="py-1 text-center">
                  <div className="inline-flex items-center border rounded">
                    <button
                      className="px-2 text-lg"
                      onClick={() => adjust(s.id, -1)}
                      disabled={(purchases[s.id] || 0) <= 0}
                    >
                      −
                    </button>
                    <span className="w-6 text-center">
                      {purchases[s.id] || 0}
                    </span>
                    <button
                      className="px-2 text-lg"
                      onClick={() => adjust(s.id, 1)}
                      disabled={
                        (purchases[s.id] || 0) >= s.availableShares ||
                        totalShares >= 3
                      }
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-1 text-right">${subtotals[s.id] || 0}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={4} className="text-right py-2">
                Total:
              </td>
              <td
                className={`text-right py-2 ${
                  insufficientFunds ? "text-red-600 font-bold" : ""
                }`}
              >
                ${grandTotal}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-600">
            Shares selected: {totalShares}/3
          </div>
          <div className="space-x-2">
            <button
              onClick={handleSkip}
              className="px-3 py-1 border rounded hover:bg-gray-100"
            >
              Skip
            </button>
            <button
              onClick={handleConfirm}
              disabled={exceedsLimit || insufficientFunds || totalShares === 0}
              className={`px-3 py-1 rounded ${
                exceedsLimit || insufficientFunds
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Confirm Purchase
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
