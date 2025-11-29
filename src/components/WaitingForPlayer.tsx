// src/components/WaitingForPlayer.tsx
import React from 'react';

interface WaitingForPlayerProps {
  playerName: string;
  isConnected: boolean;
}

export const WaitingForPlayer: React.FC<WaitingForPlayerProps> = ({ playerName, isConnected }) => {
  return (
    <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-b-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-white animate-pulse' : 'bg-gray-300'}`} />

          <div className="flex-1 text-center">
            <span className="font-semibold">{playerName}</span>
            <span className="mx-2">•</span>
            <span className="text-blue-100 text-sm">
              {isConnected ? "Taking their turn" : "Offline"}
            </span>
          </div>

          {isConnected && (
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
