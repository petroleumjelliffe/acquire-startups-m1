import type { LobbyRoomState } from './useLobbyRoom';

export interface LobbySeat {
  /** Server-assigned id, or null when nobody is sitting here. */
  id: string | null;
  /** 0-based position. Always present — games decorate by it. */
  index: number;
  name: string | null;
  isHost: boolean;
  isYou: boolean;
  connected: boolean;
  /** Your own seat, and only while the room is still a lobby. */
  canRename: boolean;
}

export interface LobbyView {
  /** Exactly `limits.capacity` entries: the occupied ones, then empties. */
  seats: LobbySeat[];
  you: LobbySeat | null;
  /** The room code. The *game* builds any URL from it — base paths are per-repo. */
  code: string;
  canBegin: boolean;
  beginBlocked: 'notHost' | 'notEnoughPlayers' | 'alreadyBegun' | null;
  connection: 'connecting' | 'live' | 'dropped';
  terminal: 'gone' | 'refused' | 'stale' | null;
}

/**
 * What the *game* knows about itself. Not sent by the server: both halves read
 * the same rule — `MAX_PLAYERS` builds the server's seat space and the
 * client's limits — so they cannot drift, and no protocol bump is spent on a
 * number neither side had to be told.
 */
export interface LobbyLimits {
  capacity: number;
  minPlayers: number;
}

const emptySeat = (index: number): LobbySeat => ({
  id: null,
  index,
  name: null,
  isHost: false,
  isYou: false,
  connected: false,
  canRename: false,
});

/**
 * The element inventory a lobby has: seats (occupied *and* empty), who you
 * are, the room code, whether you may begin, and how the connection stands.
 *
 * It exists because every consumer was re-deriving the same four facts —
 * `players.find(p => p.id === playerId)`, `me?.isHost`, `players.length >= 2`,
 * "may I rename this" — and could not derive the fifth at all: the roster
 * carries only occupied seats, so an empty one was inexpressible.
 *
 * Pure, and deliberately so. This is the half both games share, and neither
 * game's screens can be tested through the other's.
 */
export function lobbyView(state: LobbyRoomState, limits: LobbyLimits): LobbyView {
  const players = state.roster?.players ?? [];
  const lifecycle = state.roster?.lifecycle ?? 'lobby';

  const seats: LobbySeat[] = Array.from({ length: limits.capacity }, (_, index) => {
    const player = players[index];
    if (!player) return emptySeat(index);
    const isYou = player.id === state.playerId;
    return {
      id: player.id,
      index,
      name: player.name,
      isHost: player.isHost,
      isYou,
      connected: player.connected,
      canRename: isYou && lifecycle === 'lobby',
    };
  });

  const you = seats.find((seat) => seat.isYou) ?? null;

  // notHost before notEnoughPlayers: a guest should be told the thing that is
  // theirs to know, not the thing that is merely also true.
  const beginBlocked: LobbyView['beginBlocked'] =
    lifecycle !== 'lobby'
      ? 'alreadyBegun'
      : you?.isHost !== true
        ? 'notHost'
        : players.length < limits.minPlayers
          ? 'notEnoughPlayers'
          : null;

  return {
    seats,
    you,
    code: state.roster?.roomId ?? '',
    canBegin: beginBlocked === null,
    beginBlocked,
    connection:
      state.status === 'open' ? 'live' : state.status === 'closed' ? 'dropped' : 'connecting',
    // Stale outranks gone: a client on the wrong protocol cannot trust either
    // answer it was given, so "your client is old" is the honest one.
    terminal: state.stale
      ? 'stale'
      : state.gone
        ? 'gone'
        : state.phase === 'error'
          ? 'refused'
          : null,
  };
}
