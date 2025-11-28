// src/pages/RoomPage.tsx
// Multiplayer room page - shows waiting room then game

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { WaitingRoom } from '../components/WaitingRoom';
import { Game } from '../Game';
import { useSocket } from '../context/SocketContext';
import type { GameState } from '../state/gameTypes';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { socket } = useSocket();

  // Listen for successful rejoin (automatic reconnection)
  useEffect(() => {
    if (!socket) return;

    const handleGameStarted = (state: GameState) => {
      console.log('🎮 Game started or rejoined');
      setGameState(state);
    };

    socket.on('gameStarted', handleGameStarted);
    socket.on('gameState', handleGameStarted); // Also catch general state updates

    return () => {
      socket.off('gameStarted', handleGameStarted);
      socket.off('gameState', handleGameStarted);
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {!gameState ? (
        <WaitingRoom
          onGameStart={setGameState}
          initialRoomId={roomId}
        />
      ) : (
        <Game
          seed={gameState.seed}
          playerNames={gameState.players.map(p => p.name)}
          initialState={gameState}
          isMultiplayer={true}
        />
      )}
    </div>
  );
}
