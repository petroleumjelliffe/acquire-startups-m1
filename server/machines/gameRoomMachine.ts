// server/machines/gameRoomMachine.ts
// Main game room state machine that orchestrates game flow

import { setup, assign, sendTo } from "xstate";
import type { GameRoomMachineContext, GameRoomMachineEvent } from "./types.js";
import { playerMachine } from "./playerMachine.js";
import type { GameState } from "../../src/state/gameTypes.js";

export const gameRoomMachine = setup({
  types: {
    context: {} as GameRoomMachineContext,
    events: {} as GameRoomMachineEvent,
    input: {} as { gameId: string; gameState: GameState },
  },
  actors: {
    playerMachine,
  },
  actions: {
    spawnPlayerActors: assign(({ context, spawn }) => {
      const playerActors = new Map();
      const socketMap = new Map();

      for (const player of context.gameState.players) {
        const actor = spawn("playerMachine", {
          id: player.id,
          input: {
            playerId: player.id,
            playerName: player.name,
            socketId: player.socketId,
          },
        });
        playerActors.set(player.id, actor);

        if (player.socketId) {
          socketMap.set(player.socketId, player.id);
        }
      }

      return {
        playerActors,
        socketMap,
      };
    }),

    updateGameState: assign({
      gameState: ({ event }) => {
        if ("newState" in event && event.newState) {
          return event.newState;
        }
        return undefined as any;
      },
    }),

    syncGameStateFromEvent: assign(({ event }) => {
      if ("newState" in event && event.newState) {
        console.log(`[GameRoom] Syncing new state, stage: ${event.newState.stage}`);
        return { gameState: event.newState };
      }
      console.warn(`[GameRoom] Event has no newState:`, event.type);
      return {};
    }),

    updateCurrentPlayer: assign({
      currentPlayerIndex: ({ context }) => context.gameState.turnIndex,
    }),

    notifyCurrentPlayer: sendTo(
      ({ context }) => {
        const playerId = context.gameState.players[context.currentPlayerIndex]?.id;
        return context.playerActors.get(playerId);
      },
      { type: "YOUR_TURN" }
    ),

    notifyOtherPlayersWait: ({ context }) => {
      const currentPlayerId = context.gameState.players[context.currentPlayerIndex]?.id;
      context.playerActors.forEach((actor, playerId) => {
        if (playerId !== currentPlayerId) {
          actor.send({ type: "WAIT" });
        }
      });
    },

    notifyMergerPlayer: sendTo(
      ({ context }) => {
        const activePlayerId = (context.gameState as any).mergerContext?.activePlayerId;
        if (!activePlayerId) return undefined;
        return context.playerActors.get(activePlayerId);
      },
      { type: "MERGER_DECISION_NEEDED" }
    ),

    notifyOtherPlayersWaitForMerger: ({ context }) => {
      const activePlayerId = (context.gameState as any).mergerContext?.activePlayerId;
      if (!activePlayerId) return;

      context.playerActors.forEach((actor, playerId) => {
        if (playerId !== activePlayerId) {
          actor.send({ type: "WAIT" });
        }
      });
    },

    handlePlayerDisconnect: assign(({ context, event }) => {
      if (event.type !== "PLAYER_DISCONNECTED") return {};

      const playerId = context.socketMap.get(event.socketId);
      if (!playerId) return {};

      // Update socket map
      const newSocketMap = new Map(context.socketMap);
      newSocketMap.delete(event.socketId);

      // Send disconnect event to player actor
      const playerActor = context.playerActors.get(playerId);
      if (playerActor) {
        playerActor.send({ type: "SOCKET_DISCONNECTED" });
      }

      // Update game state
      const newGameState = structuredClone(context.gameState);
      const player = newGameState.players.find((p) => p.id === playerId);
      if (player) {
        player.isConnected = false;
        player.socketId = undefined;
      }

      return {
        socketMap: newSocketMap,
        gameState: newGameState,
      };
    }),

    handlePlayerReconnect: assign(({ context, event }) => {
      if (event.type !== "PLAYER_RECONNECTED") return {};

      const { playerId, socketId } = event;

      // Update socket map
      const newSocketMap = new Map(context.socketMap);
      newSocketMap.set(socketId, playerId);

      // Send reconnect event to player actor
      const playerActor = context.playerActors.get(playerId);
      if (playerActor) {
        playerActor.send({ type: "RECONNECTED", socketId });
      }

      // Update game state
      const newGameState = structuredClone(context.gameState);
      const player = newGameState.players.find((p) => p.id === playerId);
      if (player) {
        player.isConnected = true;
        player.socketId = socketId;
      }

      return {
        socketMap: newSocketMap,
        gameState: newGameState,
      };
    }),

    markGameAsEnded: assign({
      gameState: ({ context }) => ({
        ...context.gameState,
        stage: "end" as const,
        isEnded: true,
      }),
    }),
  },
  guards: {
    isDrawStage: ({ context }) => context.gameState.stage === "draw",
    isPlayStage: ({ context }) => context.gameState.stage === "play",
    isFoundStartupStage: ({ context }) => context.gameState.stage === "foundStartup",
    isBuyStage: ({ context }) => context.gameState.stage === "buy",
    isMergerPayoutStage: ({ context }) => context.gameState.stage === "mergerPayout",
    isMergerLiquidationStage: ({ context }) => context.gameState.stage === "mergerLiquidation",
    isEndStage: ({ context }) => context.gameState.stage === "end",
  },
}).createMachine({
  id: "gameRoom",
  initial: "initializing",
  context: ({ input }) => ({
    gameId: input.gameId,
    gameState: input.gameState,
    currentPlayerIndex: input.gameState.turnIndex || 0,
    currentMergerPlayerIndex: null,
    playersWithDefunctShares: [],
    mergerResolution: null,
    playerActors: new Map(),
    socketMap: new Map(),
    disconnectTimers: new Map(),
  }),
  states: {
    initializing: {
      entry: ["spawnPlayerActors"],
      always: "routing",
    },
    routing: {
      always: [
        { target: "draw", guard: "isDrawStage" },
        { target: "play", guard: "isPlayStage" },
        { target: "foundStartup", guard: "isFoundStartupStage" },
        { target: "buy", guard: "isBuyStage" },
        { target: "mergerPayout", guard: "isMergerPayoutStage" },
        { target: "mergerLiquidation", guard: "isMergerLiquidationStage" },
        { target: "gameOver", guard: "isEndStage" },
        { target: "draw" }, // Default
      ],
    },
    draw: {
      entry: ["updateCurrentPlayer", "notifyCurrentPlayer"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    play: {
      entry: ["updateCurrentPlayer", "notifyCurrentPlayer", "notifyOtherPlayersWait"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    foundStartup: {
      entry: ["notifyCurrentPlayer"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    buy: {
      entry: ["notifyCurrentPlayer"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    mergerPayout: {
      entry: ["updateCurrentPlayer", "notifyCurrentPlayer"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    mergerLiquidation: {
      entry: ["notifyMergerPlayer", "notifyOtherPlayersWaitForMerger"],
      on: {
        TILE_PLACED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_PURCHASED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        STARTUP_FOUNDED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        SHARES_LIQUIDATED: {
          actions: ["syncGameStateFromEvent"],
          target: "routing",
        },
        PLAYER_DISCONNECTED: {
          actions: ["handlePlayerDisconnect"],
        },
        PLAYER_RECONNECTED: {
          actions: ["handlePlayerReconnect"],
        },
      },
    },
    gameOver: {
      entry: ["markGameAsEnded"],
      type: "final",
    },
  },
  on: {
    END_GAME: {
      target: ".gameOver",
      actions: ["markGameAsEnded"],
    },
  },
});
