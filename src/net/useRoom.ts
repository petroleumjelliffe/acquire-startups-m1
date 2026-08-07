import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RosterMessage } from '../../session/protocol';
import { getConnection, type Connection, type ConnectionStatus } from './connection';
import { createNetworkSession, type NetworkSession } from './NetworkSession';
import { clearIdentity, loadIdentity, rememberName, rememberedName, saveIdentity } from './identity';

export type RoomPhase = 'connecting' | 'joining' | 'needName' | 'lobby' | 'playing' | 'error' | 'gone';

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
  const [gone, setGone] = useState(false);

  const sessionRef = useRef<NetworkSession | null>(null);
  // Read once, at mount, for whatever `roomId` the hook first saw. A `roomId`
  // change on an already-mounted instance would keep the old room's identity
  // rather than loading the new room's — unreachable today because every
  // navigation into `/room/:roomId` comes from another route, never a
  // same-instance param change. A future room-switch flow (leave and rejoin
  // without a full navigation) would need to revisit this.
  const identityRef = useRef(loadIdentity(roomId));
  // True once a `roster` has actually seated us — the moment a rejection can
  // no longer mean "our join was refused" and starts meaning "something we
  // tried inside the lobby was refused" instead.
  const seatedRef = useRef(false);
  // Last known connection status, so the status subscription below can tell
  // "just dropped" from "still down" and "just recovered" apart, rather than
  // firing on every intermediate `connecting` pulse a reconnect attempt sends.
  const wasOpenRef = useRef(false);
  // Declared here, ahead of the effects that read and reset it, purely for a
  // reader's sake — the status effect below closes over it regardless of
  // source order, since every hook in this component runs before any effect
  // body does.
  const sent = useRef(false);

  // Status, roster, identity, and the lobby's own rejections.
  useEffect(() => {
    setStatus(connection.status());
    wasOpenRef.current = connection.status() === 'open';

    const offStatus = connection.subscribe(() => {
      const next = connection.status();
      if (wasOpenRef.current && next !== 'open') {
        // A live connection just dropped. `sent` is what stops the join
        // effect below from ever re-sending `joinRoom` — reset it so the
        // reconnect this same subscription will observe (when `next` becomes
        // 'open' again) resends it with the stored token, which is the
        // machinery `server/rooms.ts`'s `join` already accepts for a rejoin.
        // The session, if the game has already started, cannot hear a
        // transport-level event on its own — nothing socket.io delivers
        // tells it the wire is down — so it is told directly.
        sent.current = false;
        sessionRef.current?.connectionLost();
      }
      wasOpenRef.current = next === 'open';
      setStatus(next);
    });

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

    const offRoster = connection.onRoster((msg) => {
      seatedRef.current = true;
      setRoster(msg);
    });

    const offRejected = connection.transport.onRejected((msg) => {
      // Once a game is running, a rejection belongs to the session, which
      // shows it in the panel. Surfacing it here as well would replace the
      // board with an error screen over a refused click.
      if (sessionRef.current === null) setMessage(msg.message);

      // Nothing this player can do reaches this room: it has ended, or the
      // server restarted onto a disk that no longer holds it. A join form
      // would invite them to keep trying something that cannot work.
      if (msg.code === 'noSuchRoom') setGone(true);

      // A rejection that arrives before we have ever been seated can only be
      // the join itself being refused — and if it was attempted with a
      // stored identity, that identity is what got refused: a stale token,
      // or a seat the server has forgotten. Nothing downstream can turn it
      // into a working seat, so keeping it only guarantees every future visit
      // repeats the same doomed rejoin. Clearing it is what lets a later load
      // offer a clean join instead.
      if (!seatedRef.current && identityRef.current !== null) {
        clearIdentity(roomId);
        identityRef.current = null;
      }
    });

    return () => { offStatus(); offJoined(); offRoster(); offRejected(); };
  }, [connection, roomId]);

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
  //
  // `gone` outranks all of those and yields only to `playing`: a room that
  // does not exist cannot be joined, listed or corrected, so no earlier
  // screen has anything useful to offer. It sits below `playing` because a
  // running session means we are in a room that plainly does exist.
  const phase: RoomPhase =
    session !== null ? 'playing'
      : gone ? 'gone'
        : roster !== null ? 'lobby'
          : message !== null ? 'error'
            : status !== 'open' ? 'connecting'
              : joining ? 'joining'
                : 'needName';

  return { phase, status, roster, playerId, session, message, join, begin };
}
