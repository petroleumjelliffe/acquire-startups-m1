// src/pages/CreateRoomPage.tsx
// Page for creating a new multiplayer room

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { getRandomEmojiName } from '../utils/emojiNames';
import { savePlayerName, getPlayerName } from '../utils/playerId';
import { saveGameSession } from '../utils/gameSession';

export function CreateRoomPage() {
  const navigate = useNavigate();
  const { socket, isConnected, playerId } = useSocket();
  const savedPlayerName = getPlayerName();
  const [playerName, setPlayerName] = useState(savedPlayerName || getRandomEmojiName());
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = () => {
    if (!socket || !playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsCreating(true);
    const trimmedName = playerName.trim();

    socket.emit(
      'createRoom',
      { playerId, playerName: trimmedName },
      (response: any) => {
        if (response.success) {
          // Save player name and game session for reconnection
          savePlayerName(trimmedName);
          saveGameSession({
            gameId: response.room.gameId,
            playerId,
            playerName: trimmedName,
            joinedAt: Date.now(),
          });

          // Navigate to the room
          navigate(`/room/${response.room.gameId}`);
        } else {
          setError(response.error || 'Failed to create room');
          setIsCreating(false);
        }
      }
    );
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold mb-4">Connecting to server...</h2>
          <div className="animate-pulse flex items-center justify-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce" />
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce delay-100" />
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce delay-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[500px] max-w-full">
        <h1 className="text-3xl font-bold mb-2 text-center">Create Room</h1>
        <p className="text-center text-gray-600 mb-8">Start a new game and invite others</p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleCreateRoom();
            }}
            disabled={isCreating}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleCreateRoom}
            disabled={!playerName.trim() || isCreating}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>
          <button
            onClick={() => navigate('/online')}
            className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={isCreating}
          >
            Back
          </button>
        </div>

        <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Connected to server' : 'Disconnected'}
          </div>
        </div>
      </div>
    </div>
  );
}
