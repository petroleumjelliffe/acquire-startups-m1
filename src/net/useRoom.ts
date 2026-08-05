import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RosterMessage } from '../../session/protocol';
import { getConnection, type Connection, type ConnectionStatus } from './connection';
import { createNetworkSession, type NetworkSession } from './NetworkSession';
import { loadIdentity, rememberName, rememberedName, saveIdentity } from './identity';

export type RoomPhase = 'connecting' | 'joining' | 'needName' | 'lobby' | 'playing' | 'error';

export interface Room {
  phase: RoomPhase;
  status: ConnectionStatus;
  roster: RosterMessage | null;
  playerId: string | null;
  session: NetworkSession | null;
  message: string | null;
  /** Join with a name, for someone arriving on a shared link. */
  join(name: string): void;
  begin(): void;
}

/**
 * connect → join → lobby → playing.
 *
 * `connect` is injectable so screen tests can drive a fake connection; every
 * caller in the app uses the real one.
 */
export function useRoom(roomId: string, connect: () => Connection = getConnection): Room {
  const connection = useMemo(() => connect(), [connect]);

  const [status, setStatus] = useState<ConnectionStatus>(() => connection.status());
  const [roster, setRoster] = useState<RosterMessage | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [session, setSession] = useState<NetworkSession | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const sessionRef = useRef<NetworkSession | null>(null);
  const identityRef = useRef(loadIdentity(roomId));

  // Status, roster, identity, and the lobby's own rejections.
  useEffect(() => {
    setStatus(connection.status());
    const offStatus = connection.subscribe(() => setStatus(connection.status()));

    const offJoined = connection.onJoined((msg) => {
      const identity = {
        playerId: msg.playerId,
        token: msg.token,
        name: identityRef.current?.name ?? rememberedName() ?? '',
      };
      identityRef.current = identity;
      saveIdentity(msg.roomId, identity);
      setPlayerId(msg.playerId);
      setMessage(null);
    });

    const offRoster = connection.onRoster((msg) => setRoster(msg));

    const offRejected = connection.transport.onRejected((msg) => {
      // Once a game is running, a rejection belongs to the session, which
      // shows it in the panel. Surfacing it here as well would replace the
      // board with an error screen over a refused click.
      if (sessionRef.current === null) setMessage(msg.message);
    });

    return () => { offStatus(); offJoined(); offRoster(); offRejected(); };
  }, [connection]);

  // The first state message is what turns a lobby into a game.
  useEffect(() => {
    const off = connection.transport.onState((msg) => {
      if (sessionRef.current !== null) return;
      const id = identityRef.current?.playerId;
      if (id === undefined) return;

      const built = createNetworkSession({ transport: connection.transport, playerId: id, initial: msg });
      sessionRef.current = built;
      setSession(built);
    });

    return () => {
      off();
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [connection]);

  // Join once, as soon as the socket is open and we know what to say.
  const sent = useRef(false);
  useEffect(() => {
    if (status !== 'open' || sent.current || roomId === '') return;

    const stored = identityRef.current;
    if (stored !== null) {
      sent.current = true;
      setJoining(true);
      connection.joinRoom({
        roomId,
        name: stored.name,
        playerId: stored.playerId,
        token: stored.token,
      });
      return;
    }

    const remembered = rememberedName();
    if (remembered === null) return; // phase: needName

    sent.current = true;
    setJoining(true);
    connection.joinRoom({ roomId, name: remembered });
  }, [connection, roomId, status]);

  const join = useCallback((name: string) => {
    rememberName(name);
    sent.current = true;
    setJoining(true);
    setMessage(null);
    connection.joinRoom({ roomId, name });
  }, [connection, roomId]);

  const begin = useCallback(() => { connection.beginGame(); }, [connection]);

  // Order matters. A roster means we are seated, and a refusal that arrives
  // afterwards ("only the host may begin") is a note to show *in* the lobby —
  // ranking `message` above `roster` would throw a seated player back to a
  // join form over a button they were not allowed to press.
  const phase: RoomPhase =
    session !== null ? 'playing'
      : roster !== null ? 'lobby'
        : message !== null ? 'error'
          : status !== 'open' ? 'connecting'
            : joining ? 'joining'
              : 'needName';

  return { phase, status, roster, playerId, session, message, join, begin };
}
