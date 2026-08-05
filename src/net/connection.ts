import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type CreateRoomMessage,
  type JoinRoomMessage,
  type JoinedMessage,
  type RosterMessage,
} from '../../session/protocol';
import { createSocketTransport, type RoomTransport } from './transport';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * The lobby half of the wire, plus the transport the game half uses.
 *
 * Untested in isolation, deliberately: `server/clientOverWire.test.ts` proves
 * the transport against the real server, and the create/join/start path is
 * covered by the by-hand pass. A test that stubs `io()` and asserts `emit`
 * was called would restate this file rather than check it.
 */
export interface Connection {
  transport: RoomTransport;
  status(): ConnectionStatus;
  /** Fires on every status change. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  createRoom(name: string): void;
  joinRoom(msg: JoinRoomMessage): void;
  beginGame(): void;
  onJoined(handler: (msg: JoinedMessage) => void): () => void;
  onRoster(handler: (msg: RosterMessage) => void): () => void;
  close(): void;
}

function createConnection(): Connection {
  const socket: Socket = io(SERVER_URL, { transports: ['websocket'] });
  const listeners = new Set<() => void>();
  let status: ConnectionStatus = 'connecting';

  function set(next: ConnectionStatus): void {
    status = next;
    for (const listener of listeners) listener();
  }

  socket.on('connect', () => { set('open'); });
  socket.on('disconnect', () => { set('closed'); });
  socket.io.on('reconnect_attempt', () => { set('connecting'); });

  return {
    transport: createSocketTransport(socket),
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    createRoom(name) {
      const msg: CreateRoomMessage = { name };
      socket.emit(CLIENT_EVENTS.createRoom, msg);
    },
    joinRoom(msg) { socket.emit(CLIENT_EVENTS.joinRoom, msg); },
    beginGame() { socket.emit(CLIENT_EVENTS.beginGame); },
    onJoined(handler) {
      socket.on(SERVER_EVENTS.joined, handler);
      return () => { socket.off(SERVER_EVENTS.joined, handler); };
    },
    onRoster(handler) {
      socket.on(SERVER_EVENTS.roster, handler);
      return () => { socket.off(SERVER_EVENTS.roster, handler); };
    },
    close() {
      socket.disconnect();
      listeners.clear();
    },
  };
}

let current: Connection | null = null;

/**
 * One socket for the whole app, opened on first use.
 *
 * Lazy because pass-and-play and the catalog have no server by design — the
 * previous provider connected at page load and reported "Disconnected from
 * server" across a game that never needed one. Shared because the create
 * screen and the room screen are two views of one connection: opening a
 * second would drop the seat the first just bound.
 */
export function getConnection(): Connection {
  if (current === null) current = createConnection();
  return current;
}

export function closeConnection(): void {
  current?.close();
  current = null;
}
