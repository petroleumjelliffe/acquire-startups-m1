import type { Coord } from "../utils/gameHelpers";
export type Stage = "setup" | "draw" | "dealHands" | "play" | "merger" | "end";
export interface TileCell {
  placed: boolean;
  startupId?: string;
}

export type StartupId = "Gobble" | "Scrapple" | "PaperfulPost" | "CamCrooned" | "Messla" | "ZuckFace" | "WrecksonMobil";

export interface Player {
  id: string;
  name: string;
  cash: number;
  hand: Coord[];
  portfolio: Record<string, number>; //startupId -> shares owned
}
export interface Startup {
  id: string; //todo: replace with StartupId type
  tiles: Coord[]; //TODO: deprecate in favor of getStartupTiles from Board
  foundingTile: Coord|null;
  tier: number; //0-2
  totalShares: number; //usually 25
  availableShares: number; //starts at totalShares
  isFounded: boolean; 
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
  startups: Record<string, Startup >; //all
  // availableStartups: string[]; //available ids
}
