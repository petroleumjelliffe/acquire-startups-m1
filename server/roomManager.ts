// server/roomManager.ts
// Manage waiting rooms before games start

import { v4 as uuidv4 } from "uuid";
import type { WaitingRoom, RoomPlayer } from "./types";

export class RoomManager {
  private rooms: Map<string, WaitingRoom> = new Map();

  /**
   * Create a new waiting room
   */
  createRoom(hostId: string, hostName: string): WaitingRoom {
    const gameId = this.generateGameId();

    const room: WaitingRoom = {
      gameId,
      players: [
        {
          id: hostId,
          name: hostName,
          isHost: true,
          isConnected: true,
        },
      ],
      hostId,
      createdAt: Date.now(),
    };

    this.rooms.set(gameId, room);
    console.log(`✓ Created room: ${gameId} (host: ${hostName})`);

    return room;
  }

  /**
   * Join an existing waiting room
   */
  joinRoom(
    gameId: string,
    playerId: string,
    playerName: string
  ): WaitingRoom | null {
    const room = this.rooms.get(gameId);

    if (!room) {
      console.log(`✗ Room not found: ${gameId}`);
      return null;
    }

    // Check if player already in room
    const existingPlayer = room.players.find((p) => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      console.log(`✓ Player reconnected to room: ${playerName} -> ${gameId}`);
      return room;
    }

    // Check room capacity (2-6 players)
    if (room.players.length >= 6) {
      console.log(`✗ Room full: ${gameId}`);
      return null;
    }

    // Add new player
    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      isConnected: true,
    });

    console.log(`✓ Player joined room: ${playerName} -> ${gameId}`);
    return room;
  }

  /**
   * Leave a waiting room
   */
  leaveRoom(gameId: string, playerId: string): void {
    const room = this.rooms.get(gameId);

    if (!room) return;

    // Mark player as disconnected
    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.isConnected = false;
    }

    // If host left and others remain, promote next player to host
    if (playerId === room.hostId && room.players.length > 1) {
      const connectedPlayers = room.players.filter(
        (p) => p.isConnected && p.id !== playerId
      );
      if (connectedPlayers.length > 0) {
        const newHost = connectedPlayers[0];
        newHost.isHost = true;
        room.hostId = newHost.id;
        console.log(`✓ New host for room ${gameId}: ${newHost.name}`);
      }
    }

    // Remove room if everyone left
    const anyConnected = room.players.some((p) => p.isConnected);
    if (!anyConnected) {
      this.rooms.delete(gameId);
      console.log(`✓ Deleted empty room: ${gameId}`);
    }
  }

  /**
   * Get room by ID
   */
  getRoom(gameId: string): WaitingRoom | null {
    return this.rooms.get(gameId) || null;
  }

  /**
   * Delete a room (called when game starts)
   */
  deleteRoom(gameId: string): void {
    this.rooms.delete(gameId);
    console.log(`✓ Deleted room: ${gameId}`);
  }

  /**
   * Generate a unique game ID (short hash)
   */
  private generateGameId(): string {
    // Generate a short, memorable game code
    const uuid = uuidv4();
    return `game-${uuid.substring(0, 8)}`;
  }

  /**
   * Get all active rooms (for debugging)
   */
  getAllRooms(): WaitingRoom[] {
    return Array.from(this.rooms.values());
  }
}
