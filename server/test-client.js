// Simple test client to verify server functionality
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("✅ Connected to server:", socket.id);

  // Test 1: Register player
  const playerId = "test-player-123";
  const playerName = "Test Player";

  socket.emit("registerPlayer", playerId, playerName);
});

socket.on("playerRegistered", (id) => {
  console.log("✅ Player registered:", id);

  // Test 2: Create room
  socket.emit(
    "createRoom",
    { playerId: "test-player-123", playerName: "Test Player" },
    (response) => {
      if (response.success) {
        console.log("✅ Room created:", response.room.gameId);
        console.log("   Players in room:", response.room.players.length);

        // Clean exit
        setTimeout(() => {
          console.log("\n✅ All tests passed!");
          socket.disconnect();
          process.exit(0);
        }, 1000);
      } else {
        console.error("❌ Failed to create room:", response.error);
        process.exit(1);
      }
    }
  );
});

socket.on("roomState", (room) => {
  console.log("✅ Room state updated:", room.gameId);
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
  process.exit(1);
});

socket.on("disconnect", () => {
  console.log("👋 Disconnected from server");
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error("❌ Test timeout");
  process.exit(1);
}, 5000);
