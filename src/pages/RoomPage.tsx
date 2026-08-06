import { useNavigate, useParams } from 'react-router-dom';
import { GameScreen } from '../game/GameScreen';
import { RoomLobby } from '../game/online/RoomLobby';
import { ConnectionStrip } from '../game/online/ConnectionStrip';
import { JoinForm } from '../game/online/JoinForm';
import { useRoom } from '../net/useRoom';
import { getConnection, closeConnection, type Connection } from '../net/connection';

export interface RoomPageProps {
  /** Injectable so screen tests can drive a fake. The app never passes it. */
  connect?: () => Connection;
}

export function RoomPage({ connect = getConnection }: RoomPageProps) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const room = useRoom(roomId ?? '', connect);

  // Leaving is a real disconnect, not just a route change: the socket this
  // room's session and roster depend on closes, and `getConnection()` opens a
  // fresh one for wherever the player goes next.
  const leave = () => {
    closeConnection();
    navigate('/');
  };

  if (room.phase === 'playing' && room.session && room.playerId) {
    return (
      <>
        <ConnectionStrip status={room.status} />
        {/*
          No `onNewGame`: this room belongs to everyone in it, and starting
          over is not one player's to do. Leaving is.
        */}
        <GameScreen
          session={room.session}
          viewerId={room.playerId}
          connected={room.status === 'open'}
          onExit={leave}
        />
      </>
    );
  }

  if (room.phase === 'needName' || room.phase === 'error') {
    return (
      <>
        <ConnectionStrip status={room.status} />
        <JoinForm
          roomId={roomId}
          title={`Join ${roomId ?? ''}`}
          submitLabel="Join room"
          error={room.message}
          onSubmit={(name) => room.join(name)}
        />
      </>
    );
  }

  if (room.phase === 'lobby' && room.roster) {
    const me = room.roster.players.find((p) => p.id === room.playerId);
    return (
      <>
        <ConnectionStrip status={room.status} />
        <RoomLobby
          roomId={room.roster.roomId}
          players={room.roster.players}
          isHost={me?.isHost === true}
          note={room.message}
          onStart={room.begin}
          onExit={leave}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <ConnectionStrip status={room.status} />
      <p className="text-gray-600">{room.phase === 'joining' ? 'Joining…' : 'Connecting…'}</p>
    </div>
  );
}
