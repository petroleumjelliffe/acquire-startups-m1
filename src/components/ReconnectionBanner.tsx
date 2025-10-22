// src/components/ReconnectionBanner.tsx
// Visual feedback for WebSocket reconnection status

import React from 'react';
import { useSocket } from '../context/SocketContext';

export const ReconnectionBanner: React.FC = () => {
  const { isConnected, isReconnecting, reconnectionAttempts } = useSocket();

  // Don't show anything if connected
  if (isConnected && !isReconnecting) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-3 shadow-lg">
      <div className="container mx-auto flex items-center justify-center gap-3">
        {isReconnecting ? (
          <>
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            <span className="font-semibold">
              Reconnecting to server...
              {reconnectionAttempts > 0 && ` (attempt ${reconnectionAttempts})`}
            </span>
          </>
        ) : (
          <>
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="font-semibold">
              Disconnected from server
            </span>
          </>
        )}
      </div>
    </div>
  );
};
