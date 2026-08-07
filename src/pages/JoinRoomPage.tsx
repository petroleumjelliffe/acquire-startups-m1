import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JoinForm } from '../game/online/JoinForm';
import { getConnection, type Connection } from '../net/connection';
import { rememberName, saveIdentity } from '../net/identity';
import { PROTOCOL_VERSION } from '../../session/protocol';

export interface JoinRoomPageProps {
  connect?: () => Connection;
}

export function JoinRoomPage({ connect = getConnection }: JoinRoomPageProps) {
  const navigate = useNavigate();
  const connection = connect();
  const [error, setError] = useState<string | null>(null);
  // Disables `JoinForm`'s button and blocks a second submit while a request
  // is outstanding. Cleared on rejection too — a mistyped code should be
  // correctable, not stuck.
  const [waiting, setWaiting] = useState(false);
  const sentName = useRef('');

  useEffect(() => {
    const offJoined = connection.onJoined((msg) => {
      saveIdentity(msg.roomId, { playerId: msg.playerId, token: msg.token, name: sentName.current });
      navigate(`/room/${msg.roomId}`);
    });
    const offRejected = connection.transport.onRejected((msg) => {
      setError(msg.message);
      setWaiting(false);
    });
    return () => { offJoined(); offRejected(); };
  }, [connection, navigate]);

  return (
    <JoinForm
      title="Join Room"
      subtitle="Enter or paste code below"
      submitLabel="Join game"
      busy={waiting}
      busyLabel="Joining…"
      error={error}
      onSubmit={(name, roomId) => {
        sentName.current = name;
        rememberName(name);
        setError(null);
        setWaiting(true);
        connection.joinRoom({ roomId, name, protocolVersion: PROTOCOL_VERSION });
      }}
    />
  );
}
