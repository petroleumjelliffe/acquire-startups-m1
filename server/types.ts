// server/types.ts
// Shared types between server and client

import type { GameState, Player } from "../src/state/gameTypes.js";

export interface MultiplayerPlayer extends Player {
  // All properties inherited from Player (id, name, cash, hand, portfolio)
  // isConnected and socketId are already optional in Player
}

export interface MultiplayerGameState extends GameState {
  gameId: string;
  players: MultiplayerPlayer[];
  createdAt: number;
  lastUpdated: number;
  isEnded?: boolean; // True when game has been manually ended or reached end stage
}

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
}

export interface WaitingRoom {
  gameId: string;
  players: RoomPlayer[];
  hostId: string;
  createdAt: number;
}

export interface GameAction {
  playerId: string;
  gameId: string;
  type: string;
  payload: any;
}

export interface SavedGameState {
  gameId: string;
  state: MultiplayerGameState;
  version: number;
}
