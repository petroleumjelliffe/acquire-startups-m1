import { describe, it, expect, vi } from 'vitest';
import { buildFixture } from '../engine/golden/fixtures.js';
import { createRoomRegistry } from './rooms.js';

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
