// src/context/SocketContext.tsx
// Socket.io context for multiplayer communication

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getPlayerId } from '../utils/playerId';
import { getRandomEmojiName } from '../utils/emojiNames';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  playerId: string;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  playerId: '',
});

export const useSocket = () => useContext(SocketContext);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playerId] = useState(getPlayerId());

  useEffect(() => {
    // Create socket connection
    const newSocket = io(SERVER_URL);

    newSocket.on('connect', () => {
      console.log('✅ Connected to server:', newSocket.id);
      setIsConnected(true);

      // Register player with persistent ID and random emoji name
      newSocket.emit('registerPlayer', playerId, getRandomEmojiName());
    });

    newSocket.on('playerRegistered', (id: string) => {
      console.log('✅ Player registered:', id);
    });

    newSocket.on('disconnect', () => {
      console.log('⚠️ Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      setIsConnected(false);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, [playerId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, playerId }}>
      {children}
    </SocketContext.Provider>
  );
};
