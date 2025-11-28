// src/pages/JoinRoomPage.tsx
// Page for joining an existing multiplayer room

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { getRandomEmojiName } from '../utils/emojiNames';
import { savePlayerName, getPlayerName } from '../utils/playerId';
import { saveGameSession } from '../utils/gameSession';

export function JoinRoomPage() {
  const navigate = useNavigate();
  const { socket, isConnected, playerId } = useSocket();
  const savedPlayerName = getPlayerName();
  const [playerName, setPlayerName] = useState(savedPlayerName || getRandomEmojiName());
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinRoom = () => {
    if (!socket || !playerName.trim() || !roomId.trim()) {
      setError('Please enter your name and room ID');
      return;
    }

    setIsJoining(true);
    const trimmedName = playerName.trim();
    const trimmedRoomId = roomId.trim();

    socket.emit(
      'joinRoom',
      { gameId: trimmedRoomId, playerId, playerName: trimmedName },
      (response: any) => {
        if (response.success) {
          // Save player name and game session for reconnection
          savePlayerName(trimmedName);
          saveGameSession({
            gameId: trimmedRoomId,
            playerId,
            playerName: trimmedName,
            joinedAt: Date.now(),
          });

          // Navigate to the room
          navigate(`/room/${trimmedRoomId}`);
        } else {
          setError(response.error || 'Failed to join room');
          setIsJoining(false);
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
        <h1 className="text-3xl font-bold mb-2 text-center">Join Room</h1>
        <p className="text-center text-gray-600 mb-8">Enter a room code to join a game</p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isJoining}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room ID
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="game-abc12345"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleJoinRoom();
              }}
              disabled={isJoining}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleJoinRoom}
            disabled={!playerName.trim() || !roomId.trim() || isJoining}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
          <button
            onClick={() => navigate('/online')}
            className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={isJoining}
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
