import React from "react";
import { GameState } from "../state/gameTypes";

export function GameLog({ state }: { state: GameState }) {
  return (
    <div className="bg-white rounded-lg shadow p-3 h-full">
      <h3 className="font-semibold mb-2">Game Log</h3>
      <ul className="text-sm text-gray-700 max-h-[400px] overflow-y-auto">
        {state.log
          .slice()
          .reverse()
          .map((l, i) => (
            <li key={i} className="mb-1 border-b border-gray-100 pb-1 last:border-none">
              {l}
            </li>
          ))}
      </ul>
    </div>
  );
}
