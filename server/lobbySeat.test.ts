// server/lobbySeat.test.ts
// The lobby's own-row actions: rename yourself, vacate your seat.
//
// Both are socket-bound: identity comes from the binding, never the payload,
// so there is no message a client can send that touches anyone else's seat.
// Both are lobby-only — the engine copies names into `GameState` at
// startGame, and a mid-game rename would leave the roster and the log
// disagreeing about who did what; a mid-game leave is a disconnect, which
// already exists and keeps the seat.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startTestServer, settleSocket, type TestServer } from './socketHarness.js';
import { buildFixture } from '../engine/golden/fixtures.js';
import { connectPlayer } from './socketHarness.js';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PROTOCOL_VERSION,
  type JoinedMessage,
  type RejectedMessage,
  type RosterMessage,
} from '../session/protocol.js';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.close(); });

interface Seated {
  socket: Socket;
  playerId: string;
  rosters: RosterMessage[];
  rejections: RejectedMessage[];
  close(): void;
}

async function raw(): Promise<Socket> {
  const socket = connect(`http://localhost:${server.port}`, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('never connected')), 4000);
    socket.on('connect', () => { clearTimeout(timer); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
  return socket;
}

async function seat(action: 'create' | { join: string }, name: string): Promise<Seated> {
  const socket = await raw();
  const rosters: RosterMessage[] = [];
  const rejections: RejectedMessage[] = [];
  socket.on(SERVER_EVENTS.roster, (m: RosterMessage) => rosters.push(m));
  socket.on(SERVER_EVENTS.rejected, (m: RejectedMessage) => rejections.push(m));

  const joined = new Promise<JoinedMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} never seated`)), 4000);
    socket.once(SERVER_EVENTS.joined, (m: JoinedMessage) => { clearTimeout(timer); resolve(m); });
  });

  if (action === 'create') {
    socket.emit(CLIENT_EVENTS.createRoom, { name, protocolVersion: PROTOCOL_VERSION });
  } else {
    socket.emit(CLIENT_EVENTS.joinRoom, {
      roomId: action.join, name, protocolVersion: PROTOCOL_VERSION,
    });
  }
  const { playerId } = await joined;
  // `joined` and the roster ride the same handler but resolve independently
  // here — without this settle, `rosters[0]` is a race the fast runs win.
  await settleSocket(socket);

  return { socket, playerId, rosters, rejections, close: () => { socket.disconnect(); } };
}

describe('renamePlayer', () => {
  it('renames your own seat and tells the whole room', async () => {
    const host = await seat('create', 'Alex');
    const roomId = host.rosters[0].roomId;
    const guest = await seat({ join: roomId }, 'Player 2');

    try {
      guest.socket.emit(CLIENT_EVENTS.renamePlayer, { name: 'Sam' });
      await settleSocket(guest.socket);
      await settleSocket(host.socket);

      // Both ends of the room see the same rename — the host's channel is the
      // one that proves it was broadcast rather than echoed.
      const names = (r: RosterMessage[]) => r.at(-1)!.players.map((p) => p.name);
      expect(names(guest.rosters)).toEqual(['Alex', 'Sam']);
      expect(names(host.rosters)).toEqual(['Alex', 'Sam']);
      expect(guest.rejections).toEqual([]);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('refuses a blank name rather than blanking the seat', async () => {
    const host = await seat('create', 'Alex');

    try {
      host.socket.emit(CLIENT_EVENTS.renamePlayer, { name: '   ' });
      await settleSocket(host.socket);

      expect(host.rejections.map((r) => r.code)).toEqual(['unknownIntent']);
      expect(server.rooms.get(host.rosters[0].roomId)!.players[0].name).toBe('Alex');
    } finally {
      host.close();
    }
  });

  it('is refused once the game has begun, because the engine has the names now', async () => {
    const room = server.rooms.fromState('RENAME1', ['Alex', 'Sam'], buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['A1'] },
        { name: 'Sam', cash: 6000, hand: ['H8'] },
      ],
      bag: ['I11'],
    }));
    const alex = await connectPlayer(
      server.port, room.id, 'Alex', room.players[0].id, room.players[0].token,
    );

    try {
      alex.socket.emit(CLIENT_EVENTS.renamePlayer, { name: 'Alexander' });
      await settleSocket(alex.socket);

      expect(alex.rejections.map((r) => r.code)).toEqual(['wrongStage']);
      expect(room.players[0].name).toBe('Alex');
    } finally {
      alex.close();
    }
  });

  it('does nothing for a socket that holds no seat', async () => {
    const socket = await raw();
    const rejections: RejectedMessage[] = [];
    socket.on(SERVER_EVENTS.rejected, (m: RejectedMessage) => rejections.push(m));

    try {
      socket.emit(CLIENT_EVENTS.renamePlayer, { name: 'Nobody' });
      await settleSocket(socket);

      expect(rejections.map((r) => r.code)).toEqual(['notConnected']);
    } finally {
      socket.disconnect();
    }
  });
});

describe('leaveSeat', () => {
  it('vacates the seat and the roster stops listing it', async () => {
    const host = await seat('create', 'Alex');
    const roomId = host.rosters[0].roomId;
    const guest = await seat({ join: roomId }, 'Sam');

    try {
      guest.socket.emit(CLIENT_EVENTS.leaveSeat);
      await settleSocket(guest.socket);
      await settleSocket(host.socket);

      // Gone, not "away": a disconnect keeps the seat and marks it; the ×
      // gives it up. The host's roster is the proof it was broadcast.
      expect(host.rosters.at(-1)!.players.map((p) => p.name)).toEqual(['Alex']);
      expect(server.rooms.get(roomId)!.players).toHaveLength(1);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('hands the host flag to the next seat when the host leaves', async () => {
    const host = await seat('create', 'Alex');
    const roomId = host.rosters[0].roomId;
    const guest = await seat({ join: roomId }, 'Sam');

    try {
      host.socket.emit(CLIENT_EVENTS.leaveSeat);
      await settleSocket(host.socket);
      await settleSocket(guest.socket);

      // A lobby with no host is a lobby nobody can ever start.
      const remaining = guest.rosters.at(-1)!.players;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Sam');
      expect(remaining[0].isHost).toBe(true);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('is refused once the game has begun — mid-game leaving is a disconnect', async () => {
    const room = server.rooms.fromState('LEAVE01', ['Alex', 'Sam'], buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['A1'] },
        { name: 'Sam', cash: 6000, hand: ['H8'] },
      ],
      bag: ['I11'],
    }));
    const alex = await connectPlayer(
      server.port, room.id, 'Alex', room.players[0].id, room.players[0].token,
    );

    try {
      alex.socket.emit(CLIENT_EVENTS.leaveSeat);
      await settleSocket(alex.socket);

      expect(alex.rejections.map((r) => r.code)).toEqual(['wrongStage']);
      expect(room.players).toHaveLength(2);
    } finally {
      alex.close();
    }
  });
});
