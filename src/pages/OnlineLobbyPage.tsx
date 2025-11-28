// src/pages/OnlineLobbyPage.tsx
// Online multiplayer lobby - choice between create and join

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

export function OnlineLobbyPage() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[500px] max-w-full">
        <h1 className="text-3xl font-bold mb-2 text-center">Online Multiplayer</h1>
        <p className="text-center text-gray-600 mb-8">Create a new game or join an existing one</p>

        <div className="space-y-4">
          <button
            onClick={() => navigate('/online/create')}
            disabled={!isConnected}
            className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <div className="font-bold text-lg">Create Room</div>
            <div className="text-blue-100 text-sm mt-1">Start a new game and invite others</div>
          </button>

          <button
            onClick={() => navigate('/online/join')}
            disabled={!isConnected}
            className="w-full px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <div className="font-bold text-lg">Join Room</div>
            <div className="text-gray-100 text-sm mt-1">Enter a room code to join</div>
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            Back
          </button>
        </div>

        <div className="mt-6 pt-6 border-t text-center text-sm">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-600">
              {isConnected ? 'Connected to server' : 'Disconnected from server'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
