import React from "react";
import { GameState } from "../state/gameTypes";
import { PlayerStatusPanel } from "./PlayerStatusPanel";
export function GameLog({ state }: { state: GameState }) {
  return (
    <div>
      <PlayerStatusPanel state={state} />
      <h3 className="font-semibold">Log</h3>
      <ul className="text-sm text-gray-700 max-h-40 overflow-auto">
        {state.log
          .slice()
          .reverse()
          .map((l, i) => (
            <li key={i}>{l}</li>
          ))}
      </ul>
    </div>
  );
}
