import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  SERVER_EVENTS,
  type CreateRoomMessage,
  type JoinRoomMessage,
  type JoinedMessage,
  type RosterMessage,
} from '../../session/protocol';
import { createSocketTransport, type RoomTransport } from './transport';

/**
 * Where the server is.
 *
 * A deployed build sets `VITE_SERVER_URL` and that wins. The fallback is for
 * development, and it derives the host from the page rather than hardcoding
 * `localhost` — because `localhost` is only correct for the machine running
 * the dev server. `npm run dev` is `vite --host`, so the app is served across
 * the network on purpose, and a phone loading it from `192.168.x.x` used to
 * resolve this to *its own* `localhost` and sit on "Connecting…" forever.
 * Found by hand, testing two devices; a second browser on the same machine
 * never reveals it.
 *
 * The port stays fixed: the dev server is `tsx watch server/index.ts`, which
 * listens on 3001 unless `PORT` says otherwise, and that env var belongs to
 * the server process rather than to this bundle.
 */
const DEV_SERVER_PORT = 3001;
// `window` is read at module scope here, which throws on import in an
// environment with no `window` — a node test, most concretely. Safe today:
// every importer of this module lives under `src/**`, which vitest always
// runs under the `app` (jsdom) project. It stops being safe the moment
// something under `server/**` or `session/**` (the `node` project) imports
// this module, directly or transitively — that import would fail before a
// single test in the file runs, with a stack trace pointing here.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:${DEV_SERVER_PORT}`;

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
  const socket: Socket = io(SERVER_URL, {
    transports: ['websocket'],
    // Stated rather than inherited, because this deployment's worst case is
    // longer than the default connect timeout. A sleeping Render free
    // instance takes ~30s to wake, so the *first* attempt times out at 20s
    // and it is the retry that actually lands. Relying on a default for the
    // behaviour that makes cold starts work at all is how it silently stops
    // working when a dependency changes its mind.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
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
      const msg: CreateRoomMessage = { name, protocolVersion: PROTOCOL_VERSION };
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
