// server/store.ts
// Where a room lives between processes.
//
// Storage mechanics only. How old a record may be before it is worthless, and
// what a restored room means, are the registry's business — this file will
// hand back anything it can parse.
//
// The interface exists so the file implementation can be swapped for one that
// survives a host with an ephemeral filesystem (Render's free tier resets its
// disk on every restart — see DEPLOYMENT.md). Deliberately one implementation:
// a second, speculative backend would be a guess about a decision nobody has
// made yet.

import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameState } from '../engine/gameTypes.js';
import type { RoomPlayer } from './room.js';

/**
 * Bumped to 4 for Phase 4: a record now carries the roster and its rejoin
 * tokens, which version 3 did not. Version 3's own header said why that
 * mattered — a game restored without them is one nobody can rejoin — so a
 * version-3 file is not upgradable, only discardable.
 */
export const SAVE_VERSION = 4;

export interface SavedRoom {
  roomId: string;
  version: number;
  /** Epoch ms. The registry's eviction policy reads this; the store does not. */
  savedAt: number;
  /** Including `token`, which is the whole reason a restored room is rejoinable. */
  players: RoomPlayer[];
  /** Committed only. A draft is never written — it was never real. */
  state: GameState;
}

export interface RoomStore {
  save(record: SavedRoom): Promise<void>;
  loadAll(): Promise<SavedRoom[]>;
  remove(roomId: string): Promise<void>;
}

function isRoomPlayer(value: unknown): value is RoomPlayer {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.token === 'string' &&
    typeof p.isHost === 'boolean' &&
    typeof p.connected === 'boolean'
  );
}

/**
 * Field-level, and deliberately not deeper.
 *
 * A file on disk is text that has outlived whatever wrote it, so the shape is
 * checked before anything dereferences it. The `state` is trusted past
 * "is an object": it came from this server's own engine, and re-validating a
 * whole `GameState` here would be a second copy of the engine's types that
 * could drift from the first.
 */
function isSavedRoom(value: unknown): value is SavedRoom {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.roomId === 'string' &&
    r.version === SAVE_VERSION &&
    typeof r.savedAt === 'number' &&
    Array.isArray(r.players) &&
    r.players.every(isRoomPlayer) &&
    typeof r.state === 'object' &&
    r.state !== null
  );
}

/**
 * Process-wide, not per-store: two `createFileStore` instances in one process
 * (as tests build repeatedly) must still never hand out the same temp name.
 * Paired with `process.pid` so two *processes* sharing a directory — the
 * ordinary case for a redeploy overlapping the process it replaces — can't
 * collide either.
 */
let tempSeq = 0;

export function createFileStore(dir: string): RoomStore {
  /**
   * One promise per room, so two commits landing in the same tick queue
   * rather than race. `deliver` calls `persist` fire-and-forget on every
   * commit, so "two writes in flight for one room" is the ordinary case, not
   * an edge one — and the loser of that race is the *newer* state.
   *
   * This chain is what makes the two writes apply in order at all — but
   * order alone isn't enough to make the *outcome* right; see the temp-name
   * comment below for the other half of that.
   */
  const chains = new Map<string, Promise<void>>();

  async function writeRecord(record: SavedRoom): Promise<void> {
    const target = join(dir, `${record.roomId}.json`);
    // `.tmp` then rename: `rename` is atomic on POSIX, so a crash mid-write
    // leaves either the old record or the new one, never half of either.
    // Truncated JSON is exactly what a restart-recovery feature must not
    // produce for itself.
    //
    // The name is unique per *write*, not per room: a temp file is private
    // staging, and two writes for the same room sharing one temp name is a
    // second collision hazard on top of the ordering the promise chain
    // above already guards. Without this, two same-room writes racing past
    // the chain (a bug in the chain, a future caller that bypasses `save`,
    // a save issued before the chain existed) can still destroy each
    // other: the second write's `writeFile` overwrites the first's
    // in-flight temp file before the first has renamed it away, so the
    // first's later `rename` either moves the *second* write's content
    // under the first's stale promise, or — if the first renames first —
    // throws ENOENT once the temp file it expected is already gone. Either
    // way the two writes are no longer independent once they share a
    // filename, which defeats the point of the chain queuing them at all.
    // A unique name means the two are ordered *and* isolated: whichever
    // `rename` runs last is simply the one that wins, which is exactly
    // what "last write wins" is supposed to mean.
    const temp = `${target}.${process.pid}.${tempSeq++}.tmp`;
    try {
      // `recursive: true` makes this idempotent, so there is no boot-time
      // setup step left to forget.
      await mkdir(dir, { recursive: true });
      await writeFile(temp, JSON.stringify(record), 'utf-8');
      await rename(temp, target);
    } catch (e) {
      console.error(`✗ Could not save room ${record.roomId}:`, e);
    }
  }

  return {
    save(record) {
      const queued = (chains.get(record.roomId) ?? Promise.resolve())
        .then(() => writeRecord(record));
      chains.set(record.roomId, queued);
      return queued;
    },

    async loadAll() {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        // No directory yet is the ordinary first-boot case, not a fault.
        return [];
      }

      // `!`, not `✗`: vitest prints `✗` for a failed test, and a boot log
      // carrying the same glyph reads as a test failure to anyone skimming
      // it — the exact confusion an earlier commit already fixed once, for
      // the test run itself. This is that same objection, moved to the boot
      // log rather than answered there.
      const out: SavedRoom[] = [];
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        try {
          const parsed: unknown = JSON.parse(await readFile(join(dir, name), 'utf-8'));
          if (isSavedRoom(parsed)) out.push(parsed);
          else console.warn(`! Ignoring unreadable save ${name}`);
        } catch {
          console.warn(`! Ignoring unreadable save ${name}`);
        }
      }
      return out;
    },

    async remove(roomId) {
      try {
        await unlink(join(dir, `${roomId}.json`));
      } catch {
        // Already gone is the outcome asked for.
      }
    },
  };
}

/**
 * Holds nothing, forgets everything, never fails.
 *
 * The registry's default, so every existing caller of `createRoomRegistry()`
 * — and every test that does not care about durability — keeps working
 * without a store to hand it.
 */
export function createNullStore(): RoomStore {
  return {
    save: async () => {},
    loadAll: async () => [],
    remove: async () => {},
  };
}
