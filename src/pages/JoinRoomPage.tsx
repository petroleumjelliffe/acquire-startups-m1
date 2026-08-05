import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JoinForm } from '../game/online/JoinForm';
import { getConnection, type Connection } from '../net/connection';
import { rememberName, saveIdentity } from '../net/identity';

export interface JoinRoomPageProps {
  connect?: () => Connection;
}

export function JoinRoomPage({ connect = getConnection }: JoinRoomPageProps) {
  const navigate = useNavigate();
  const connection = connect();
  const [error, setError] = useState<string | null>(null);
  const sentName = useRef('');

  useEffect(() => {
    const offJoined = connection.onJoined((msg) => {
      saveIdentity(msg.roomId, { playerId: msg.playerId, token: msg.token, name: sentName.current });
      navigate(`/room/${msg.roomId}`);
    });
    const offRejected = connection.transport.onRejected((msg) => setError(msg.message));
    return () => { offJoined(); offRejected(); };
  }, [connection, navigate]);

  return (
    <JoinForm
      title="Join a room"
      submitLabel="Join room"
      error={error}
      onSubmit={(name, roomId) => {
        sentName.current = name;
        rememberName(name);
        setError(null);
        connection.joinRoom({ roomId, name });
      }}
    />
  );
}
