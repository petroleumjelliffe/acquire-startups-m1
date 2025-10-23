// src/context/SocketContext.tsx
// Socket.io context for multiplayer communication

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getPlayerId } from '../utils/playerId';
import { getRandomEmojiName } from '../utils/emojiNames';
import { getGameSession, clearGameSession } from '../utils/gameSession';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  playerId: string;
  isReconnecting: boolean;
  reconnectionAttempts: number;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  playerId: '',
  isReconnecting: false,
  reconnectionAttempts: 0,
});

export const useSocket = () => useContext(SocketContext);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);
  const [playerId] = useState(getPlayerId());
  const hasAttemptedRejoin = useRef(false);

  // Attempt to rejoin the game session
  const attemptRejoinGame = useCallback((socket: Socket) => {
    const session = getGameSession();

    if (!session) {
      console.log('ℹ️ No previous game session found');
      return;
    }

    // Check if session is recent (within 24 hours)
    const sessionAge = Date.now() - session.joinedAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (sessionAge > maxAge) {
      console.log('ℹ️ Game session expired, clearing');
      clearGameSession();
      return;
    }

    console.log('🔄 Attempting to rejoin:', session.gameId);
    setIsReconnecting(true);

    socket.emit('rejoinGame', {
      gameId: session.gameId,
      playerId: session.playerId,
    }, (response: { success: boolean; error?: string; gameState?: any; room?: any }) => {
      setIsReconnecting(false);

      if (response.success) {
        if (response.room) {
          console.log('✅ Successfully rejoined waiting room:', session.gameId);
          // Trigger roomState event for WaitingRoom component to pick up
          socket.emit('getRoomState', session.gameId);
        } else if (response.gameState) {
          console.log('✅ Successfully rejoined game:', session.gameId);
          // The gameState will be handled by the parent component
        }
        // Don't clear the session here as the game/room is ongoing
      } else {
        console.log('❌ Failed to rejoin:', response.error);
        // Clear session if game/room no longer exists
        if (response.error?.includes('not found') || response.error?.includes('not in')) {
          clearGameSession();
        }
      }
    });
  }, []);

  useEffect(() => {
    // Configure socket with reconnection options
    const newSocket = io(SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      transports: ['websocket', 'polling'], // Try websocket first, fall back to polling
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to server:', newSocket.id);
      setIsConnected(true);
      setReconnectionAttempts(0);

      // Register player with persistent ID and random emoji name
      newSocket.emit('registerPlayer', playerId, getRandomEmojiName());

      // After registration, attempt to rejoin if we have a session
      // Use a small delay to ensure registration completes first
      setTimeout(() => {
        if (!hasAttemptedRejoin.current) {
          hasAttemptedRejoin.current = true;
          attemptRejoinGame(newSocket);
        }
      }, 100);
    });

    newSocket.on('playerRegistered', (id: string) => {
      console.log('✅ Player registered:', id);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('⚠️ Disconnected from server:', reason);
      setIsConnected(false);

      // Reset rejoin flag so we can rejoin after reconnecting
      if (reason === 'io server disconnect' || reason === 'transport close') {
        hasAttemptedRejoin.current = false;
      }
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Reconnection attempt ${attempt}`);
      setReconnectionAttempts(attempt);
      setIsReconnecting(true);
    });

    newSocket.on('reconnect', (attempt) => {
      console.log('✅ Reconnected after', attempt, 'attempts');
      setIsReconnecting(false);
      setReconnectionAttempts(0);
      // rejoin will be triggered by the 'connect' event
    });

    newSocket.on('reconnect_failed', () => {
      console.error('❌ Reconnection failed after all attempts');
      setIsReconnecting(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      setIsConnected(false);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, [playerId, attemptRejoinGame]);

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      playerId,
      isReconnecting,
      reconnectionAttempts
    }}>
      {children}
    </SocketContext.Provider>
  );
};
