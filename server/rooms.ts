import { randomUUID } from 'node:crypto';
import type { GameState } from '../engine/gameTypes.js';
import { createGameRoom, type GameRoom, type RoomPlayer } from './room.js';
import { createNullStore, SAVE_VERSION, type RoomStore, type SavedRoom } from './store.js';
import { PROTOCOL_VERSION } from '../session/protocol.js';

export interface Seat {
  room: GameRoom;
  player: RoomPlayer;
}

export interface RoomRegistry {
  create(hostName: string): Seat;
  join(roomId: string, name: string, playerId?: string, token?: string): Seat | null;
  get(roomId: string): GameRoom | undefined;
  /** Seats a prepared state directly. Tests use this; no socket event reaches it. */
  fromState(roomId: string, names: string[], state: GameState): GameRoom;
  all(): GameRoom[];
  persist(room: GameRoom): Promise<void>;
  /**
   * Seats every saved room this store still holds. Returns how many.
   *
   * `now` is injectable so the age policy can be tested without waiting a
   * week; the server never passes it.
   *
   * Boot-only. `rooms.set` here is unconditional — it replaces whatever is
   * already in the registry for a given id with no check that nothing is
   * live there — which is safe only because the one production caller
   * (`server/index.ts`) runs this before `listen`, while no socket has
   * bound to anything yet. Calling it once the server is serving traffic
   * would silently swap out a room's object out from under socket bindings
   * that still point at the old one.
   */
  restore(now?: number): Promise<number>;
}

/**
 * How long a saved room is worth reviving.
 *
 * Long enough that a game abandoned over a weekend is still there on Monday;
 * short enough that the directory does not grow without bound and `restore`
 * does not delay `listen` behind a boot-time read of every game ever played.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function seatPlayer(seat: number, name: string): RoomPlayer {
  return {
    id: `p${seat + 1}`,
    name,
    token: randomUUID(),
    isHost: seat === 0,
    connected: true,
  };
}

/** Six characters, unambiguous: no O/0 or I/1 to read out loud incorrectly. */
function roomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createRoomRegistry(store: RoomStore = createNullStore()): RoomRegistry {
  const rooms = new Map<string, GameRoom>();

  return {
    create(hostName) {
      // Six random characters collide rarely, but "rarely" over a Map holding
      // live games means silently orphaning one — every socket bound to the
      // overwritten room stops resolving through `get()`, with no error raised
      // anywhere. Retry rather than trust the odds.
      let id = roomCode();
      while (rooms.has(id)) id = roomCode();

      const host = seatPlayer(0, hostName);
      const room = createGameRoom(id, [host]);
      rooms.set(id, room);
      return { room, player: host };
    },

    join(roomId, name, playerId, token) {
      const room = rooms.get(roomId);
      if (!room) return null;

      if (playerId) {
        const existing = room.players.find((p) => p.id === playerId);
        // A rejoin must prove itself. Without this, presenting someone else's
        // id would bind their seat to your socket and project their hand to
        // you — which is the whole guarantee projection exists to provide.
        if (!existing || existing.token !== token) return null;
        existing.connected = true;
        return { room, player: existing };
      }

      if (room.lifecycle() !== 'lobby') return null;
      const player = seatPlayer(room.players.length, name);
      room.players.push(player);
      return { room, player };
    },

    get: (roomId) => rooms.get(roomId),

    fromState(roomId, names, state) {
      const players = names.map((name, i) => seatPlayer(i, name));
      const room = createGameRoom(roomId, players, state);
      rooms.set(roomId, room);
      return room;
    },

    all: () => [...rooms.values()],

    async persist(room) {
      // `committed()` throws before a game begins, so the lifecycle check is
      // load-bearing rather than an optimisation. Drafts are never written:
      // uncommitted work was never real, which is the segment model stated as
      // a storage fact.
      if (room.lifecycle() === 'lobby') return;
      const record: SavedRoom = {
        roomId: room.id,
        version: SAVE_VERSION,
        // The wire this state was written by. A room now outlives a deploy,
        // so a record from an older server is the same skew a stale socket
        // brings, arriving from storage — `restore` checks it below.
        protocolVersion: PROTOCOL_VERSION,
        savedAt: Date.now(),
        // Copied, not referenced: `connected` mutates under a live socket and
        // a record is a snapshot. The value written is irrelevant — `restore`
        // forces every seat disconnected — but a record that keeps changing
        // after it was handed over is a trap for the next reader.
        players: room.players.map((p) => ({ ...p })),
        state: room.committed(),
        // So a client resuming a restored room still sees the previous turn
        // in its step stack, rather than a blank until the next commit.
        previousSegmentStart: room.previousSegmentStart(),
      };
      await store.save(record);
    },

    async restore(now = Date.now()) {
      // `loadAll` only ever looks at `*.json`, so a `.tmp` file orphaned by a
      // crash between `writeFile` and `rename` (see the temp-name comment in
      // `store.ts`) is invisible here — it is not read, not restored, and not
      // cleaned up. That is a leftover file on disk, not a restore bug; if it
      // ever needs reclaiming, boot is the natural place, but no sweep exists
      // yet and this task does not add one.
      const { records: saved, unreadable } = await store.loadAll();

      // The decision Phase 4 deferred, made here where policy lives: a file
      // that cannot be parsed is quarantined — renamed aside, kept for a
      // human — rather than deleted, and rather than warning at every boot
      // forever, which is what 23 stale files were doing.
      for (const name of unreadable) {
        console.warn(`! Quarantining unreadable save ${name} as ${name}.bad`);
        await store.quarantine(name);
      }

      let seated = 0;

      for (const record of saved) {
        if (now - record.savedAt > MAX_AGE_MS) {
          await store.remove(record.roomId);
          continue;
        }

        // A record written by a different wire is the same skew a stale
        // socket brings, arriving from storage. Skipped rather than deleted:
        // the file is not damaged, merely untrusted, and eviction will clear
        // it by age if no matching server ever comes back for it.
        if (record.protocolVersion !== PROTOCOL_VERSION) {
          console.warn(
            `! Not restoring ${record.roomId}: written by protocol ` +
              `${record.protocolVersion}, this server speaks ${PROTOCOL_VERSION}`,
          );
          continue;
        }

        try {
          // Never `connected: true`, whatever the record says. A record is a
          // snapshot of a moment when sockets were open; this process has
          // none. The roster broadcast that follows each rejoin is what turns
          // these back on, one seat at a time.
          const players = record.players.map((p) => ({ ...p, connected: false }));
          rooms.set(
            record.roomId,
            createGameRoom(record.roomId, players, record.state, record.previousSegmentStart),
          );
          seated++;
        } catch (e) {
          // `isSavedRoom` only checks that `state` is *an object* — it trusts
          // the shape past that, on the theory that it came from this
          // server's own engine. A record that parses and passes that guard
          // but carries a `state` the engine cannot actually drive (a stale
          // shape from before the next `GameState` change, disk corruption
          // that survived JSON.parse) throws inside `createGameRoom`. One bad
          // record must cost one room, not the boot: this matches `loadAll`'s
          // own posture of warning and skipping rather than letting a single
          // rotten file take the rest down with it.
          console.warn(`! Could not restore room ${record.roomId}, skipping:`, e);
        }
      }

      return seated;
    },
  };
}
