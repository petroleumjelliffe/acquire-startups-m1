import { describe, it, expect } from 'vitest';
import { ALL_GOLDEN_GAMES } from './index';
import { runGoldenGame } from './runner';

describe('golden games', () => {
  // Tasks 11–13 fill TURN_GAMES / MERGER_GAMES / ENDGAME_GAMES; until then
  // the catalogue is empty. vitest errors on a describe block with zero
  // `it()`s, so this placeholder keeps the suite green in the interim — it
  // is inert once any golden game is registered below.
  if (ALL_GOLDEN_GAMES.length === 0) {
    it('has no golden games registered yet (Tasks 11–13 add them)', () => {
      expect(ALL_GOLDEN_GAMES).toEqual([]);
    });
  }

  for (const game of ALL_GOLDEN_GAMES) {
    it(`${game.id}: ${game.title}`, () => {
      runGoldenGame(game);
    });
  }
});
