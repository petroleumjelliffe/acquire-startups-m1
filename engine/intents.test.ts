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
    // The merge path mutates startups, portfolio, cash and mergerContext — the
    // isolated-placement test above touches none of those, so this is what
    // would catch a partial clone that shares them by reference.
    const before = JSON.stringify(state);

    const next = applyIntent(state, { type: 'placeTile', playerId: alex.id, coord: 'C1' });

    expect(JSON.stringify(state)).toBe(before);
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

  it('rejects a survivor pick whose pending merger data is incomplete', () => {
    // `pendingTiedStartups` alone is not enough: completeSurvivorSelection also
    // needs the tile and the touching-chain list, and merely no-ops without
    // them. That must surface as a rejection, never as a no-op "success".
    for (const missing of ['pendingMergerTile', 'pendingMergerStartups'] as const) {
      const state = tiedMergeFixture();
      state.players[0].hand = ['C1'];
      const placed = applyIntent(state, {
        type: 'placeTile', playerId: state.players[0].id, coord: 'C1',
      });
      expect(placed.stage).toBe('chooseSurvivor');
      delete placed[missing];

      expect(codeOf(() => applyIntent(placed, {
        type: 'chooseSurvivor', playerId: state.players[0].id, startupId: 'Messla',
      }))).toBe('illegalPlacement');
    }
  });

  it('rejects an unknown intent type, and every intent not yet implemented', () => {
    const state = playing();
    const me = state.players[0].id;

    expect(codeOf(() => applyIntent(state, { type: 'nope' } as never))).toBe('unknownIntent');

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

describe('applyIntent — liquidate', () => {
  /**
   * Reuses `mergeFixture`'s geometry (Messla B1-B6 tier 0, ZuckFace D1-D3
   * tier 1; C1 merges them, Messla survives on size). Gives alex and sam
   * ZuckFace shares before the merge, then commits the merge via placeTile
   * so the resulting mergerLiquidation state is real, not hand-built.
   */
  function merged() {
    const state = mergeFixture();
    const [alex, sam] = state.players;
    alex.hand = ['C1'];
    alex.cash = 0;
    sam.cash = 0;
    giveShares(state, alex.id, { ZuckFace: 4 });
    giveShares(state, sam.id, { ZuckFace: 2 });
    const next = applyIntent(state, { type: 'placeTile', playerId: alex.id, coord: 'C1' });
    return { state: next, alex, sam };
  }

  it('queues every holder of the absorbed chain in seat order', () => {
    const { state, alex, sam } = merged();
    expect(state.stage).toBe('mergerLiquidation');
    expect(state.mergerContext!.shareholderQueue).toEqual([alex.id, sam.id]);
    expect(state.mergerContext!.currentShareholderIndex).toBe(0);
  });

  it('sells at the absorbed price, trades two-for-one and keeps the rest', () => {
    const { state, alex } = merged();
    const cashBefore = state.players[0].cash;
    // ZuckFace 3 tiles, tier 1 → $400
    const next = applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 1, trade: 2, keep: 1,
    });
    expect(next.players[0].cash).toBe(cashBefore + 400);
    expect(next.players[0].portfolio['ZuckFace']).toBe(1);
    expect(next.players[0].portfolio['Messla']).toBe(1); // 2 traded → 1 survivor share
    expect(next.mergerContext!.currentShareholderIndex).toBe(1);
    expect(next.stage).toBe('mergerLiquidation');
  });

  it('returns to buy once the queue is exhausted', () => {
    const { state, alex, sam } = merged();
    const a = applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 4, trade: 0, keep: 0,
    });
    const b = applyIntent(a, {
      type: 'liquidate', playerId: sam.id, startupId: 'ZuckFace', sell: 0, trade: 2, keep: 0,
    });
    expect(b.stage).toBe('buy');
  });

  it('rejects counts that do not add up to the holding', () => {
    const { state, alex } = merged();
    expect(codeOf(() => applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 1, trade: 1, keep: 1,
    }))).toBe('shareCountMismatch');
  });

  it('rejects an odd trade count', () => {
    const { state, alex } = merged();
    expect(codeOf(() => applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 0, trade: 3, keep: 1,
    }))).toBe('oddTradeCount');
  });

  it('rejects a trade the survivor pool cannot cover', () => {
    const { state, alex } = merged();
    state.startups['Messla'].availableShares = 1;
    expect(codeOf(() => applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 0, trade: 4, keep: 0,
    }))).toBe('notEnoughShares');
  });

  it('rejects a liquidation from a player who is not at the head of the queue', () => {
    const { state, sam } = merged();
    expect(codeOf(() => applyIntent(state, {
      type: 'liquidate', playerId: sam.id, startupId: 'ZuckFace', sell: 2, trade: 0, keep: 0,
    }))).toBe('notYourTurn');
  });

  it('logs what was done with the shares', () => {
    const { state, alex } = merged();
    const next = applyIntent(state, {
      type: 'liquidate', playerId: alex.id, startupId: 'ZuckFace', sell: 2, trade: 2, keep: 0,
    });
    expect(next.log.at(-1)).toMatchObject({ phase: 'Liquidated shares', playerId: alex.id });
  });
});
