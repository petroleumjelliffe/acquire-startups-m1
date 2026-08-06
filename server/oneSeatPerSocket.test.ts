import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { CLIENT_EVENTS, SERVER_EVENTS, type JoinedMessage, type RosterMessage } from '../session/protocol.js';
import { startTestServer, settleSocket, type TestServer } from './socketHarness.js';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.close(); });

/**
 * A raw socket, without the harness's `connectPlayer` — that helper joins with
 * a `playerId` and `token` already in hand, which is precisely the case this
 * file is *not* about.
 */
async function raw(port: number): Promise<Socket> {
  const socket = connect(`http://localhost:${port}`, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('never connected')), 4000);
    socket.on('connect', () => { clearTimeout(timer); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
  return socket;
}

function collect(socket: Socket) {
  const joined: JoinedMessage[] = [];
  const rosters: RosterMessage[] = [];
  socket.on(SERVER_EVENTS.joined, (m: JoinedMessage) => joined.push(m));
  socket.on(SERVER_EVENTS.roster, (m: RosterMessage) => rosters.push(m));
  return { joined, rosters };
}

/**
 * Found by hand, in two real browsers: a three-player roster from two people.
 *
 * A `joinRoom` carrying no `playerId`/`token` seats a *new* player — that is
 * what makes a first join work. The hazard is the same socket sending a second
 * one: a double-submit, or a client that re-joins after a socket blip before
 * its own `joined` reply ever landed, so it still holds no token to present.
 * Either way the seat it already occupies is orphaned — nobody is behind it,
 * and the game waits on it forever when its turn comes.
 *
 * The client-side guards (a disabled submit, a latch on the join effect) are
 * worth having and are not sufficient: they are one browser's promise about
 * message ordering across a reconnect it does not control. One socket holding
 * one seat per room is a property the server can simply enforce, and then no
 * client mistake can violate it.
 */
describe('one socket holds one seat per room', () => {
  it('re-seats the socket it already knows rather than adding a player', async () => {
    const host = await raw(server.port);
    const hostSaw = collect(host);
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Alex' });
    await settleSocket(host);

    const roomId = hostSaw.joined[0].roomId;

    const guest = await raw(server.port);
    const guestSaw = collect(guest);
    guest.emit(CLIENT_EVENTS.joinRoom, { roomId, name: 'Sam' });
    await settleSocket(guest);

    const firstSeat = guestSaw.joined[0].playerId;

    // The second join. A client that never heard its own `joined` has no token
    // to send, so this is byte-for-byte the message it sent the first time.
    guest.emit(CLIENT_EVENTS.joinRoom, { roomId, name: 'Sam' });
    await settleSocket(guest);
    await settleSocket(host);

    try {
      const room = server.rooms.get(roomId)!;
      expect(room.players.map((p) => p.name), 'a second seat was created').toEqual(['Alex', 'Sam']);
      expect(guestSaw.joined.at(-1)!.playerId, 'the guest was moved to a different seat')
        .toBe(firstSeat);
      // The host is the one who would have seen a phantom third player sitting
      // in the lobby, so the check that matters is on the host's own channel.
      expect(hostSaw.rosters.at(-1)!.players).toHaveLength(2);
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  });

  it('still seats a genuinely new player on a second socket', async () => {
    const host = await raw(server.port);
    const hostSaw = collect(host);
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Alex' });
    await settleSocket(host);
    const roomId = hostSaw.joined[0].roomId;

    const one = await raw(server.port);
    const two = await raw(server.port);
    one.emit(CLIENT_EVENTS.joinRoom, { roomId, name: 'Sam' });
    await settleSocket(one);
    two.emit(CLIENT_EVENTS.joinRoom, { roomId, name: 'Jordan' });
    await settleSocket(two);

    try {
      const room = server.rooms.get(roomId)!;
      expect(room.players.map((p) => p.name)).toEqual(['Alex', 'Sam', 'Jordan']);
    } finally {
      host.disconnect();
      one.disconnect();
      two.disconnect();
    }
  });
});
