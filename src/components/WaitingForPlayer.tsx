// src/components/WaitingForPlayer.tsx
import React from 'react';

interface WaitingForPlayerProps {
  playerName: string;
  isConnected: boolean;
}

export const WaitingForPlayer: React.FC<WaitingForPlayerProps> = ({ playerName, isConnected }) => {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 pointer-events-none">
      <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md pointer-events-auto">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <h3 className="text-xl font-bold">
                {isConnected ? 'Waiting for' : 'Player offline'}
              </h3>
            </div>
          </div>

          <p className="text-2xl font-semibold text-gray-800 mb-2">{playerName}</p>

          <p className="text-sm text-gray-600">
            {isConnected
              ? "It's their turn to play"
              : "Waiting for them to reconnect..."}
          </p>

          {isConnected && (
            <div className="mt-4 flex justify-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
