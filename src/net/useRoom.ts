import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '../../session/protocol';
import type { RosterMessage } from '../../lobby/protocol';
import { getConnection, type Connection, type ConnectionStatus } from './connection';
import { createNetworkSession, type NetworkSession } from './NetworkSession';
import { clearIdentity, loadIdentity, rememberName, rememberedName, saveIdentity } from './identity';

export type RoomPhase =
  | 'connecting'
  | 'joining'
  | 'lobby'
  | 'playing'
  | 'error'
  | 'gone'
  /** This client and this server do not speak the same protocol. */
  | 'stale';

export interface Room {
  phase: RoomPhase;
  status: ConnectionStatus;
  roster: RosterMessage | null;
  playerId: string | null;
  session: NetworkSession | null;
  message: string | null;
  /**
   * Join again after a refusal. The name is optional — omitting it asks the
   * server to name the seat, which is what every ordinary arrival now does.
   */
  join(name?: string): void;
  begin(): void;
  /** Rename your own seat, lobby-only. The roster broadcast is the answer. */
  rename(name: string): void;
  /**
   * Give up your own seat, lobby-only — the lobby's `Leave`. Clears the stored
   * identity too: the seat is gone, so the token is dead, and keeping it
   * would make the next visit attempt a rejoin the server must refuse.
   */
  leaveSeat(): void;
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
  const [gone, setGone] = useState(false);
  const [stale, setStale] = useState(false);

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
      // Nothing this player can do reaches this room: it has ended, or the
      // server restarted onto a disk that no longer holds it. A join form
      // would invite them to keep trying something that cannot work. This is
      // terminal — handled fully here, not folded into the phase ternary
      // below — because a mid-game player already holds a `session`, and
      // `playing` outranks every other phase there. Leaving `session`
      // non-null would mean `gone` could never win: the board stays on
      // screen, looking live, while every click it sends is dropped by
      // `server/index.ts`'s `if (!bound || !room) return`.
      if (msg.code === 'noSuchRoom') {
        setGone(true);
        // Nothing can use a token for a room that is not there, and a
        // mid-game player is `seated`, so the clearing below would skip
        // them.
        clearIdentity(roomId);
        identityRef.current = null;
        // Tear the session down, or `playing` outranks `gone` forever and
        // the player keeps a live-looking board whose every click is
        // dropped. Nulling the ref first means the `onState` effect's own
        // cleanup (unmount, or a future `connection` change) sees a null
        // ref and does not dispose a second time.
        sessionRef.current?.dispose();
        sessionRef.current = null;
        setSession(null);
        return;
      }

      // Terminal for the same reason `noSuchRoom` is: a mid-game player holds
      // a `session`, and `playing` outranks everything in the phase
      // expression below, so a branch added there could never win. Nothing
      // this client sends will be accepted until it is reloaded, and a
      // live-looking board whose every click is refused is precisely the bug
      // Phase 4 shipped and the final review caught.
      //
      // Unlike `noSuchRoom`, the stored identity is **kept**. The room is
      // fine and the seat is still theirs — it is this client that cannot
      // talk. Clearing it would turn a reload, which fixes this, into a lost
      // seat, which nothing fixes.
      if (msg.code === 'versionMismatch') {
        setStale(true);
        sessionRef.current?.dispose();
        sessionRef.current = null;
        setSession(null);
        return;
      }

      // Once a game is running, a rejection belongs to the session, which
      // shows it in the panel. Surfacing it here as well would replace the
      // board with an error screen over a refused click.
      if (sessionRef.current === null) setMessage(msg.message);

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
      connection.joinRoom({
        roomId,
        name: stored.name,
        playerId: stored.playerId,
        token: stored.token,
        protocolVersion: PROTOCOL_VERSION,
      });
      return;
    }

    // No stored seat: a first join. Whatever this player last called
    // themselves, if anything — and if nothing, no name at all, which asks the
    // server to name the seat. There is no longer a case where the socket is
    // open and we sit here waiting to be told who we are.
    sent.current = true;
    const remembered = rememberedName();
    connection.joinRoom({
      roomId,
      ...(remembered === null ? {} : { name: remembered }),
      protocolVersion: PROTOCOL_VERSION,
    });
  }, [connection, roomId, status]);

  const join = useCallback((name?: string) => {
    if (name !== undefined) rememberName(name);
    sent.current = true;
    setMessage(null);
    connection.joinRoom({
      roomId,
      ...(name === undefined ? {} : { name }),
      protocolVersion: PROTOCOL_VERSION,
    });
  }, [connection, roomId]);

  const begin = useCallback(() => { connection.beginGame(); }, [connection]);

  const rename = useCallback((name: string) => {
    connection.renamePlayer(name);
    // Keep the stored copy current so a refresh rejoins under the new name.
    // The server ignores the name on a token rejoin, but a stale stored name
    // would still surface anywhere the client reads it before the roster
    // arrives.
    const identity = identityRef.current;
    if (identity !== null) {
      const updated = { ...identity, name };
      identityRef.current = updated;
      saveIdentity(roomId, updated);
    }
    rememberName(name);
  }, [connection, roomId]);

  const leaveSeat = useCallback(() => {
    connection.leaveSeat();
    clearIdentity(roomId);
    identityRef.current = null;
  }, [connection, roomId]);

  // Order matters. A roster means we are seated, and a refusal that arrives
  // afterwards ("only the host may begin") is a note to show *in* the lobby —
  // ranking `message` above `roster` would throw a seated player back to a
  // join form over a button they were not allowed to press.
  //
  // `gone` outranks everything below it here, but it sits *below* `playing`
  // in the chain — and that is fine. A mid-game player already holds a
  // `session`, so `session !== null` would win regardless of where `gone`
  // was placed in this chain; reordering the ternary cannot be what makes
  // `gone` win. What actually makes it win is the `onRejected` handler above
  // tearing the session down (`setSession(null)`) in the same tick it sets
  // `gone`, so by the time this expression runs, `session` is already null
  // and `playing` no longer applies.
  const phase: RoomPhase =
    // Ahead of `playing` as well as `gone`: both terminal states already tear
    // the session down, so this ordering is belt-and-braces rather than the
    // mechanism. The mechanism is the teardown — see the rejection handler.
    stale ? 'stale'
      : session !== null ? 'playing'
        : gone ? 'gone'
          : roster !== null ? 'lobby'
            : message !== null ? 'error'
              // Everything below a live socket is `joining`, because an open
              // socket in a room with no roster and no refusal *is* joining:
              // the effect above sends one unconditionally. The pair of flags
              // that used to live here — one for "sent", one for "certain to
              // be sent by an effect that has not run yet" — existed only to
              // keep a name form from flashing between them, and there is no
              // name form any more.
                : status !== 'open' ? 'connecting'
                  : 'joining';

  return { phase, status, roster, playerId, session, message, join, begin, rename, leaveSeat };
}
