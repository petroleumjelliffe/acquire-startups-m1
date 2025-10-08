import React from "react";
import { Coord } from "../utils/gameHelpers";

export function Board({
  board,
  onPlace,
  currentHand,
}: {
  board: Record<Coord, { placed: boolean }>;
  onPlace: (c: Coord) => void;
  currentHand: Coord[];
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
          <div className="text-xs text-gray-600 flex items-center">{r}</div>
          {cols.map((c) => {
            const id = `${r}${c}` as Coord;
            const cell = board[id];
            const isInHand = currentHand.includes(id);
            const baseColor = cell.placed
              ? "bg-gray-200"
              : isInHand
              ? "bg-blue-100 hover:bg-blue-200"
              : "hover:bg-gray-50";

            return (
              <button
                key={id}
                onClick={() => onPlace(id)}
                disabled={cell.placed}
                className={`aspect-square border text-xs ${baseColor}`}
                title={id}
              >
                {cell.placed ? `${r}${c}` : ""}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
