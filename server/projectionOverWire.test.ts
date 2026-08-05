import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioConnect, type Socket } from 'socket.io-client';
import { buildFixture } from '../engine/golden/fixtures.js';
import type { Coord, Row } from '../engine/gameHelpers.js';
import { startTestServer, connectPlayer, settleSocket, type TestServer } from './socketHarness.js';
import { project } from './projection.js';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type JoinedMessage,
  type RejectedMessage,
} from '../session/protocol.js';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.close(); });

/** p1 can end their turn immediately (empty hand, no legal placement). */
function twoSeats(roomId: string) {
  return server.rooms.fromState(
    roomId,
    ['Alex', 'Sam'],
    buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: [] },
        { name: 'Sam', cash: 6000, hand: ['A1', 'B2'] },
      ],
      loners: ['E5'],
      bag: ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'],
    }),
  );
}

/** p1 holds a tile worth placing; p2 waits. */
function openSegment(roomId: string) {
  return server.rooms.fromState(
    roomId,
    ['Alex', 'Sam'],
    buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['A1'] },
      ],
      loners: ['E5'],
      bag: ['I11'],
    }),
  );
}

/**
 * p1 holds one genuinely dead tile (`C6`, boxed in between two safe 11-tile
 * chains — the exact setup golden game G8 uses to prove it is dead). Trading
 * it in via `tradeInDeadTiles` is the *only* intent that produces a real
 * `correction` delivery: same actor, segment stays open, but the bag was
 * touched — `placeTile` never reaches this path (it is not in `DRAWS`), and
 * `endTurn`/`startGame` always close the segment instead (`server/room.ts`'s
 * own comment on `DRAWS` says so directly). A privacy test that exercises
 * `placeTile` instead, as `openSegment`'s does, cannot observe this delivery
 * kind at all.
 */
function deadTileSegment(roomId: string) {
  const row = (letter: Row, n: number): Coord[] =>
    Array.from({ length: n }, (_, i) => `${letter}${i + 1}` as Coord);
  return server.rooms.fromState(
    roomId,
    ['Alex', 'Sam'],
    buildFixture({
      players: [
        { name: 'Alex', cash: 4200, hand: ['C6'] },
        { name: 'Sam', cash: 5800, hand: ['A1'] },
      ],
      chains: [
        { id: 'Messla', coords: row('B', 11) },
        { id: 'ZuckFace', coords: row('D', 11) },
      ],
      bag: ['I12'],
    }),
  );
}

/** A bare socket, connected but bound to nothing. */
async function bareSocket(): Promise<Socket> {
  const socket = ioConnect(`http://localhost:${server.port}`, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('never connected')), 4000);
    socket.on('connect', () => { clearTimeout(timer); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
  return socket;
}

describe('what a client receives', () => {
  it('carries no seed, no bag, and no hand but its own', async () => {
    const room = twoSeats('wire-projection');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      await p1.send({ type: 'endTurn' });
      // `p1.send` only orders the server's *handling* of p1's message, not
      // the *arrival* of anything the handling sent to p2's own, separate
      // connection. A round trip on p2's own channel orders behind any
      // earlier emit to p2 (socket.io delivers one connection's messages in
      // order) — without it, a stale join-time message could make the
      // p1-hand assertion below vacuous.
      await settleSocket(p2.socket);

      const received = p2.latest();
      expect(received, 'p2 received no state at all').toBeDefined();
      expect(received!.state.seed).toBe('');
      expect(received!.state.players.find((p) => p.id === 'p2')!.hand).toEqual(['A1', 'B2']);
      expect(received!.state.players.find((p) => p.id === 'p1')!.hand).toEqual([]);

      // The pair is the point: the client's copy must be empty *while* the
      // server still holds real tiles. Either alone proves nothing — an empty
      // projected bag is meaningless if the bag was empty anyway.
      expect(received!.state.bag).toEqual([]);
      expect(room.committed().bag.length).toBe(4);
      expect(room.committed().seed).not.toBe('');
    } finally {
      p1.close();
      p2.close();
    }
  });
});

describe('an open segment is private', () => {
  it('sends the actor nothing and the table nothing while the draft advances', async () => {
    const room = openSegment('wire-draft');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      // Joining an already-playing room sends the joiner their own commit
      // state immediately (`server/index.ts`'s `joinRoom` handler) — over a
      // real socket that arrives asynchronously, and `connectPlayer` only
      // waits for `joined`, not for it. Drain it on p2's own channel before
      // taking the "before" count, or it can land during the `await` below
      // and be misread as a leak of p1's draft.
      await settleSocket(p2.socket);
      const p2Before = p2.states.length;

      await p1.send({ type: 'placeTile', coord: 'E6' });
      // `p1.send`'s round trip is on p1's own socket. It says nothing about
      // whether anything reached p2's separate connection — only a barrier
      // on p2's own channel, ordered behind any leak already emitted to p2,
      // can prove one didn't land.
      await settleSocket(p2.socket);

      // The placement founds a chain: same actor, segment still open.
      expect(room.actorId()).toBe('p1');
      expect(room.draft().board['E6'].placed).toBe(true);
      expect(room.committed().board['E6'].placed).toBe(false);

      expect(p2.states.length, 'p2 was shown an uncommitted draft').toBe(p2Before);
      expect(p2.states.some((m) => m.reason === 'correction')).toBe(false);
    } finally {
      p1.close();
      p2.close();
    }
  });

  it('sends a genuine mid-segment correction to the actor only', async () => {
    const room = deadTileSegment('wire-correction-privacy');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      await settleSocket(p2.socket);
      const p2Before = p2.states.length;

      await p1.send({ type: 'tradeInDeadTiles', coords: ['C6'] });
      // Same reasoning as the sibling test above: a barrier on p1's own
      // socket proves nothing about p2's channel.
      await settleSocket(p2.socket);

      // Same actor, segment stays open, but the bag was touched — this is
      // the one intent (per `server/room.ts`'s `DRAWS`) that produces a real
      // `correction` delivery rather than `none` or a `commit`.
      expect(room.actorId()).toBe('p1');
      expect(room.draft().players.find((p) => p.id === 'p1')!.hand).toEqual(['I12']);
      expect(p1.latest()!.reason).toBe('correction');

      expect(p2.states.length, 'p2 was shown a correction meant for the actor').toBe(p2Before);
      expect(p2.states.every((m) => m.reason !== 'correction')).toBe(true);
    } finally {
      p1.close();
      p2.close();
    }
  });
});

describe('identity is the socket, not the payload', () => {
  it('rejects an intent from the player who is not being waited on', async () => {
    const room = openSegment('wire-turn');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      await p2.send({ type: 'placeTile', coord: 'A1' });

      expect(p2.rejections).toHaveLength(1);
      expect(p2.rejections[0].code).toBe('notYourTurn');
      expect(room.draft().board['A1'].placed).toBe(false);
    } finally {
      p1.close();
      p2.close();
    }
  });

  it('ignores a playerId smuggled into the payload', async () => {
    const room = openSegment('wire-spoof');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      // The wire type has no `playerId`, so this does not typecheck as a
      // `WireIntent` — which is the point. A hostile client is not bound by
      // our types, so the server must ignore the field rather than trust it.
      p2.socket.emit('intent', { type: 'placeTile', coord: 'E6', playerId: 'p1' });
      await p2.send({ type: 'endTurn' });

      expect(room.draft().board['E6'].placed).toBe(false);
      expect(p2.rejections.map((r) => r.code)).toEqual(['notYourTurn', 'notYourTurn']);
    } finally {
      p1.close();
      p2.close();
    }
  });
});

describe('undo over the wire', () => {
  it('lets the actor rewind its own open segment', async () => {
    const room = openSegment('wire-undo');
    const [alex] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);

    try {
      const opened = room.segmentStart();
      await p1.send({ type: 'placeTile', coord: 'E6' });
      expect(room.draft().board['E6'].placed).toBe(true);

      await p1.undo(opened);

      expect(room.draft().board['E6'].placed).toBe(false);
      expect(p1.latest()!.reason).toBe('correction');
    } finally {
      p1.close();
    }
  });

  it('refuses an undo from a player who is not the actor', async () => {
    const room = openSegment('wire-undo-foreign');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      const opened = room.segmentStart();
      await p1.send({ type: 'placeTile', coord: 'E6' });

      await p2.undo(opened);

      expect(p2.rejections.map((r) => r.code)).toContain('notYourTurn');
      expect(room.draft().board['E6'].placed).toBe(true);
    } finally {
      p1.close();
      p2.close();
    }
  });

  it('refuses a step below the open segment', async () => {
    const room = openSegment('wire-undo-old');
    const [alex] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);

    try {
      await p1.send({ type: 'placeTile', coord: 'E6' });
      await p1.undo(0);

      expect(p1.rejections.map((r) => r.code)).toContain('undoOutOfSegment');
      expect(room.draft().board['E6'].placed).toBe(true);
    } finally {
      p1.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Five additional tests, accumulated from findings in Tasks 6 and 7. Each
// covers a real defect that was found and fixed but currently ships
// untested — see task-8-brief.md for the enumeration.
// ---------------------------------------------------------------------------

describe('an intent or undo sent before the game has begun', () => {
  it('is rejected as wrongStage, and the server stays up', async () => {
    const { room, player } = server.rooms.create('Alex');
    const p1 = await connectPlayer(server.port, room.id, player.name, player.id, player.token);

    try {
      await p1.send({ type: 'endTurn' });
      expect(p1.rejections).toHaveLength(1);
      expect(p1.rejections[0].code).toBe('wrongStage');

      await p1.undo(0);
      expect(p1.rejections).toHaveLength(2);
      expect(p1.rejections[1].code).toBe('wrongStage');

      // Not merely "our script didn't throw" — the process is still
      // actually serving requests.
      const health = await fetch(`http://localhost:${server.port}/health`);
      expect(health.ok).toBe(true);
      expect(await health.json()).toEqual({ ok: true });
    } finally {
      p1.close();
    }
  });
});

describe('a malformed or absent payload', () => {
  it('createRoom rejects it instead of crashing the server', async () => {
    const socket = await bareSocket();
    const rejections: RejectedMessage[] = [];
    socket.on(SERVER_EVENTS.rejected, (m: RejectedMessage) => rejections.push(m));

    try {
      socket.emit(CLIENT_EVENTS.createRoom, undefined);
      await settleSocket(socket);
      expect(rejections).toHaveLength(1);
      expect(rejections[0].code).toBe('unknownIntent');

      socket.emit(CLIENT_EVENTS.createRoom, { name: 42 });
      await settleSocket(socket);
      expect(rejections).toHaveLength(2);
      expect(rejections[1].code).toBe('unknownIntent');

      // The server is still serving: a well-formed createRoom on the very
      // same socket, right after two malformed ones, still works.
      const joined = await new Promise<JoinedMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('never joined')), 4000);
        socket.once(SERVER_EVENTS.joined, (m: JoinedMessage) => { clearTimeout(timer); resolve(m); });
        socket.emit(CLIENT_EVENTS.createRoom, { name: 'Real Name' });
      });
      expect(joined.roomId).toBeTruthy();
    } finally {
      socket.disconnect();
    }
  });

  it('joinRoom rejects it instead of crashing the server', async () => {
    const { room } = server.rooms.create('Host');
    const socket = await bareSocket();
    const rejections: RejectedMessage[] = [];
    socket.on(SERVER_EVENTS.rejected, (m: RejectedMessage) => rejections.push(m));

    try {
      socket.emit(CLIENT_EVENTS.joinRoom, undefined);
      await settleSocket(socket);
      expect(rejections).toHaveLength(1);
      expect(rejections[0].code).toBe('unknownIntent');

      socket.emit(CLIENT_EVENTS.joinRoom, { roomId: room.id }); // no `name`
      await settleSocket(socket);
      expect(rejections).toHaveLength(2);
      expect(rejections[1].code).toBe('unknownIntent');

      const joined = await new Promise<JoinedMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('never joined')), 4000);
        socket.once(SERVER_EVENTS.joined, (m: JoinedMessage) => { clearTimeout(timer); resolve(m); });
        socket.emit(CLIENT_EVENTS.joinRoom, { roomId: room.id, name: 'Guest' });
      });
      expect(joined.roomId).toBe(room.id);
    } finally {
      socket.disconnect();
    }
  });

  it('undo rejects a non-numeric stepId instead of crashing the server', async () => {
    const room = openSegment('wire-undo-malformed');
    const [alex] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);

    try {
      p1.socket.emit(CLIENT_EVENTS.undo, {});
      await settleSocket(p1.socket);
      expect(p1.rejections).toHaveLength(1);
      expect(p1.rejections[0].code).toBe('undoOutOfSegment');

      p1.socket.emit(CLIENT_EVENTS.undo, undefined);
      await settleSocket(p1.socket);
      expect(p1.rejections).toHaveLength(2);
      expect(p1.rejections[1].code).toBe('undoOutOfSegment');

      // The server is still serving: a real intent on the same connection
      // still works.
      await p1.send({ type: 'placeTile', coord: 'E6' });
      expect(room.draft().board['E6'].placed).toBe(true);
    } finally {
      p1.close();
    }
  });
});

describe('a rejection is addressed to a non-actor', () => {
  it('carries the committed state, never the actor draft — and the actor still gets their own draft back', async () => {
    const room = openSegment('wire-reject-draft-leak');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      await p1.send({ type: 'placeTile', coord: 'E6' });
      expect(room.actorId()).toBe('p1');
      expect(room.draft().board['E6'].placed).toBe(true);
      expect(room.committed().board['E6'].placed).toBe(false);

      // p2 is not the actor: their out-of-turn intent is rejected, and the
      // 'reset' that follows must be the committed state — not the open
      // draft holding p1's uncommitted board, cash and log.
      //
      // `placeTile` would not do it here: the founding placement already
      // moved the stage to 'foundStartup', so a `placeTile` intent fails
      // `requireStage` before identity is ever checked, giving `wrongStage`
      // instead of `notYourTurn`. `chooseFoundingBrand` matches the actual
      // stage, so it reaches — and fails — the identity check instead.
      await p2.send({ type: 'chooseFoundingBrand', startupId: 'Gobble' });
      expect(p2.rejections.map((r) => r.code)).toEqual(['notYourTurn']);
      expect(p2.latest()!.state).toEqual(project(room.committed(), 'p2'));
      expect(p2.latest()!.state.board['E6'].placed).toBe(false);

      // p1 IS the actor: `endTurn` while mid-founding is a genuine rejection
      // (wrongStage), and *their own* 'reset' must still show them their own
      // open draft, not a reset all the way back to committed.
      await p1.send({ type: 'endTurn' });
      expect(p1.rejections.map((r) => r.code)).toEqual(['wrongStage']);
      expect(p1.latest()!.state).toEqual(project(room.draft(), 'p1'));
      expect(p1.latest()!.state.board['E6'].placed).toBe(true);
    } finally {
      p1.close();
      p2.close();
    }
  });
});

describe('a player id that was never seated', () => {
  it('is rejected as notYourTurn, not a crash, and the server stays up', async () => {
    const room = openSegment('wire-unseated');
    const [alex] = room.players;

    // No socket can ever bind to this id — `rooms.join` requires it to match
    // an existing seat's token — so this calls `room.dispatch`/`room.undo`
    // directly, exactly as the socket handlers do once a socket is bound.
    const dispatched = room.dispatch('totally-unseated-id', { type: 'endTurn' });
    expect(dispatched).toMatchObject({ kind: 'rejected', code: 'notYourTurn' });

    const undone = room.undo('totally-unseated-id', 0);
    expect(undone).toMatchObject({ kind: 'rejected', code: 'notYourTurn' });

    // The server this room lives in is still serving real players.
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    try {
      await p1.send({ type: 'placeTile', coord: 'E6' });
      expect(room.draft().board['E6'].placed).toBe(true);
    } finally {
      p1.close();
    }
  });
});

describe('a rejected intent leaves the draft unchanged', () => {
  it('is byte-for-byte identical, asserted over the wire', async () => {
    const room = openSegment('wire-unchanged-draft');
    const [alex, sam] = room.players;
    const p1 = await connectPlayer(server.port, room.id, alex.name, alex.id, alex.token);
    const p2 = await connectPlayer(server.port, room.id, sam.name, sam.id, sam.token);

    try {
      const before = JSON.stringify(room.draft());

      await p2.send({ type: 'placeTile', coord: 'A1' }); // not p2's turn

      expect(p2.rejections.map((r) => r.code)).toEqual(['notYourTurn']);
      expect(JSON.stringify(room.draft())).toBe(before);
    } finally {
      p1.close();
      p2.close();
    }
  });
});
