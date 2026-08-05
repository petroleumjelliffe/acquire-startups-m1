import { describe, it, expect } from 'vitest';
import { ALL_GOLDEN_GAMES } from '../engine/golden';
import type { WireIntent } from './protocol';
import { CLIENT_EVENTS, SERVER_EVENTS, DRAWS, toWire, isWireIntent } from './protocol';

/**
 * Compile-time exhaustiveness. If `Intent` gains a member this Record stops
 * being complete and `npm run typecheck` fails — which is where the real
 * guarantee lives, since `Intent` is a type and has no runtime form to
 * enumerate.
 */
const WIRE_INTENT_TYPES: Record<WireIntent['type'], true> = {
  placeTile: true,
  chooseFoundingBrand: true,
  chooseSurvivor: true,
  liquidate: true,
  buyShares: true,
  tradeInDeadTiles: true,
  declareEnd: true,
  endTurn: true,
  startGame: true,
};

describe('WireIntent', () => {
  it('covers every intent type the golden corpus exercises', () => {
    // A real cross-check rather than a restatement: the corpus is independent
    // evidence of which intents exist, so an entry deleted from the Record
    // above fails here even though the Record still typechecks.
    // Only steps the corpus expects to succeed are evidence that an intent
    // type is real. `engine/golden/turns.ts:96` deliberately sends
    // `{ type: 'bogus' }`, cast through `unknown` because `Intent` is a closed
    // union, to prove `applyIntent`'s default branch rejects what it does not
    // recognise. That step is a negative case and must not be read as a
    // requirement on the wire.
    const exercised = [
      ...new Set(
        ALL_GOLDEN_GAMES.flatMap((g) => g.steps)
          .filter((s) => !s.expectError)
          .map((s) => s.intent.type),
      ),
    ].sort();

    // Floor is the full size of the `Intent` union, measured against the golden
    // games. If a filter regression drops any type, this floor fails rather than
    // sliding under a loose bound.
    expect(exercised.length).toBeGreaterThanOrEqual(9);
    for (const type of exercised) {
      expect(Object.keys(WIRE_INTENT_TYPES), `${type} is exercised but not on the wire`)
        .toContain(type);
    }
  });

  it('still narrows on `type`, so Omit did not collapse the union', () => {
    // With a non-distributive `Omit<Intent, 'playerId'>` this block does not
    // compile: the union collapses to its common keys and `coord` is gone.
    const wire: WireIntent = { type: 'placeTile', coord: 'E5' };
    if (wire.type !== 'placeTile') throw new Error('narrowing failed');
    expect(wire.coord).toBe('E5');
  });

  it('carries no playerId to lie in', () => {
    const wire: WireIntent = { type: 'endTurn' };
    expect(Object.keys(wire)).toEqual(['type']);
  });
});

describe('event names', () => {
  it('are distinct across directions, so a handler cannot be wired backwards', () => {
    const client = Object.values(CLIENT_EVENTS);
    const server = Object.values(SERVER_EVENTS);
    expect(new Set([...client, ...server]).size).toBe(client.length + server.length);
  });
});

describe('DRAWS is the one definition of which intents draw from the bag', () => {
  it('names exactly the three whose result a projected client cannot compute', () => {
    expect([...DRAWS].sort()).toEqual(['endTurn', 'startGame', 'tradeInDeadTiles']);
  });

  it('holds only real intent types', () => {
    // `Set<WireIntent['type']>` is checked at compile time; this is the
    // runtime half — a typo in a string literal is otherwise invisible.
    const types = new Set(ALL_GOLDEN_GAMES.flatMap((g) => g.steps.map((s) => s.intent.type)));
    for (const draw of DRAWS) expect(types.has(draw)).toBe(true);
  });
});

describe('toWire strips identity without collapsing the union', () => {
  it('drops playerId and keeps the variant fields', () => {
    expect(toWire({ type: 'placeTile', playerId: 'p1', coord: 'E6' }))
      .toEqual({ type: 'placeTile', coord: 'E6' });
    expect(toWire({ type: 'buyShares', playerId: 'p2', picks: ['Messla'] }))
      .toEqual({ type: 'buyShares', picks: ['Messla'] });
  });

  it('produces something the server will accept as a wire intent', () => {
    expect(isWireIntent(toWire({ type: 'placeTile', playerId: 'p1', coord: 'E6' }))).toBe(true);
  });
});
