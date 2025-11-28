// server/machines/types.ts
// Shared types for XState machines

import type { ActorRefFrom } from "xstate";
import type { GameState } from "../../src/state/gameTypes.js";

export type PlayerStatus = "waiting" | "active" | "disconnected" | "abandoned";

export interface PlayerMachineContext {
  playerId: string;
  playerName: string;
  socketId: string | null;
  lastSeen: number;
}

export type PlayerMachineEvent =
  | { type: "YOUR_TURN" }
  | { type: "WAIT" }
  | { type: "MERGER_DECISION_NEEDED" }
  | { type: "SOCKET_CONNECTED"; socketId: string }
  | { type: "SOCKET_DISCONNECTED" }
  | { type: "RECONNECTED"; socketId: string }
  | { type: "ABANDON" }
  | { type: "TILE_PLACED"; coord: string }
  | { type: "STARTUP_FOUNDED"; startupId: string }
  | { type: "SHARES_LIQUIDATED"; choices: any }
  | { type: "SHARES_PURCHASED"; purchases: any }
  | { type: "TURN_COMPLETE" };

export interface GameRoomMachineContext {
  gameId: string;
  gameState: GameState;

  // Turn management
  currentPlayerIndex: number;
  currentMergerPlayerIndex: number | null;

  // Merger tracking
  playersWithDefunctShares: string[];
  mergerResolution: {
    survivorId: string;
    absorbedIds: string[];
    currentPlayerIndex: number;
  } | null;

  // Player actor management
  playerActors: Map<string, any>; // ActorRefFrom<typeof playerMachine>
  socketMap: Map<string, string>; // socketId -> playerId

  // Disconnection tracking
  disconnectTimers: Map<string, NodeJS.Timeout>;
}

export type GameRoomMachineEvent =
  | { type: "PLAYER_JOINED"; playerId: string; playerName: string }
  | { type: "PLAYER_READY"; playerId: string }
  | { type: "START_GAME" }
  | { type: "TILE_PLACED"; playerId: string; coord: string; newState: GameState }
  | { type: "STARTUP_FOUNDED"; playerId: string; startupId: string; newState: GameState }
  | { type: "MERGER_SURVIVOR_SELECTED"; playerId: string; survivorId: string }
  | { type: "SHARES_LIQUIDATED"; playerId: string; choices: any; newState: GameState }
  | { type: "SHARES_PURCHASED"; playerId: string; purchases: any; newState: GameState }
  | { type: "TURN_COMPLETE"; playerId: string }
  | { type: "PLAYER_DISCONNECTED"; socketId: string }
  | { type: "PLAYER_RECONNECTED"; playerId: string; socketId: string }
  | { type: "END_GAME"; playerId: string };
