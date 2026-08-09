import { PROTOCOL_VERSION } from '../../session/protocol';
import { createLobbyConnection, type LobbyConnection } from '../lobby/connection';
import { createSocketTransport, type RoomTransport } from './transport';

export type { ConnectionStatus } from '../lobby/connection';

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

/**
 * The lobby half of the wire, plus the transport the game half uses.
 *
 * Untested in isolation, deliberately: `server/clientOverWire.test.ts` proves
 * the transport against the real server, and the create/join/start path is
 * covered by the by-hand pass. A test that stubs `io()` and asserts `emit`
 * was called would restate this file rather than check it.
 */
export interface Connection extends LobbyConnection {
  transport: RoomTransport;
}

function createConnection(): Connection {
  const lobby = createLobbyConnection({ serverUrl: SERVER_URL, protocolVersion: PROTOCOL_VERSION });
  return { ...lobby, transport: createSocketTransport(lobby.socket) };
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
