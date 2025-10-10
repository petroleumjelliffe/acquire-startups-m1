import type { GameState, Startup, Player, TileCell } from "./gameTypes";
import { generateAllCoords, shuffleSeeded, Coord } from "../utils/gameHelpers";

// keep your existing AVAILABLE_STARTUPS array in gameLogic.ts or a config file
import { AVAILABLE_STARTUPS } from "./gameLogic";

export function createEmptyBoard(): Record<Coord, TileCell> {
  const b: Record<string, TileCell> = {};
  for (const c of generateAllCoords()) b[c] = { placed: false };
  return b as Record<Coord, TileCell>;
}
export function createInitialGame(seed: string, names: string[]): GameState {
  const bag = shuffleSeeded(generateAllCoords(), seed);
  const board = createEmptyBoard();
  const players: Player[] = names.map((n, i) => ({
    id: `p${i + 1}`,
    name: n,
    cash: 6000,
    hand: [],
    portfolio: {}
  }));
  const startups: Record<string, Startup> = Object.fromEntries(
    AVAILABLE_STARTUPS.map((s) => [
      s.id,
      {
        ...s,
        tiles: [],
        foundingTile: null,
        totalShares: 25,
        availableShares: 25,
        isFounded: false,
      },
    ])
  );
  return {
    seed,
    stage: "draw",
    players,
    turnIndex: 0,
    board,
    bag,
    startups,
    log: [],
    // availableStartups: AVAILABLE_STARTUPS.map((s) => s.id), //list of ids
  };
}
