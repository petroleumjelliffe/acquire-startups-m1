// server/index.ts
// Main Express + Socket.io server

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GameManager } from "./gameManager.js";
import { RoomManager } from "./roomManager.js";
import { initPersistence } from "./persistence.js";
import {
  validateAction,
  validateLiquidationAction,
  PlayerAuthError,
  isHost,
} from "./playerAuth.js";
import type { GameAction } from "./types.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

// Initialize managers
const gameManager = new GameManager();
const roomManager = new RoomManager();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("server")); // Serve static files from server directory

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    games: gameManager.getAllGames().length,
    rooms: roomManager.getAllRooms().length,
  });
});

// Serve test page
app.get("/test", (req, res) => {
  res.sendFile("test.html", { root: "server" });
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Register player with persistent ID
  socket.on("registerPlayer", (playerId: string, playerName: string) => {
    socket.data.playerId = playerId;
    socket.data.playerName = playerName;
    socket.emit("playerRegistered", playerId);
    console.log(`✓ Player registered: ${playerName} (${playerId})`);
  });

  // Create a new waiting room
  socket.on(
    "createRoom",
    (data: { playerId: string; playerName: string }, callback) => {
      try {
        const room = roomManager.createRoom(data.playerId, data.playerName);
        socket.join(room.gameId);
        socket.data.gameId = room.gameId;

        callback({ success: true, room });
        io.to(room.gameId).emit("roomState", room);
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    }
  );

  // Join an existing waiting room
  socket.on(
    "joinRoom",
    (
      data: { gameId: string; playerId: string; playerName: string },
      callback
    ) => {
      try {
        // First check if this is a waiting room
        const room = roomManager.getRoom(data.gameId);

        if (room) {
          // It's a waiting room - try to join
          const joinedRoom = roomManager.joinRoom(
            data.gameId,
            data.playerId,
            data.playerName
          );

          if (!joinedRoom) {
            callback({ success: false, error: "Room is full (max 6 players)" });
            return;
          }

          socket.join(data.gameId);
          socket.data.gameId = data.gameId;

          callback({ success: true, room: joinedRoom });
          io.to(data.gameId).emit("roomState", joinedRoom);
          return;
        }

        // Not a waiting room - check if it's a started game
        const game = gameManager.getGame(data.gameId);
        if (game) {
          callback({
            success: false,
            error: "Game has already started. Use rejoin instead."
          });
          return;
        }

        // Room doesn't exist at all
        callback({ success: false, error: "Room doesn't exist" });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    }
  );

  // Start game from waiting room
  socket.on("startGame", (data: { gameId: string; playerId: string }, callback) => {
    try {
      const room = roomManager.getRoom(data.gameId);

      if (!room) {
        callback({ success: false, error: "Room not found" });
        return;
      }

      // Verify host
      if (room.hostId !== data.playerId) {
        callback({ success: false, error: "Only host can start game" });
        return;
      }

      // Create game
      const players = room.players.map((p) => ({ id: p.id, name: p.name }));
      const gameState = gameManager.createGame(data.gameId, players);

      // Delete waiting room
      roomManager.deleteRoom(data.gameId);

      // Connect all players
      for (const player of gameState.players) {
        player.isConnected = true;
      }

      callback({ success: true, gameState });
      io.to(data.gameId).emit("gameStarted", gameState);

      console.log(`✓ Game started: ${data.gameId}`);
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Rejoin an existing game (or waiting room)
  socket.on(
    "rejoinGame",
    (data: { gameId: string; playerId: string }, callback) => {
      try {
        // First check if it's a waiting room
        const room = roomManager.getRoom(data.gameId);
        if (room) {
          // Player is trying to rejoin a waiting room
          const player = room.players.find(p => p.id === data.playerId);

          if (player) {
            // Player was in this room - reconnect them
            player.isConnected = true;
            socket.join(data.gameId);
            socket.data.gameId = data.gameId;

            callback({ success: true, room });
            io.to(data.gameId).emit("roomState", room);
            console.log(`✓ Player rejoined waiting room: ${data.playerId} -> ${data.gameId}`);
            return;
          } else {
            callback({
              success: false,
              error: "Player not in this room",
            });
            return;
          }
        }

        // Check if it's a started game
        const gameState = gameManager.playerConnected(
          data.gameId,
          data.playerId,
          socket.id
        );

        if (!gameState) {
          callback({
            success: false,
            error: "Game not found or player not in game",
          });
          return;
        }

        socket.join(data.gameId);
        socket.data.gameId = data.gameId;

        callback({ success: true, gameState });
        io.to(data.gameId).emit("playerConnected", {
          playerId: data.playerId,
          playerName: gameState.players.find((p) => p.id === data.playerId)
            ?.name,
        });

        console.log(`✓ Player rejoined game: ${data.playerId} -> ${data.gameId}`);
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    }
  );

  // Handle tile placement
  socket.on("tilePlacement", async (data: { gameId: string; playerId: string; coord: string; newState: any }) => {
    try {
      const gameState = gameManager.getGame(data.gameId);

      if (!gameState) {
        console.error("Game not found:", data.gameId);
        return;
      }

      // Validate the action is from a player in the game
      const player = gameState.players.find(p => p.id === data.playerId);
      if (!player) {
        console.error(`❌ Player ${data.playerId} not in game`);
        return;
      }

      // Client has already validated turn and calculated new state
      // Trust the client's game logic (for now - could add server-side validation later)
      console.log(`✓ Tile placed: ${data.coord} by ${player.name}`);

      // Update game state with new state from client
      Object.assign(gameState, data.newState);

      // Save and broadcast
      await gameManager.updateGame(data.gameId, gameState);
      io.to(data.gameId).emit("gameState", gameState);
    } catch (error: any) {
      console.error("Tile placement error:", error);
    }
  });

  // Handle generic state updates (for modals like buy, merge, etc.)
  socket.on("stateUpdate", async (data: { gameId: string; playerId: string; newState: any }) => {
    try {
      const gameState = gameManager.getGame(data.gameId);

      if (!gameState) {
        console.error("Game not found:", data.gameId);
        return;
      }

      // Validate the action is from a player in the game
      const player = gameState.players.find(p => p.id === data.playerId);
      if (!player) {
        console.error(`❌ Player ${data.playerId} not in game`);
        return;
      }

      console.log(`✓ State update from ${player.name} (stage: ${data.newState.stage})`);

      // Update game state with new state from client
      Object.assign(gameState, data.newState);

      // Save and broadcast
      await gameManager.updateGame(data.gameId, gameState);
      io.to(data.gameId).emit("gameState", gameState);
    } catch (error: any) {
      console.error("State update error:", error);
    }
  });

  // Handle game actions (buying shares, mergers, etc.)
  socket.on("gameAction", async (action: GameAction, callback) => {
    try {
      const gameState = gameManager.getGame(action.gameId);

      if (!gameState) {
        callback({ success: false, error: "Game not found" });
        return;
      }

      // Validate action based on type
      if (action.type === "liquidateShares") {
        validateLiquidationAction(gameState, action);
      } else {
        validateAction(gameState, action);
      }

      // Apply action to game state (this would call game logic functions)
      // TODO: Implement specific game logic handlers
      // For now, just echo back
      console.log(`✓ Game action: ${action.type} by ${action.playerId}`);

      // Update game state
      await gameManager.updateGame(action.gameId, gameState);

      callback({ success: true, gameState });
      io.to(action.gameId).emit("gameState", gameState);
    } catch (error: any) {
      if (error instanceof PlayerAuthError) {
        callback({ success: false, error: error.message });
      } else {
        console.error("Game action error:", error);
        callback({ success: false, error: "Internal server error" });
      }
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const gameId = socket.data.gameId;
    const playerId = socket.data.playerId;

    console.log(`🔌 Client disconnected: ${socket.id}`);

    if (gameId) {
      // Check if this is a waiting room or active game
      const room = roomManager.getRoom(gameId);
      if (room) {
        roomManager.leaveRoom(gameId, playerId);
        io.to(gameId).emit("roomState", roomManager.getRoom(gameId));
      } else {
        // Active game
        const gameState = gameManager.playerDisconnected(gameId, socket.id);
        if (gameState) {
          io.to(gameId).emit("playerDisconnected", {
            playerId,
            playerName:
              socket.data.playerName ||
              gameState.players.find((p) => p.socketId === socket.id)?.name,
          });
        }
      }
    }
  });
});

// Start server
async function start() {
  try {
    // Initialize persistence
    await initPersistence();

    // Load saved games
    await gameManager.initialize();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/health`);
      console.log(`   Client URL: ${process.env.CLIENT_URL || "http://localhost:5173"}\n`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
