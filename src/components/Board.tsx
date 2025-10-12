import React from "react";
import { Coord } from "../utils/gameHelpers";
import { Startup, TileCell, Player } from "../state/gameTypes";

export function Board({
  board,
  onPlace,
  currentHand,
  startups,
  highlightedTile,
  players,
}: {
  board: Record<Coord, TileCell>;
  onPlace: (c: Coord) => void;
  currentHand: Coord[];
  startups: Record<string, Startup>;
  highlightedTile?: Coord | null;
  players?: Player[];
}) {
  const rows = "ABCDEFGHI".split("");
  const cols = Array.from({ length: 12 }, (_, i) => i + 1);

  // Create a map of coord -> player name for last placed tiles
  const lastPlacedTiles = new Map<Coord, string>();
  if (players) {
    players.forEach(player => {
      if (player.lastPlacedTile) {
        lastPlacedTiles.set(player.lastPlacedTile, player.name);
      }
    });
  }

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
            const isHighlighted = highlightedTile === id;
            const playerName = lastPlacedTiles.get(id);

            // Build class list using CSS classes
            const tileClasses = [
              "aspect-square",
              "border",
              "text-xs",
              "relative",
            ];

            // Add state-based classes
            if (cell.placed) {
              tileClasses.push("tile-placed");
            } else {
              tileClasses.push("tile-unclaimed");
            }

            // Add startup class if applicable
            if (cell.startupId) {
              tileClasses.push(`startup-${cell.startupId}`);
            }

            // Add highlight class if needed
            if (isHighlighted) {
              tileClasses.push("tile-highlighted");
            }

            return (
              <button
                key={id}
                onClick={() => onPlace(id)}
                disabled={cell.placed}
                className={tileClasses.join(" ")}
                title={id}
              >
                {/* Tile label */}
                {/* {cell.placed && ( */}
                  <span>
                    {r}-{c}
                  </span>
                {/* )} */}
                {/* Player name overlay for last placed tile */}
                {playerName && (
                  <div className="player-tile-marker">{playerName}</div>
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
