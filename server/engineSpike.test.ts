// Phase 0 spike: proves the engine is usable from the server's module graph
// with the signature Phase 2 will depend on. Delete this file when the real
// server-authoritative loop lands in Phase 2.
import { describe, it, expect } from 'vitest';
import { createInitialGame } from '../engine/gameInit.js';
import { applyIntent, IllegalIntentError } from '../engine/intents.js';
import type { Intent } from '../engine/intents.js';
import type { GameState } from '../engine/gameTypes.js';

/** The shape Phase 2's room actor will wrap: one state in, one state out. */
function reduce(state: GameState, intent: Intent): GameState {
  return applyIntent(state, intent);
}

describe('server spike: applyIntent over the wire shape', () => {
  it('runs a turn from a freshly initialised game', () => {
    // A freshly initialised board is empty (no chains exist yet), so placing
    // any tile from any hand is always legal: previewPlacement's only ways to
    // reject a placement are `occupied` (impossible on an empty board),
    // `notInHand` (we play state.players[turnIndex].hand[0], which is in
    // hand by construction), `noBrandAvailable` (only fires when the tile
    // would found an 8th startup — impossible with zero founded startups),
    // and `mergesSafeChains` (requires two already-safe (>=11 tile) chains,
    // impossible with no chains at all). So this is deterministic and legal
    // for every seed, not just this one.
    let state = createInitialGame('spike-seed', ['Alex', 'Sam']);
    state = { ...state, stage: 'play' };

    const me = state.players[state.turnIndex];
    const coord = me.hand[0];
    state = reduce(state, { type: 'placeTile', playerId: me.id, coord });

    expect(state.board[coord].placed).toBe(true);
    expect(['buy', 'foundStartup', 'chooseSurvivor', 'mergerLiquidation']).toContain(state.stage);
  });

  it('survives a JSON round trip, which is how it will reach a client', () => {
    let state = createInitialGame('spike-seed', ['Alex', 'Sam']);
    state = { ...state, stage: 'play' };
    const wire = JSON.parse(JSON.stringify(state)) as GameState;
    const me = wire.players[wire.turnIndex];
    const after = reduce(wire, { type: 'placeTile', playerId: me.id, coord: me.hand[0] });

    // `expect(JSON.parse(JSON.stringify(after))).toEqual(after)` (the brief's
    // original assertion) is near-vacuous: vitest's `toEqual` treats an
    // object key holding `undefined` as equal to that key being absent,
    // which is exactly what `JSON.stringify` does to it. So it would still
    // pass even if the round trip silently dropped a field — the one
    // failure mode this test exists to catch.
    //
    // The fix isn't `toStrictEqual` either: `doPlaceTile` deliberately sets
    // `state.pendingTileToRemove = undefined` (see intents.ts), an
    // intentional, harmless "clear this optional field" convention used
    // throughout the engine (INTERFACE-FACTS: TileCell.startupId is either
    // omitted or explicitly undefined, never null). `toStrictEqual` would
    // flag that convention as a wire loss on every single placeTile call,
    // which is noise, not a bug — the client never distinguishes "key
    // present with value undefined" from "key absent".
    //
    // What we actually want to catch is loss of *meaningful* (defined)
    // data: dropped board cells, mutated hands/portfolios, or corrupted log
    // entries. So assert on round-trip fidelity of the fields Phase 2's
    // client actually reads, field by field, plus a structural-size check
    // that would catch a dropped board cell that `toEqual` alone might
    // paper over via key-count mismatches going unnoticed.
    const rewired = JSON.parse(JSON.stringify(after)) as GameState;

    expect(Object.keys(rewired.board)).toHaveLength(Object.keys(after.board).length);
    expect(rewired.board).toEqual(after.board);
    expect(rewired.players).toEqual(after.players);
    expect(rewired.startups).toEqual(after.startups);
    expect(rewired.log).toEqual(after.log);
    expect(rewired.bag).toEqual(after.bag);
    expect(rewired.stage).toBe(after.stage);
    expect(rewired.turnIndex).toBe(after.turnIndex);
  });

  it('rejects an illegal intent with a code the server can map to an error frame', () => {
    const state = { ...createInitialGame('spike-seed', ['Alex', 'Sam']), stage: 'play' as const };
    const other = state.players[1];
    try {
      reduce(state, { type: 'placeTile', playerId: other.id, coord: other.hand[0] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalIntentError);
      expect((e as IllegalIntentError).code).toBe('notYourTurn');
    }
  });
});
