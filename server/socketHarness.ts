// server/socketHarness.ts
// Boots a real server on an ephemeral port and connects real socket.io
// clients to it. Nothing here is mocked: a fake transport cannot see a
// projection that is computed correctly and then broadcast unprojected,
// which is the defect this phase most needs to catch.

import { io as connect, type Socket } from 'socket.io-client';
import { createServer } from './index.js';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type JoinedMessage,
  type RejectedMessage,
  type StateMessage,
  type WireIntent,
} from '../session/protocol.js';

export interface TestServer {
  port: number;
  rooms: ReturnType<typeof createServer>['rooms'];
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const { httpServer, io, rooms } = createServer();

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server did not bind an ephemeral port');
  }

  return {
    port: address.port,
    rooms,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        httpServer.close(() => resolve());
      }),
  };
}

export interface TestClient {
  socket: Socket;
  playerId: string;
  /** Every state message this client received, oldest first. */
  states: StateMessage[];
  /** Every rejection this client received, oldest first. */
  rejections: RejectedMessage[];
  /** The most recent state, or undefined if none has arrived. */
  latest(): StateMessage | undefined;
  send(wire: WireIntent): Promise<void>;
  undo(stepId: number): Promise<void>;
  close(): void;
}

/**
 * Joins an existing room as `playerId`.
 *
 * `token` comes from the registry rather than the wire, because these tests
 * seat golden fixtures through `rooms.fromState` — there is deliberately no
 * socket event that installs a prepared state.
 */
export async function connectPlayer(
  port: number,
  roomId: string,
  name: string,
  playerId: string,
  token: string,
): Promise<TestClient> {
  const socket = connect(`http://localhost:${port}`, { transports: ['websocket'] });
  const states: StateMessage[] = [];
  const rejections: RejectedMessage[] = [];

  socket.on(SERVER_EVENTS.state, (m: StateMessage) => states.push(m));
  socket.on(SERVER_EVENTS.rejected, (m: RejectedMessage) => rejections.push(m));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} never connected`)), 4000);
    socket.on('connect', () => { clearTimeout(timer); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} never joined ${roomId}`)), 4000);
    socket.once(SERVER_EVENTS.joined, (_m: JoinedMessage) => { clearTimeout(timer); resolve(); });
    socket.emit(CLIENT_EVENTS.joinRoom, { roomId, name, playerId, token });
  });

  /**
   * Waits for the server to finish handling one message.
   *
   * The success path is deliberately silent, so there is nothing to await for
   * an accepted mid-segment intent. A round trip through an event the server
   * always answers orders our next assertion after the dispatch it follows.
   */
  const settle = () =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not settle')), 4000);
      socket.timeout(3000).emit('ping-settle', (err?: Error) => {
        clearTimeout(timer);
        if (err) reject(new Error('server did not settle'));
        else resolve();
      });
    });

  return {
    socket,
    playerId,
    states,
    rejections,
    latest: () => states[states.length - 1],
    async send(wire) {
      socket.emit(CLIENT_EVENTS.intent, wire);
      await settle();
    },
    async undo(stepId) {
      socket.emit(CLIENT_EVENTS.undo, { stepId });
      await settle();
    },
    close: () => { socket.disconnect(); },
  };
}
