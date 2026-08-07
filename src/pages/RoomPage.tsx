import { useNavigate, useParams } from 'react-router-dom';
import { GameScreen } from '../game/GameScreen';
import { RoomLobby } from '../game/online/RoomLobby';
import { RoomGone } from '../game/online/RoomGone';
import { StaleClient } from '../game/online/StaleClient';
import { ConnectionStrip } from '../game/online/ConnectionStrip';
import { JoinForm } from '../game/online/JoinForm';
import { useRoom } from '../net/useRoom';
import { useDevSeat } from '../net/devSeat';
import { getConnection, closeConnection, type Connection } from '../net/connection';

export interface RoomPageProps {
  /** Injectable so screen tests can drive a fake. The app never passes it. */
  connect?: () => Connection;
}

export function RoomPage({ connect = getConnection }: RoomPageProps) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  // Above `useRoom`, and that ordering is load-bearing: `useRoom` reads the
  // stored identity during its own first render, so a seat handed over in the
  // URL has to be stored before this line. Dev only, compiled out otherwise.
  useDevSeat(roomId ?? '');
  const room = useRoom(roomId ?? '', connect);

  // Leaving is a real disconnect, not just a route change: the socket this
  // room's session and roster depend on closes, and `getConnection()` opens a
  // fresh one for wherever the player goes next.
  const leave = () => {
    closeConnection();
    navigate('/');
  };

  // The roster is the only thing that knows who is connected — the engine
  // state has no idea a socket exists. Undefined until one arrives, which
  // reads as "everyone present" rather than "everyone away".
  const presence = room.roster
    ? Object.fromEntries(room.roster.players.map((p) => [p.id, p.connected]))
    : undefined;

  if (room.phase === 'playing' && room.session && room.playerId) {
    return (
      <>
        <ConnectionStrip status={room.status} />
        {/*
          No `onEndGame`: this room belongs to everyone in it, and ending
          the game is not one player's to do. Leaving is.
        */}
        <GameScreen
          session={room.session}
          viewerId={room.playerId}
          connected={room.status === 'open'}
          presence={presence}
          onExit={leave}
        />
      </>
    );
  }

  if (room.phase === 'stale') {
    return (
      <>
        <ConnectionStrip status={room.status} />
        {/*
          A plain reload is the whole remedy today, because a refresh fetches
          the current bundle. Once a service worker caches the shell this has
          to reload past the worker instead — which is the reason the protocol
          version landed before the PWA rather than inside it.
        */}
        <StaleClient onReload={() => window.location.reload()} onExit={leave} />
      </>
    );
  }

  if (room.phase === 'gone') {
    return (
      <>
        <ConnectionStrip status={room.status} />
        <RoomGone roomId={roomId} onExit={leave} />
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
          myPlayerId={room.playerId}
          isHost={me?.isHost === true}
          note={room.message}
          onStart={room.begin}
          onRename={room.rename}
          // Leaving a *lobby* gives the seat up. A disconnect would keep the
          // seat and leave the room waiting on a player who is not coming back.
          onLeaveSeat={() => {
            room.leaveSeat();
            leave();
          }}
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
