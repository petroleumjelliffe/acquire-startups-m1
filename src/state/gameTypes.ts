import type { Coord } from "../utils/gameHelpers";
export type Stage = "setup" | "draw" | "dealHands" | "play" | "merger" | "end";
export interface TileCell {
  placed: boolean;
  startupId?: string;
}
export interface Player {
  id: string;
  name: string;
  cash: number;
  hand: Coord[];
}
export interface Startup {
  id: string;
//   color?: string;
  tiles: Coord[];
  foundingTile: Coord;
}

export interface GameState {
    // color?: string;
  seed: string;
  stage: Stage;
  players: Player[];
  turnIndex: number;
  board: Record<Coord, TileCell>;
  bag: Coord[];
  log: string[];
  //   startups: Record<string, Startup>;
  startups: Record<string, Startup >; //active only
  availableStartups?: string[]; //available ids
}
