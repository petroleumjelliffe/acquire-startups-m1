// src/pages/HomePage.tsx
// Landing page for mode selection

import React from 'react';
import { useNavigate } from 'react-router-dom';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[600px] max-w-full">
        <h1 className="text-3xl font-bold mb-2 text-center">Acquire</h1>
        <p className="text-center text-gray-600 mb-8">Choose your game mode</p>

        <div className="space-y-4">
          {/* Online Multiplayer */}
          <button
            onClick={() => navigate('/online')}
            className="w-full px-6 py-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">🌐</span>
              <div className="flex-1">
                <div className="font-bold text-xl mb-1">Online Multiplayer</div>
                <div className="text-blue-100 text-sm">
                  Each player joins from their own device. Share a room link to play together remotely.
                </div>
              </div>
            </div>
          </button>

          {/* Pass & Play */}
          <button
            onClick={() => navigate('/pass-and-play')}
            className="w-full px-6 py-5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">🎮</span>
              <div className="flex-1">
                <div className="font-bold text-xl mb-1">Pass & Play</div>
                <div className="text-green-100 text-sm">
                  Everyone plays on this device. Pass it around after each turn (local hotseat).
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          Both modes support 2-6 players
        </div>
      </div>
    </div>
  );
}
