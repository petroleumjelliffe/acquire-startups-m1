// server/gameManagerXState.ts
// XState-powered game manager that uses actor model

import { createActor, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { MultiplayerGameState, MultiplayerPlayer } from "./types.js";
import { saveGame, loadAllGames } from "./persistence.js";
import { createInitialGame } from "../src/state/gameInit.js";
import { gameRoomMachine } from "./machines/gameRoomMachine.js";
import type { GameRoomMachineEvent } from "./machines/types.js";

type GameRoomActor = ActorRefFrom<typeof gameRoomMachine>;
type GameRoomSnapshot = SnapshotFrom<typeof gameRoomMachine>;

export class GameManagerXState {
  private gameActors: Map<string, GameRoomActor> = new Map();
  private gameSubscriptions: Map<string, () => void> = new Map();
  private broadcastSubscriptions: Map<string, () => void> = new Map();

  /**
   * Initialize game manager and load saved games from disk
   */
  async initialize(): Promise<void> {
    const savedGames = await loadAllGames();

    for (const [gameId, state] of savedGames) {
      // Don't restore ended games
      if (state.isEnded || state.stage === "end") {
        console.log(`⏭️  Skipping ended game: ${gameId}`);
        continue;
      }

      // Mark all players as disconnected on server startup
      state.players.forEach((p) => {
        p.isConnected = false;
        p.socketId = undefined;
      });

      // Create actor from saved state
      this.createActorFromState(gameId, state);
    }

    console.log(`✓ GameManager initialized with ${this.gameActors.size} games`);
  }

  /**
   * Create actor from existing game state (for loading from persistence)
   */
  private createActorFromState(
    gameId: string,
    gameState: MultiplayerGameState
  ): GameRoomActor {
    const actor = createActor(gameRoomMachine, {
      input: {
        gameId,
        gameState,
      },
      inspect: (event) => {
        if (event.type === "@xstate.snapshot") {
          console.log(
            `[GameRoom ${gameId}] State: ${JSON.stringify(event.snapshot.value)}`
          );
        }
      },
    });

    // Subscribe to state changes for persistence
    const unsubscribe = actor.subscribe((snapshot) => {
      console.log(`[GameManager] Actor state changed for ${gameId}, stage: ${snapshot.context.gameState.stage}`);
      this.persistSnapshot(gameId, snapshot);
    });

    this.gameSubscriptions.set(gameId, unsubscribe);
    actor.start();
    this.gameActors.set(gameId, actor);

    console.log(`✓ Created actor for game: ${gameId}`);
    return actor;
  }

  /**
   * Persist snapshot to disk
   */
  private async persistSnapshot(gameId: string, snapshot: GameRoomSnapshot) {
    try {
      const gameState = snapshot.context.gameState as MultiplayerGameState;
      gameState.lastUpdated = Date.now();
      await saveGame(gameId, gameState);
    } catch (error) {
      console.error(`Failed to persist game ${gameId}:`, error);
    }
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

    // Create actor
    this.createActorFromState(gameId, gameState);

    console.log(`✓ Created game: ${gameId} with ${players.length} players`);
    return gameState;
  }

  /**
   * Get game actor
   */
  getGameActor(gameId: string): GameRoomActor | null {
    return this.gameActors.get(gameId) || null;
  }

  /**
   * Get game state snapshot (backward compatible with old API)
   */
  getGame(gameId: string): MultiplayerGameState | null {
    const actor = this.gameActors.get(gameId);
    if (!actor) return null;

    const snapshot = actor.getSnapshot();
    return snapshot.context.gameState as MultiplayerGameState;
  }

  /**
   * Send event to game actor
   */
  sendEvent(gameId: string, event: GameRoomMachineEvent): void {
    const actor = this.gameActors.get(gameId);
    if (!actor) {
      console.warn(`Cannot send event: Game ${gameId} not found`);
      return;
    }

    actor.send(event);
  }

  /**
   * Update game state (backward compatible - sends state update event)
   */
  async updateGame(gameId: string, state: MultiplayerGameState): Promise<void> {
    const actor = this.gameActors.get(gameId);
    if (!actor) {
      console.warn(`Cannot update: Game ${gameId} not found`);
      return;
    }

    // Instead of directly updating, send appropriate event based on stage
    // For now, we'll directly update the context (this is a bridge during migration)
    const snapshot = actor.getSnapshot();
    snapshot.context.gameState = state;
    state.lastUpdated = Date.now();

    // Persist
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
    const actor = this.gameActors.get(gameId);
    if (!actor) return null;

    // Send reconnect event to actor
    actor.send({
      type: "PLAYER_RECONNECTED",
      playerId,
      socketId,
    });

    return this.getGame(gameId);
  }

  /**
   * Mark player as disconnected
   */
  playerDisconnected(gameId: string, socketId: string): MultiplayerGameState | null {
    const actor = this.gameActors.get(gameId);
    if (!actor) return null;

    // Send disconnect event to actor
    actor.send({
      type: "PLAYER_DISCONNECTED",
      socketId,
    });

    return this.getGame(gameId);
  }

  /**
   * Get all active games (for debugging)
   */
  getAllGames(): MultiplayerGameState[] {
    return Array.from(this.gameActors.values()).map((actor) => {
      const snapshot = actor.getSnapshot();
      return snapshot.context.gameState as MultiplayerGameState;
    });
  }

  /**
   * Delete a game (called when game ends or is abandoned)
   */
  deleteGame(gameId: string): void {
    const actor = this.gameActors.get(gameId);
    if (actor) {
      actor.stop();
    }

    const unsubscribe = this.gameSubscriptions.get(gameId);
    if (unsubscribe) {
      unsubscribe();
      this.gameSubscriptions.delete(gameId);
    }

    this.gameActors.delete(gameId);
    console.log(`✓ Deleted game: ${gameId}`);
  }

  /**
   * Subscribe to game state changes (only one broadcast subscription per game)
   */
  subscribeToGame(
    gameId: string,
    callback: (gameState: MultiplayerGameState) => void
  ): (() => void) | null {
    const actor = this.gameActors.get(gameId);
    if (!actor) return null;

    // Check if already subscribed
    if (this.broadcastSubscriptions.has(gameId)) {
      console.log(`[GameManager] Game ${gameId} already has broadcast subscription`);
      return this.broadcastSubscriptions.get(gameId) || null;
    }

    console.log(`[GameManager] Setting up broadcast subscription for ${gameId}`);
    const subscription = actor.subscribe((snapshot) => {
      console.log(`[GameManager] Broadcasting state for ${gameId}, stage: ${snapshot.context.gameState.stage}`);
      callback(snapshot.context.gameState as MultiplayerGameState);
    });

    const unsubscribe = () => {
      subscription.unsubscribe();
      this.broadcastSubscriptions.delete(gameId);
    };

    this.broadcastSubscriptions.set(gameId, unsubscribe);
    return unsubscribe;
  }
}
