// src/components/WaitingRoom.tsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { getRandomEmojiName } from '../utils/emojiNames';
import { saveGameSession } from '../utils/gameSession';

interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
}

interface WaitingRoomData {
  gameId: string;
  players: RoomPlayer[];
  hostId: string;
  createdAt: number;
}

export const WaitingRoom: React.FC<{
  onGameStart: (gameState: any) => void;
  initialRoomId?: string;
}> = ({ onGameStart, initialRoomId }) => {
  const { socket, isConnected, playerId, isReconnecting } = useSocket();
  const [playerName, setPlayerName] = useState(getRandomEmojiName());
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [room, setRoom] = useState<WaitingRoomData | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'menu' | 'creating' | 'joining' | 'inRoom'>(
    initialRoomId ? 'joining' : 'menu'
  );

  useEffect(() => {
    if (!socket) return;

    socket.on('roomState', (roomData: WaitingRoomData) => {
      setRoom(roomData);
      setMode('inRoom');
      setError('');
    });

    socket.on('gameStarted', (gameState: any) => {
      onGameStart(gameState);
    });

    return () => {
      socket.off('roomState');
      socket.off('gameStarted');
    };
  }, [socket, onGameStart]);

  const handleCreateRoom = () => {
    if (!socket || !playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    socket.emit(
      'createRoom',
      { playerId, playerName: playerName.trim() },
      (response: any) => {
        if (response.success) {
          setRoom(response.room);
          setMode('inRoom');
          setError('');

          // Save game session for reconnection
          saveGameSession({
            gameId: response.room.gameId,
            playerId,
            playerName: playerName.trim(),
            joinedAt: Date.now(),
          });
        } else {
          setError(response.error || 'Failed to create room');
        }
      }
    );
  };

  const handleJoinRoom = () => {
    if (!socket || !playerName.trim() || !roomId.trim()) {
      setError('Please enter your name and room ID');
      return;
    }

    socket.emit(
      'joinRoom',
      { gameId: roomId.trim(), playerId, playerName: playerName.trim() },
      (response: any) => {
        if (response.success) {
          setRoom(response.room);
          setMode('inRoom');
          setError('');

          // Save game session for reconnection
          saveGameSession({
            gameId: roomId.trim(),
            playerId,
            playerName: playerName.trim(),
            joinedAt: Date.now(),
          });
        } else {
          setError(response.error || 'Failed to join room');
        }
      }
    );
  };

  const handleStartGame = () => {
    if (!socket || !room) return;

    if (room.players.length < 2) {
      setError('Need at least 2 players to start');
      return;
    }

    socket.emit(
      'startGame',
      { gameId: room.gameId, playerId },
      (response: any) => {
        if (!response.success) {
          setError(response.error || 'Failed to start game');
        }
      }
    );
  };

  const isHost = room?.hostId === playerId;
  const canStart = isHost && room && room.players.length >= 2 && room.players.length <= 6;

  if (!isConnected || isReconnecting) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold mb-4">
            {isReconnecting ? 'Reconnecting to server...' : 'Connecting to server...'}
          </h2>
          <div className="animate-pulse flex items-center justify-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce" />
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce delay-100" />
            <div className="w-4 h-4 bg-gray-400 rounded-full animate-bounce delay-200" />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'inRoom' && room) {
    // Construct shareable link with proper base path
    const basePath = import.meta.env.PROD ? '/acquire-startups-m1' : '';
    const shareableLink = `${window.location.origin}${basePath}/room/${room.gameId}`;

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-xl shadow-xl w-[600px] max-w-full">
          <h2 className="text-2xl font-bold mb-4 text-center">Waiting Room</h2>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Shareable Link:</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareableLink}
                className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded font-mono text-sm text-blue-600"
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareableLink);
                  setError('');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold"
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">Room ID: {room.gameId}</div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              Players ({room.players.length}/6)
            </h3>
            <div className="space-y-2">
              {room.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${player.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="font-medium">{player.name}</span>
                    {player.isHost && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Host</span>
                    )}
                    {player.id === playerId && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">You</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            {canStart ? (
              <button
                onClick={handleStartGame}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
              >
                Start Game
              </button>
            ) : isHost ? (
              <div className="flex-1 px-6 py-3 bg-gray-300 text-gray-600 rounded-lg text-center font-semibold">
                Waiting for players... (Need 2-6)
              </div>
            ) : (
              <div className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-lg text-center">
                Waiting for host to start...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[500px] max-w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Acquire - Multiplayer</h1>

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
              if (e.key === 'Enter' && mode === 'creating') handleCreateRoom();
              if (e.key === 'Enter' && mode === 'joining') handleJoinRoom();
            }}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {mode === 'menu' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('creating')}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Create New Game
            </button>
            <button
              onClick={() => setMode('joining')}
              className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
            >
              Join Existing Game
            </button>
          </div>
        )}

        {mode === 'creating' && (
          <div className="space-y-3">
            <button
              onClick={handleCreateRoom}
              disabled={!playerName.trim()}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Create Room
            </button>
            <button
              onClick={() => setMode('menu')}
              className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        )}

        {mode === 'joining' && (
          <div className="space-y-3">
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
              />
            </div>
            <button
              onClick={handleJoinRoom}
              disabled={!playerName.trim() || !roomId.trim()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
            <button
              onClick={() => setMode('menu')}
              className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        )}

        <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Connected to server' : 'Disconnected'}
          </div>
        </div>
      </div>
    </div>
  );
};
