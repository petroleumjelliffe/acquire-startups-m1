// server/gameManager.ts
// Manages active game instances

import type { MultiplayerGameState, MultiplayerPlayer } from "./types.js";
import { saveGame, loadAllGames } from "./persistence.js";
import { createInitialGame } from "../src/state/gameInit.js";

export class GameManager {
  private games: Map<string, MultiplayerGameState> = new Map();

  /**
   * Initialize game manager and load saved games from disk
   */
  async initialize(): Promise<void> {
    const savedGames = await loadAllGames();

    for (const [gameId, state] of savedGames) {
      this.games.set(gameId, state);
      // Mark all players as disconnected on server startup
      state.players.forEach((p) => (p.isConnected = false));
    }

    console.log(`✓ GameManager initialized with ${this.games.size} games`);
  }

  /**
   * Create a new game from waiting room players
   */
  createGame(
    gameId: string,
    players: Array<{ id: string; name: string }>,
    seed?: string
  ): MultiplayerGameState {
    // Create initial game state using existing logic
    const playerNames = players.map((p) => p.name);
    const gameSeed = seed || `game-${gameId}-${Date.now()}`;
    const baseState = createInitialGame(gameSeed, playerNames);

    // Convert to multiplayer game state
    const multiplayerPlayers: MultiplayerPlayer[] = baseState.players.map(
      (p, index) => ({
        ...p,
        id: players[index].id, // Use persistent player IDs
        isConnected: true,
        socketId: undefined,
      })
    );

    const gameState: MultiplayerGameState = {
      ...baseState,
      gameId,
      players: multiplayerPlayers,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    this.games.set(gameId, gameState);
    console.log(`✓ Created game: ${gameId} with ${players.length} players`);

    // Save immediately
    saveGame(gameId, gameState).catch((err) =>
      console.error("Failed to save new game:", err)
    );

    return gameState;
  }

  /**
   * Get a game by ID
   */
  getGame(gameId: string): MultiplayerGameState | null {
    return this.games.get(gameId) || null;
  }

  /**
   * Update game state and persist to disk
   */
  async updateGame(gameId: string, state: MultiplayerGameState): Promise<void> {
    state.lastUpdated = Date.now();
    this.games.set(gameId, state);

    // Save to disk
    await saveGame(gameId, state);
  }

  /**
   * Mark player as connected
   */
  playerConnected(
    gameId: string,
    playerId: string,
    socketId: string
  ): MultiplayerGameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    const player = game.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.isConnected = true;
    player.socketId = socketId;

    console.log(`✓ Player connected: ${player.name} to ${gameId}`);
    return game;
  }

  /**
   * Mark player as disconnected
   */
  playerDisconnected(gameId: string, socketId: string): MultiplayerGameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    const player = game.players.find((p) => p.socketId === socketId);
    if (!player) return null;

    player.isConnected = false;
    player.socketId = undefined;

    console.log(`✓ Player disconnected: ${player.name} from ${gameId}`);
    return game;
  }

  /**
   * Get all active games (for debugging)
   */
  getAllGames(): MultiplayerGameState[] {
    return Array.from(this.games.values());
  }

  /**
   * Delete a game (called when game ends or is abandoned)
   */
  deleteGame(gameId: string): void {
    this.games.delete(gameId);
    console.log(`✓ Deleted game: ${gameId}`);
  }
}
