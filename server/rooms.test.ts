import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildFixture } from '../engine/golden/fixtures.js';
import { createRoomRegistry, MAX_AGE_MS } from './rooms.js';
import { createFileStore, SAVE_VERSION, type SavedRoom } from './store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture() {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6'] },
      { name: 'Sam', cash: 6000, hand: ['A1'] },
    ],
    loners: ['E5'],
    bag: [],
  });
}

describe('the registry', () => {
  it('creates a room with the host seated first', () => {
    const rooms = createRoomRegistry();
    const { room, player } = rooms.create('Alex');

    expect(player.id).toBe('p1');
    expect(player.isHost).toBe(true);
    expect(player.token).toEqual(expect.any(String));
    expect(rooms.get(room.id)).toBe(room);
  });

  it('seats joiners in order and issues each a distinct token', () => {
    const rooms = createRoomRegistry();
    const { room } = rooms.create('Alex');

    const sam = rooms.join(room.id, 'Sam');
    const jordan = rooms.join(room.id, 'Jordan');

    expect(sam?.player.id).toBe('p2');
    expect(jordan?.player.id).toBe('p3');
    expect(sam!.player.token).not.toBe(jordan!.player.token);
    expect(sam!.player.isHost).toBe(false);
  });

  it('returns the existing seat when a known player rejoins with their token', () => {
    const rooms = createRoomRegistry();
    const { room } = rooms.create('Alex');
    const first = rooms.join(room.id, 'Sam')!;

    const again = rooms.join(room.id, 'Sam', first.player.id, first.player.token);

    expect(again?.player.id).toBe('p2');
    expect(room.players).toHaveLength(2);
  });

  it('refuses a rejoin presenting the wrong token', () => {
    const rooms = createRoomRegistry();
    const { room } = rooms.create('Alex');
    const first = rooms.join(room.id, 'Sam')!;

    expect(rooms.join(room.id, 'Sam', first.player.id, 'not-the-token')).toBeNull();
    expect(room.players).toHaveLength(2);
  });

  it('is null for a room that does not exist', () => {
    const rooms = createRoomRegistry();
    expect(rooms.get('nope')).toBeUndefined();
    expect(rooms.join('nope', 'Sam')).toBeNull();
  });

  it('retries the room code on a collision instead of overwriting the live room', () => {
    const rooms = createRoomRegistry();

    // Force `roomCode()` to draw the same six characters for the first room
    // and for the first attempt on the second room, then a different six
    // characters on the retry. If `create` does not check for a collision,
    // it stops after the first draw, `rooms.set` clobbers the first room's
    // Map entry, and both assertions below fail.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = rooms.create('Alex');

    let calls = 0;
    random.mockImplementation(() => (calls++ < 6 ? 0 : 0.5));
    const second = rooms.create('Sam');

    random.mockRestore();

    expect(second.room.id).not.toBe(first.room.id);
    expect(rooms.get(first.room.id)).toBe(first.room);
  });

  it('seats a prepared state without going through the lobby', () => {
    const rooms = createRoomRegistry();
    const room = rooms.fromState('golden-1', ['Alex', 'Sam'], fixture());

    expect(room.lifecycle()).toBe('playing');
    expect(room.actorId()).toBe('p1');
    expect(room.players.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('restoring rooms at boot', () => {
  let dir: string;

  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'acquire-restore-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  /** Saves a room through a live registry, exactly as a commit would. */
  async function seedSavedRoom(roomId: string): Promise<SavedRoom> {
    const store = createFileStore(dir);
    const rooms = createRoomRegistry(store);
    const room = rooms.fromState(roomId, ['Alex', 'Sam'], fixture());
    await rooms.persist(room);
    const [saved] = await store.loadAll();
    return saved;
  }

  it('seats a saved room again, with its tokens intact', async () => {
    const saved = await seedSavedRoom('ABC123');

    const rooms = createRoomRegistry(createFileStore(dir));
    const count = await rooms.restore();

    expect(count).toBe(1);
    const room = rooms.get('ABC123');
    expect(room).toBeDefined();
    expect(room!.lifecycle()).toBe('playing');
    // The rejoin material survived the process, which is the whole feature.
    const token = saved.players[1].token;
    expect(rooms.join('ABC123', 'Sam', 'p2', token)?.player.id).toBe('p2');
  });

  it('brings every restored seat back disconnected', async () => {
    await seedSavedRoom('ABC123');

    const rooms = createRoomRegistry(createFileStore(dir));
    await rooms.restore();

    // Presence is a fact about live sockets. Nothing is connected to a
    // process that has only just started.
    expect(rooms.get('ABC123')!.players.every((p) => !p.connected)).toBe(true);
  });

  it('restores a finished game as over, not as still playing', async () => {
    const store = createFileStore(dir);
    const rooms = createRoomRegistry(store);
    const room = rooms.fromState('END123', ['Alex', 'Sam'], { ...fixture(), stage: 'end' });
    await rooms.persist(room);

    const revived = createRoomRegistry(createFileStore(dir));
    await revived.restore();

    // `createGameRoom` used to derive lifecycle as `initial ? 'playing' :
    // 'lobby'`, which would bring a finished game back as one still waiting
    // for a move nobody can make.
    expect(revived.get('END123')!.lifecycle()).toBe('over');
  });

  it('drops and deletes a record older than the age limit', async () => {
    await seedSavedRoom('OLD123');
    const store = createFileStore(dir);

    const rooms = createRoomRegistry(store);
    const count = await rooms.restore(Date.now() + MAX_AGE_MS + 1);

    expect(count).toBe(0);
    expect(rooms.get('OLD123')).toBeUndefined();
    // Deleted, not merely skipped — otherwise the directory grows forever
    // and every boot re-reads records it will never use.
    expect(await store.loadAll()).toEqual([]);
  });

  it('is zero, not a crash, with nothing saved', async () => {
    const rooms = createRoomRegistry(createFileStore(dir));
    expect(await rooms.restore()).toBe(0);
  });
});
