// server/machines/playerMachine.ts
// Individual player state machine

import { setup, assign, sendParent } from "xstate";
import type { PlayerMachineContext, PlayerMachineEvent } from "./types.js";

const DISCONNECT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export const playerMachine = setup({
  types: {
    context: {} as PlayerMachineContext,
    events: {} as PlayerMachineEvent,
    input: {} as { playerId: string; playerName: string; socketId?: string },
  },
  delays: {
    disconnectTimeout: DISCONNECT_TIMEOUT,
  },
  actions: {
    updateSocketId: assign({
      socketId: ({ event }) =>
        "socketId" in event ? event.socketId : null,
    }),
    clearSocketId: assign({
      socketId: null,
    }),
    updateLastSeen: assign({
      lastSeen: () => Date.now(),
    }),
    notifyParentTilePlaced: sendParent(({ event }) => ({
      type: "TILE_PLACED" as const,
      playerId: (event as any).playerId,
      coord: (event as any).coord,
      newState: (event as any).newState,
    })),
    notifyParentStartupFounded: sendParent(({ event }) => ({
      type: "STARTUP_FOUNDED" as const,
      playerId: (event as any).playerId,
      startupId: (event as any).startupId,
      newState: (event as any).newState,
    })),
    notifyParentSharesLiquidated: sendParent(({ event }) => ({
      type: "SHARES_LIQUIDATED" as const,
      playerId: (event as any).playerId,
      choices: (event as any).choices,
      newState: (event as any).newState,
    })),
    notifyParentSharesPurchased: sendParent(({ event }) => ({
      type: "SHARES_PURCHASED" as const,
      playerId: (event as any).playerId,
      purchases: (event as any).purchases,
      newState: (event as any).newState,
    })),
    notifyParentTurnComplete: sendParent(({ event }) => ({
      type: "TURN_COMPLETE" as const,
      playerId: (event as any).playerId,
    })),
  },
}).createMachine({
  id: "playerLifecycle",
  initial: "connected",
  context: ({ input }) => ({
    playerId: input.playerId,
    playerName: input.playerName,
    socketId: input.socketId ?? null,
    lastSeen: Date.now(),
  }),
  states: {
    connected: {
      initial: "waiting",
      entry: ["updateLastSeen"],
      on: {
        SOCKET_DISCONNECTED: {
          target: "disconnected",
          actions: ["clearSocketId", "updateLastSeen"],
        },
      },
      states: {
        waiting: {
          on: {
            YOUR_TURN: "active",
            MERGER_DECISION_NEEDED: "mergerDecision",
          },
        },
        active: {
          initial: "idle",
          on: {
            WAIT: "waiting",
          },
          states: {
            idle: {
              on: {
                TILE_PLACED: {
                  actions: ["notifyParentTilePlaced"],
                },
                STARTUP_FOUNDED: {
                  actions: ["notifyParentStartupFounded"],
                },
                SHARES_PURCHASED: {
                  actions: ["notifyParentSharesPurchased"],
                },
                TURN_COMPLETE: {
                  target: "#playerLifecycle.connected.waiting",
                  actions: ["notifyParentTurnComplete"],
                },
              },
            },
          },
        },
        mergerDecision: {
          on: {
            SHARES_LIQUIDATED: {
              target: "waiting",
              actions: ["notifyParentSharesLiquidated"],
            },
            WAIT: "waiting",
          },
        },
      },
    },
    disconnected: {
      entry: ["updateLastSeen"],
      after: {
        disconnectTimeout: "abandoned",
      },
      on: {
        RECONNECTED: {
          target: "connected",
          actions: ["updateSocketId", "updateLastSeen"],
        },
      },
    },
    abandoned: {
      type: "final",
    },
  },
});
