import React from "react";
import { GameState } from "../../engine/gameTypes";
import { renderLogText } from "../../engine/log";

export function GameLog({ state }: { state: GameState }) {
  return (
    <div className="bg-white rounded-lg shadow p-3">
      <h3 className="font-semibold mb-2">Game Log</h3>
      <ul className="text-sm text-gray-700 max-h-[300px] overflow-y-auto">
        {state.log
          .slice()
          .reverse()
          .map((entry) => (
            <li key={entry.stepId} className="mb-1 border-b border-gray-100 pb-1 last:border-none">
              <span className="log-phase">{entry.phase}</span>
              <span className="log-detail">{renderLogText(entry)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
