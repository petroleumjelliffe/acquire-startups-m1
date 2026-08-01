import { describe, it, expect } from 'vitest';
import { applyIntent, IllegalIntentError } from './intents';
import { createTestGameState, giveShares, setupGameWithStartups } from './testHelpers';
import type { GameState } from './gameTypes';

function playing(state: GameState = createTestGameState()): GameState {
  state.stage = 'play';
  state.turnIndex = 0;
  return state;
}

/** Runs `fn`, asserts it threw an IllegalIntentError, and returns the code. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(IllegalIntentError);
    return (e as IllegalIntentError).code;
  }
  throw new Error('expected applyIntent to throw, but it returned');
}

/**
 * Messla (6 tiles, row B) and ZuckFace (3 tiles, row D). C1 is adjacent to
 * B1 and D1, so placing it merges the two — Messla survives on size.
 */
function mergeFixture(): GameState {
  return playing(setupGameWithStartups([
    { id: 'Messla', tiles: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'], tier: 0 },
    { id: 'ZuckFace', tiles: ['D1', 'D2', 'D3'], tier: 1 },
  ]));
}

/**
 * Three chains all touching C1 (its only neighbours are B1, D1 and C2), laid
 * out so that no two chains touch each other:
 *   Messla   A1 A2 A3 B1   (4)   ┐ tied on size
 *   ZuckFace D1 E1 E2 E3   (4)   ┘
 *   Gobble   C2 C3         (2)   — absorbed either way
 */
function tiedMergeFixture(): GameState {
  return playing(setupGameWithStartups([
    { id: 'Messla', tiles: ['A1', 'A2', 'A3', 'B1'], tier: 0 },
    { id: 'ZuckFace', tiles: ['D1', 'E1', 'E2', 'E3'], tier: 1 },
    { id: 'Gobble', tiles: ['C2', 'C3'], tier: 2 },
  ]));
}

describe('applyIntent', () => {
  it('does not mutate the state it is given', () => {
    const state = playing();
    state.players[0].hand = ['E5'];
    const before = JSON.stringify(state);

    const next = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'E5' });

    expect(JSON.stringify(state)).toBe(before);
    expect(next).not.toBe(state);
    expect(next.board['E5'].placed).toBe(true);
  });

  it('rejects an intent from a player whose turn it is not', () => {
    const state = playing();
    state.players[1].hand = ['E5'];
    expect(codeOf(() =>
      applyIntent(state, { type: 'placeTile', playerId: state.players[1].id, coord: 'E5' }),
    )).toBe('notYourTurn');
  });

  it('rejects an intent in the wrong stage', () => {
    const state = playing();
    state.stage = 'buy';
    state.players[0].hand = ['E5'];
    expect(codeOf(() =>
      applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'E5' }),
    )).toBe('wrongStage');
  });

  it('rejects a tile that is not in hand', () => {
    const state = playing();
    state.players[0].hand = ['E5'];
    expect(codeOf(() =>
      applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'H8' }),
    )).toBe('tileNotInHand');
  });

  it('sends an isolated placement straight to buy and logs it', () => {
    const state = playing();
    state.players[0].hand = ['E5', 'A1'];

    const next = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'E5' });

    expect(next.stage).toBe('buy');
    expect(next.players[0].hand).toEqual(['A1']);
    expect(next.log.at(-1)).toMatchObject({ phase: 'Placed a tile', playerId: state.players[0].id });
  });

  it('opens the founding choice, then founds the brand and grants the free share', () => {
    const state = playing();
    state.board['E5'] = { placed: true };
    state.players[0].hand = ['E6'];

    const placed = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'E6' });
    expect(placed.stage).toBe('foundStartup');

    const founded = applyIntent(placed, {
      type: 'chooseFoundingBrand', playerId: state.players[0].id, startupId: 'Messla',
    });

    expect(founded.stage).toBe('buy');
    expect(founded.startups['Messla'].isFounded).toBe(true);
    expect(founded.players[0].portfolio['Messla']).toBe(1);
    expect(founded.startups['Messla'].availableShares).toBe(24);
    expect(founded.board['E5'].startupId).toBe('Messla');
    expect(founded.board['E6'].startupId).toBe('Messla');
  });

  it('grows an existing chain into buy, absorbing any lone tiles it reaches', () => {
    const state = playing(setupGameWithStartups([
      { id: 'Messla', tiles: ['B1', 'B2', 'B3'], tier: 0 },
    ]));
    state.board['C2'] = { placed: true }; // lone unclaimed tile
    state.players[0].hand = ['C1'];       // adjacent to B1 (Messla) and to C2

    const next = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'C1' });

    expect(next.stage).toBe('buy');
    expect(next.board['C1'].startupId).toBe('Messla');
    expect(next.board['C2'].startupId).toBe('Messla');
    expect(next.players[0].hand).toEqual([]);
  });

  it('rejects founding with a brand already on the board', () => {
    const state = setupGameWithStartups([{ id: 'Messla', tiles: 3, tier: 0 }]);
    state.stage = 'foundStartup';
    state.turnIndex = 0;
    state.pendingFoundTile = 'H8';

    expect(codeOf(() =>
      applyIntent(state, { type: 'chooseFoundingBrand', playerId: state.players[0].id, startupId: 'Messla' }),
    )).toBe('brandUnavailable');
  });

  it('pays merger bonuses on the merge transition without a payout stage', () => {
    const state = mergeFixture();
    const alex = state.players[0];
    alex.hand = ['C1'];
    alex.cash = 0;
    giveShares(state, alex.id, { ZuckFace: 3 }); // sole holder of the absorbed chain

    const next = applyIntent(state, { type: 'placeTile', playerId: alex.id, coord: 'C1' });

    expect(next.stage).toBe('mergerLiquidation');
    // ZuckFace at 3 tiles, tier 1 → price 400; sole holder → 400 × 15
    expect(next.players[0].cash).toBe(6000);
    expect(next.log.some((e) => e.phase === 'Merger payout')).toBe(true);
  });

  it('goes straight to buy after a merge nobody held shares in', () => {
    const state = mergeFixture();
    state.players[0].hand = ['C1'];

    const next = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'C1' });

    expect(next.stage).toBe('buy');
    expect(next.startups['ZuckFace'].isFounded).toBe(false);
  });

  it('asks for a survivor when the merge is tied, and rejects a non-tied pick', () => {
    const state = tiedMergeFixture();
    state.players[0].hand = ['C1'];

    const placed = applyIntent(state, { type: 'placeTile', playerId: state.players[0].id, coord: 'C1' });
    expect(placed.stage).toBe('chooseSurvivor');
    expect(placed.pendingTiedStartups).toEqual(['Messla', 'ZuckFace']);

    expect(codeOf(() =>
      applyIntent(placed, { type: 'chooseSurvivor', playerId: state.players[0].id, startupId: 'Gobble' }),
    )).toBe('notATiedSurvivor');

    const merged = applyIntent(placed, {
      type: 'chooseSurvivor', playerId: state.players[0].id, startupId: 'Messla',
    });

    expect(merged.stage).toBe('buy'); // nobody held absorbed shares
    expect(merged.startups['ZuckFace'].isFounded).toBe(false);
    expect(merged.board['D1'].startupId).toBe('Messla');
    // the non-tied smaller chain is absorbed too
    expect(merged.board['C2'].startupId).toBe('Messla');
  });

  it('rejects an unknown intent type, and every intent not yet implemented', () => {
    const state = playing();
    const me = state.players[0].id;

    expect(codeOf(() => applyIntent(state, { type: 'nope' } as never))).toBe('unknownIntent');

    expect(codeOf(() => applyIntent(state, {
      type: 'liquidate', playerId: me, startupId: 'Messla', sell: 0, trade: 0, keep: 0,
    }))).toBe('unknownIntent');
    expect(codeOf(() => applyIntent(state, { type: 'buyShares', playerId: me, picks: [] })))
      .toBe('unknownIntent');
    expect(codeOf(() => applyIntent(state, { type: 'tradeInDeadTiles', playerId: me, coords: [] })))
      .toBe('unknownIntent');
    expect(codeOf(() => applyIntent(state, { type: 'declareEnd', playerId: me })))
      .toBe('unknownIntent');
    expect(codeOf(() => applyIntent(state, { type: 'endTurn', playerId: me })))
      .toBe('unknownIntent');
  });
});
