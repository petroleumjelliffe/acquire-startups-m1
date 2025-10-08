import React from "react";
import { Coord } from "../utils/gameHelpers";
import { Startup, TileCell } from "../state/gameTypes";

export function Board({
  board,
  onPlace,
  currentHand,
  startups,
}: {
  //   board: Record<Coord, { placed: boolean }>;
  board: Record<Coord, TileCell>;
  onPlace: (c: Coord) => void;
  currentHand: Coord[];
  startups: Record<string, Startup>;
}) {
  const rows = "ABCDEFGHI".split("");
  const cols = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: "auto repeat(12, minmax(28px, 1fr))" }}
    >
      <div />
      {cols.map((c) => (
        <div key={`h${c}`} className="text-center text-xs text-gray-600">
          {c}
        </div>
      ))}
      {rows.map((r) => (
        <React.Fragment key={r}>
          {/* Row header label */}
          <div className="text-xs text-gray-600 flex items-center">{r}</div>

          {cols.map((c) => {
            const id = `${r}${c}` as Coord;
            const cell = board[id];
            const isInHand = currentHand.includes(id);

            // Base color logic (if no startup yet)
            const baseColor = cell.placed
              ? "bg-gray-200"
              : isInHand
              ? "bg-blue-100 hover:bg-blue-200"
              : "hover:bg-gray-50";

            // Add startup class if applicable
            const startupClass = cell.startupId
              ? `startup-${cell.startupId}`
              : "";

            return (
              <button
                key={id}
                onClick={() => onPlace(id)}
                disabled={cell.placed}
                className={`aspect-square border text-xs relative ${baseColor} ${startupClass}`}
                title={id}
              >
                {/* Tile label */}
                {cell.placed && (
                  <span>
                    {r}
                    {c}
                  </span>
                )}
                {/* Startup overlay label on founding tile */}
                {cell.startupId &&
                  id === startups[cell.startupId]?.foundingTile && (
                    <div className="startup-label">{cell.startupId}</div>
                  )}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
