// server/index.ts
// Transport only. The room decides what happened; this file decides who hears
// about it, and is the single place `project` is ever called.

import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { project } from './projection.js';
import { createRoomRegistry, type RoomRegistry } from './rooms.js';
import type { Delivery, GameRoom } from './room.js';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type CreateRoomMessage,
  type JoinRoomMessage,
  type JoinedMessage,
  type RosterMessage,
  type StateMessage,
  type StateReason,
  type UndoMessage,
  type WireIntent,
  isWireIntent,
} from '../session/protocol.js';

/** Which room and seat a socket is bound to. The client never says. */
interface Binding {
  roomId: string;
  playerId: string;
}

export interface ServerHandle {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketServer;
  rooms: RoomRegistry;
}

export function createServer(): ServerHandle {
  const app = express();
  app.use(cors());
  app.get('/health', (_req, res) => { res.json({ ok: true }); });

  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: '*' } });
  const rooms = createRoomRegistry();
  const bindings = new Map<string, Binding>();

  function socketsFor(roomId: string, playerId: string): Socket[] {
    return [...io.sockets.sockets.values()].filter((s) => {
      const b = bindings.get(s.id);
      return b?.roomId === roomId && b.playerId === playerId;
    });
  }

  /** The one send site. Everything a client ever sees is projected here. */
  function sendState(room: GameRoom, playerId: string, reason: StateReason): void {
    // A draft belongs to exactly one player: the one the game is waiting on.
    // `reset` follows a rejection, and a rejection can be addressed to someone
    // who is *not* the actor — an out-of-turn intent, or an undo from the
    // wrong player. Sending them the draft hands over the actor's uncommitted
    // board, cash and log, which is the leak this phase exists to prevent.
    // They get the committed state: it is what they already had, which is what
    // "reset" should mean for them.
    const ownsDraft = reason !== 'commit' && playerId === room.actorId();
    const source = ownsDraft ? room.draft() : room.committed();
    const message: StateMessage = {
      state: project(source, playerId),
      reason,
      segmentStart: room.segmentStart(),
    };
    for (const socket of socketsFor(room.id, playerId)) {
      socket.emit(SERVER_EVENTS.state, message);
    }
  }

  function roster(room: GameRoom): RosterMessage {
    return {
      roomId: room.id,
      lifecycle: room.lifecycle(),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
      })),
    };
  }

  /**
   * Turns the room's verdict into sends.
   *
   * A commit is the only thing the whole table hears. Corrections and
   * rejections go to one player, which is what keeps an open segment private:
   * there is no branch here that broadcasts a draft.
   */
  function deliver(room: GameRoom, delivery: Delivery): void {
    switch (delivery.kind) {
      case 'none':
        return;
      case 'commit':
        for (const p of room.players) sendState(room, p.id, 'commit');
        void rooms.persist(room);
        return;
      case 'correction':
        sendState(room, delivery.to, 'correction');
        return;
      case 'rejected':
        for (const socket of socketsFor(room.id, delivery.to)) {
          socket.emit(SERVER_EVENTS.rejected, { code: delivery.code, message: delivery.message });
        }
        sendState(room, delivery.to, 'reset');
        return;
    }
  }

  io.on('connection', (socket) => {
    /**
     * Answers immediately, and does nothing else.
     *
     * socket.io delivers a connection's messages in order, so an acknowledged
     * round trip that arrives after an intent proves the intent was handled.
     * Tests need this because the accepted mid-segment path is deliberately
     * silent — there is no reply to await, and without an ordering point an
     * assertion runs before the server has processed anything and passes
     * vacuously.
     */
    socket.on('ping-settle', (ack: () => void) => { if (typeof ack === 'function') ack(); });

    socket.on(CLIENT_EVENTS.createRoom, (msg: CreateRoomMessage) => {
      // `msg` is whatever the client sent, typed only by wishful thinking —
      // a malformed or missing payload dereferenced below would throw
      // synchronously inside this listener and take the whole process down
      // for every room, not just this connection. This socket has not even
      // bound to a room yet, so any connecting client can reach this line.
      if (typeof msg?.name !== 'string') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'unknownIntent',
          message: 'createRoom requires a name',
        });
        return;
      }

      const { room, player } = rooms.create(msg.name);
      bindings.set(socket.id, { roomId: room.id, playerId: player.id });
      void socket.join(room.id);

      const joined: JoinedMessage = { roomId: room.id, playerId: player.id, token: player.token };
      socket.emit(SERVER_EVENTS.joined, joined);
      io.to(room.id).emit(SERVER_EVENTS.roster, roster(room));
    });

    socket.on(CLIENT_EVENTS.joinRoom, (msg: JoinRoomMessage) => {
      // Same shape hazard as `createRoom`, above: this socket has not bound
      // to anything yet either, so a malformed payload here is just as
      // reachable by any connecting client.
      if (typeof msg?.roomId !== 'string' || typeof msg?.name !== 'string') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'unknownIntent',
          message: 'joinRoom requires a roomId and a name',
        });
        return;
      }

      const seat = rooms.join(msg.roomId, msg.name, msg.playerId, msg.token);
      if (!seat) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'unknownIntent',
          message: `cannot join ${msg.roomId}`,
        });
        return;
      }

      bindings.set(socket.id, { roomId: seat.room.id, playerId: seat.player.id });
      void socket.join(seat.room.id);

      const joined: JoinedMessage = {
        roomId: seat.room.id,
        playerId: seat.player.id,
        token: seat.player.token,
      };
      socket.emit(SERVER_EVENTS.joined, joined);
      io.to(seat.room.id).emit(SERVER_EVENTS.roster, roster(seat.room));

      if (seat.room.lifecycle() !== 'lobby') sendState(seat.room, seat.player.id, 'commit');
    });

    socket.on(CLIENT_EVENTS.beginGame, () => {
      const bound = bindings.get(socket.id);
      const room = bound && rooms.get(bound.roomId);
      if (!bound || !room) return;

      const host = room.players.find((p) => p.isHost);
      if (host?.id !== bound.playerId) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'notYourTurn',
          message: 'only the host may begin the game',
        });
        return;
      }

      // `room.dispatch`, `room.undo` and `room.begin` all THROW rather than
      // reject outside their expected lifecycle, and socket.io does not catch
      // a synchronous throw from a listener — an unguarded call here takes
      // the whole process down for every room, not just this one. These three
      // checks (here, and in `intent` and `undo` below) exist to turn that
      // crash into a clean rejection; they are not redundant with anything
      // upstream.
      if (room.lifecycle() !== 'lobby') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'wrongStage',
          message: 'the game has already begun',
        });
        return;
      }

      const delivery = room.begin(randomSeed());
      io.to(room.id).emit(SERVER_EVENTS.roster, roster(room));
      deliver(room, delivery);
    });

    socket.on(CLIENT_EVENTS.intent, (wire: WireIntent) => {
      const bound = bindings.get(socket.id);
      const room = bound && rooms.get(bound.roomId);
      if (!bound || !room) return;
      if (room.lifecycle() === 'lobby') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'wrongStage',
          message: 'the game has not begun',
        });
        return;
      }
      // `bound.playerId` — never anything the client sent. The wire type has no
      // `playerId` field for it to have sent one in.
      //
      // A missing or wholly malformed `wire` is not the hazard here — that
      // spreads as `{...undefined}`, which is `{}`, and the engine's
      // `applyIntent` rejects an object with no recognised `type` through its
      // own default branch. The hazard is a payload with a *valid* `type` and
      // a malformed field: `{ type: 'buyShares' }` with no `picks`, or
      // `{ type: 'tradeInDeadTiles', coords: 5 }`. Every such handler in
      // `engine/intents.ts` dereferences that field before validating it
      // (`.length`, a `for...of`, a spread into `Set`), which throws
      // synchronously and takes the whole process down for every room, not
      // just this one — exactly the crash `isWireIntent` exists to turn into
      // a clean rejection, same as the shape checks on `createRoom`/`joinRoom`/
      // `undo`.
      if (!isWireIntent(wire)) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'unknownIntent',
          message: 'malformed intent payload',
        });
        return;
      }
      deliver(room, room.dispatch(bound.playerId, wire));
    });

    socket.on(CLIENT_EVENTS.undo, (msg: UndoMessage) => {
      const bound = bindings.get(socket.id);
      const room = bound && rooms.get(bound.roomId);
      if (!bound || !room) return;
      if (room.lifecycle() === 'lobby') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'wrongStage',
          message: 'the game has not begun',
        });
        return;
      }
      if (typeof msg?.stepId !== 'number') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'undoOutOfSegment',
          message: 'undo requires a numeric stepId',
        });
        return;
      }
      deliver(room, room.undo(bound.playerId, msg.stepId));
    });

    socket.on('disconnect', () => {
      const bound = bindings.get(socket.id);
      bindings.delete(socket.id);
      if (!bound) return;

      const room = rooms.get(bound.roomId);
      if (!room) return;
      // Presence only, and deliberately thin: the game simply waits. Reconnect
      // handling is Phase 4's.
      if (socketsFor(room.id, bound.playerId).length === 0) {
        const player = room.players.find((p) => p.id === bound.playerId);
        if (player) player.connected = false;
        io.to(room.id).emit(SERVER_EVENTS.roster, roster(room));
      }
    });
  });

  return { app, httpServer, io, rooms };
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

// Started only when run directly, so tests can boot their own on port 0.
if (process.argv[1]?.endsWith('index.ts')) {
  const { httpServer } = createServer();
  const port = Number(process.env.PORT ?? 3001);
  httpServer.listen(port, () => console.log(`✓ Server listening on ${port}`));
}
