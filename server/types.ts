// server/types.ts
// Shared types between server and client

import type { GameState } from "../src/state/gameTypes";

export interface MultiplayerGameState extends GameState {
  gameId: string;
  players: MultiplayerPlayer[];
  createdAt: number;
  lastUpdated: number;
}

export interface MultiplayerPlayer {
  id: string; // Persistent UUID
  name: string;
  hand: string[];
  cash: number;
  portfolio: Record<string, number>;
  isConnected: boolean;
  socketId?: string; // Current socket connection ID
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
