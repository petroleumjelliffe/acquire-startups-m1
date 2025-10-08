import React, { useEffect, useState } from "react";
import type { GameState } from "../state/gameTypes";
import {
  resolveInitialDraw,
  dealOneRound,
  allHandsFull,
} from "../state/gameLogic";
export function DrawModal({
  state,
  setState,
}: {
  state: GameState;
  setState: (s: GameState) => void;
}) {
  const [drawn, setDrawn] = useState<{ name: string; tile: string }[] | null>(
    null
  );
  const [dealing, setDealing] = useState(false);
  useEffect(() => {
    const res = resolveInitialDraw(state);
    state.turnIndex = res.firstIndex;
    setDrawn(res.drawn);
    setState({ ...state });
    setTimeout(() => {
      setDealing(true);
      const dealInterval = setInterval(() => {
        dealOneRound(state);
        setState({ ...state });
        if (allHandsFull(state)) {
          clearInterval(dealInterval);
          setDealing(false);
          state.stage = "play";
          setState({ ...state });
        }
      }, 200);
    }, 800);
  }, []);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-[480px]">
        <h2 className="text-lg font-semibold">Turn Order Draw</h2>
        <p className="text-sm text-gray-600 mb-2">
          Lowest letter, then lowest number goes first.
        </p>
        <ul className="mb-3 space-y-1">
          {drawn?.map((d) => (
            <li key={d.name}>
              {d.name} → {d.tile}
            </li>
          ))}
        </ul>
        <p className="text-sm mb-1">
          <b>First:</b> {state.players[state.turnIndex].name}
        </p>
        <p className="text-sm text-gray-600">
          {dealing ? "Dealing starting hands..." : "Ready"}
        </p>
      </div>
    </div>
  );
}
