// server/index.ts
// Transport only. The room decides what happened; this file decides who hears
// about it, and is the single place `project` is ever called.

import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { project } from './projection.js';
import { createRoomRegistry, type RoomRegistry, type Seat } from './rooms.js';
import { createFileStore, createNullStore, SAVE_VERSION, type RoomStore } from './store.js';
import { registerDevSeed } from './devSeed.js';
import type { Delivery, GameRoom } from './room.js';
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  SERVER_EVENTS,
  type CreateRoomMessage,
  type JoinRoomMessage,
  type JoinedMessage,
  type RenamePlayerMessage,
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

export interface ServerOptions {
  /** Defaults to the null store, so every test that boots a bare server keeps working. */
  store?: RoomStore;
}

export function createServer(options: ServerOptions = {}): ServerHandle {
  const app = express();
  app.use(cors());
  /**
   * Alive, and what it speaks.
   *
   * The versions are here because a handshake that fails cannot report why:
   * a client refused with `versionMismatch` knows only its own number. This
   * endpoint needs no version of its own to answer, so it stays reachable in
   * exactly the situation you are trying to diagnose — and it makes "what is
   * deployed" one curl rather than a trip to the hosting dashboard, which is
   * what it took on 2026-08-07.
   */
  app.get('/health', (_req, res) => {
    res.json({ ok: true, protocolVersion: PROTOCOL_VERSION, saveVersion: SAVE_VERSION });
  });

  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: '*' } });
  const rooms = createRoomRegistry(options.store ?? createNullStore());
  const bindings = new Map<string, Binding>();

  // Dev only, and absent rather than guarded — see `devSeed.ts`. This is the
  // only way to put a browser into a mid-game room, which is what the
  // two-browser merger pass has been waiting on.
  if (process.env.NODE_ENV !== 'production') registerDevSeed(app, rooms);

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
    // board, cash and log, which is the leak this rule exists to prevent.
    // They get the committed state: it is what they already had, which is what
    // "reset" should mean for them.
    //
    // `resume` rides the same rule, and that is the point of it being a
    // separate reason: a reconnecting actor is by definition the player the
    // game is waiting on, so they get their own open draft back, and every
    // other reconnecting player gets the committed state — the same privacy
    // boundary, applied to a new arrival rather than a rejection.
    const ownsDraft = reason !== 'commit' && playerId === room.actorId();
    const source = ownsDraft ? room.draft() : room.committed();
    const message: StateMessage = {
      state: project(source, playerId),
      reason,
      segmentStart: room.segmentStart(),
      previousSegmentStart: room.previousSegmentStart(),
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

    /**
     * Whether this client speaks our protocol, answering the socket if not.
     *
     * Equality, not "at least": the client ships to GitHub Pages and the
     * server to Render, independently, so the client can perfectly well be
     * the *newer* side. A `>=` check here would wave that case through and
     * then fail somewhere deep in a handler, presenting as a game bug.
     *
     * Absent is a mismatch. Clients built before this existed send nothing,
     * and they are precisely what this is for.
     */
    function speaksOurProtocol(version: unknown): boolean {
      if (version === PROTOCOL_VERSION) return true;
      socket.emit(SERVER_EVENTS.rejected, {
        code: 'versionMismatch',
        message:
          `This client speaks protocol ${String(version)}; this server speaks ${PROTOCOL_VERSION}`,
      });
      return false;
    }

    socket.on(CLIENT_EVENTS.createRoom, (msg: CreateRoomMessage) => {
      // Before the shape check below, and before anything is created: a
      // client we cannot talk to must not leave a room behind, because an
      // abandoned room is persisted and restored at the next boot.
      if (!speaksOurProtocol(msg?.protocolVersion)) return;

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
      // Before the room lookup, so a stale client is told it is stale rather
      // than told the room does not exist — which would send the player
      // hunting for a room that is perfectly fine.
      if (!speaksOurProtocol(msg?.protocolVersion)) return;

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

      const target = rooms.get(msg.roomId);
      if (!target) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'noSuchRoom',
          message: `Room ${msg.roomId} is no longer available`,
        });
        return;
      }

      // One socket holds one seat per room.
      //
      // A `joinRoom` with no `playerId`/`token` seats a *new* player — that is
      // what makes a first join work, and it is why a second one from the same
      // socket used to seat a second. Found by hand: two browsers produced a
      // three-player roster, and the orphaned seat is one the game waits on
      // forever when its turn comes, because nobody is behind it.
      //
      // A client cannot reliably prevent this on its own. It has no token to
      // present until its own `joined` reply lands, so a socket blip during
      // that window leaves it re-joining as a stranger with no way to say who
      // it already is. The binding this server already keeps is the answer:
      // if this socket is bound to a seat in the room it is asking to join,
      // that seat is the answer to the request.
      let seat: Seat | null = null;
      const bound = bindings.get(socket.id);
      if (bound && bound.roomId === msg.roomId) {
        const player = target.players.find((p) => p.id === bound.playerId);
        if (player) seat = { room: target, player };
      }

      seat ??= rooms.join(msg.roomId, msg.name, msg.playerId, msg.token);

      if (!seat) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'seatRefused',
          message: `That seat in ${msg.roomId} is no longer yours — join again to take a new one`,
        });
        return;
      }

      seat.player.connected = true;

      bindings.set(socket.id, { roomId: seat.room.id, playerId: seat.player.id });
      void socket.join(seat.room.id);

      const joined: JoinedMessage = {
        roomId: seat.room.id,
        playerId: seat.player.id,
        token: seat.player.token,
      };
      socket.emit(SERVER_EVENTS.joined, joined);
      io.to(seat.room.id).emit(SERVER_EVENTS.roster, roster(seat.room));

      // `resume`, not `commit`: this socket may belong to the player the game
      // is waiting on, mid-segment, with work the server still holds.
      if (seat.room.lifecycle() !== 'lobby') sendState(seat.room, seat.player.id, 'resume');
    });

    socket.on(CLIENT_EVENTS.renamePlayer, (msg: RenamePlayerMessage) => {
      const bound = bindings.get(socket.id);
      const room = bound && rooms.get(bound.roomId);
      if (!bound || !room) {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'notConnected',
          message: 'No seat to rename — join a room first',
        });
        return;
      }
      // Lobby-only: the engine copies names into `GameState` at startGame,
      // and a rename after that leaves the roster and the log disagreeing
      // about who did what.
      if (room.lifecycle() !== 'lobby') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'wrongStage',
          message: 'Names are settled once the game starts',
        });
        return;
      }
      const name = typeof msg?.name === 'string' ? msg.name.trim() : '';
      if (name === '') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'unknownIntent',
          message: 'renamePlayer requires a name',
        });
        return;
      }

      // The binding names the seat; the payload cannot rename anyone else.
      const player = room.players.find((p) => p.id === bound.playerId);
      if (!player) return;
      player.name = name;
      io.to(room.id).emit(SERVER_EVENTS.roster, roster(room));
    });

    socket.on(CLIENT_EVENTS.leaveSeat, () => {
      const bound = bindings.get(socket.id);
      const room = bound && rooms.get(bound.roomId);
      if (!bound || !room) return;
      // Mid-game leaving is a disconnect, which keeps the seat and marks it
      // away — the game waits. Only a lobby seat can be given up.
      if (room.lifecycle() !== 'lobby') {
        socket.emit(SERVER_EVENTS.rejected, {
          code: 'wrongStage',
          message: 'A started game keeps its seats — closing the tab is enough',
        });
        return;
      }

      const at = room.players.findIndex((p) => p.id === bound.playerId);
      if (at === -1) return;
      const wasHost = room.players[at].isHost;
      room.players.splice(at, 1);
      // A lobby with no host is a lobby nobody can ever start.
      if (wasHost && room.players.length > 0) room.players[0].isHost = true;

      bindings.delete(socket.id);
      void socket.leave(room.id);
      io.to(room.id).emit(SERVER_EVENTS.roster, roster(room));
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
  const store = createFileStore(join(process.cwd(), 'server', 'games'));
  const { httpServer, rooms } = createServer({ store });
  const port = Number(process.env.PORT ?? 3001);

  // Before `listen`, not after: a client that connects into a half-restored
  // registry would be told its room does not exist and would clear the very
  // identity that was about to work.
  //
  // `listen` runs whichever way `restore()` settles — inside `.then` on
  // success, inside `.catch` on rejection — so a restore failure can never
  // keep the process from booting. `restore()` already guards each *record*
  // (see `rooms.ts`), but the store read underneath it (`loadAll`, or a
  // future store implementation) is not guarded the same way, and an
  // ungated `.then` here would mean the one unhandled rejection of a boot
  // takes the whole server down with no `listen` and no log line.
  void rooms.restore()
    .then((count) => {
      if (count > 0) console.log(`✓ Restored ${count} room(s)`);
    })
    .catch((e: unknown) => {
      console.warn('! Restore failed, starting with no rooms:', e);
    })
    .finally(() => {
      httpServer.listen(port, () => console.log(`✓ Server listening on ${port}`));
    });
}
