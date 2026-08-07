import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFixture } from '../engine/golden/fixtures.js';
import { createFileStore, createNullStore, SAVE_VERSION, type SavedRoom } from './store.js';
import type { RoomPlayer } from './room.js';

// `spy: true` auto-mocks every export but calls through to the real
// implementation by default, which is what makes it safe for the other
// tests in this file: only the one test below overrides `rename`.
// `vi.spyOn` cannot do this in-place — a Node ESM built-in's module
// namespace is non-configurable, so redefining one of its properties at
// runtime throws. `vi.mock` works because it rewrites the import at the
// module-loader level instead.
vi.mock('node:fs/promises', { spy: true });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acquire-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function players(): RoomPlayer[] {
  return [
    { id: 'p1', name: 'Alex', token: 'tok-1', isHost: true, connected: true },
    { id: 'p2', name: 'Sam', token: 'tok-2', isHost: false, connected: false },
  ];
}

function record(overrides: Partial<SavedRoom> = {}): SavedRoom {
  return {
    roomId: 'ABC123',
    version: SAVE_VERSION,
    savedAt: 1_000,
    players: players(),
    state: buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['A1'] },
      ],
      loners: ['E5'],
      bag: [],
    }),
    ...overrides,
  };
}

describe('the file store', () => {
  it('round-trips a record, tokens and all', async () => {
    const store = createFileStore(dir);
    const saved = record();

    await store.save(saved);
    const loaded = await store.loadAll();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].roomId).toBe('ABC123');
    // The whole point of version 4: a restored room is one people can rejoin.
    expect(loaded[0].players.map((p) => p.token)).toEqual(['tok-1', 'tok-2']);
    expect(loaded[0].state.board).toEqual(saved.state.board);
  });

  it('ignores a record from an older save version rather than coercing it', async () => {
    await writeFile(
      join(dir, 'OLD123.json'),
      JSON.stringify({ ...record({ roomId: 'OLD123' }), version: SAVE_VERSION - 1 }),
      'utf-8',
    );

    expect(await createFileStore(dir).loadAll()).toEqual([]);
  });

  it('ignores a file that is not a record at all', async () => {
    await writeFile(join(dir, 'JUNK01.json'), '{ this is not json', 'utf-8');
    await writeFile(join(dir, 'HALF02.json'), JSON.stringify({ roomId: 'HALF02' }), 'utf-8');

    expect(await createFileStore(dir).loadAll()).toEqual([]);
  });

  it('is empty, not broken, when the directory does not exist yet', async () => {
    expect(await createFileStore(join(dir, 'not-created')).loadAll()).toEqual([]);
  });

  it('removes a record', async () => {
    const store = createFileStore(dir);
    await store.save(record());

    await store.remove('ABC123');

    expect(await store.loadAll()).toEqual([]);
  });

  it('leaves no partial file behind — every write lands whole, under a final name', async () => {
    const store = createFileStore(dir);
    await store.save(record());

    // A temp file left in place would be picked up by a later `loadAll` glob,
    // or worse, read half-written. Nothing but the final name may survive.
    expect(await readdir(dir)).toEqual(['ABC123.json']);
  });
});

describe('two saves for the same room, in flight at once', () => {
  it('lands the second one last even when the first write is slower', async () => {
    // Without a per-room promise chain, these two writes race: the first
    // one's `rename` is delayed past the second's, so the *older* record is
    // what survives on disk. Serialising them is what makes last-call-wins
    // true rather than lucky. The delay makes the race deterministic instead
    // of relying on scheduling.
    const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const fsp = await import('node:fs/promises');
    let first = true;
    vi.mocked(fsp.rename).mockImplementation(async (from, to) => {
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 30));
      }
      return real.rename(from, to);
    });

    const store = createFileStore(dir);
    const a = store.save(record({ savedAt: 1 }));
    const b = store.save(record({ savedAt: 2 }));
    await Promise.all([a, b]);

    const loaded = await store.loadAll();
    expect(loaded[0].savedAt).toBe(2);
  });
});

describe('the null store', () => {
  it('accepts saves and holds nothing, so a registry with no store still runs', async () => {
    const store = createNullStore();
    await store.save(record());
    await store.remove('ABC123');
    expect(await store.loadAll()).toEqual([]);
  });
});
