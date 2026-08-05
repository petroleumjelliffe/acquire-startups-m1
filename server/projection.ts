import type { GameState } from '../engine/gameTypes.js';

/**
 * The game as one player is allowed to see it.
 *
 * Three fields go and one deliberately stays. `seed` goes because the bag is
 * shuffled once at init and never re-seeded, so the seed alone reconstructs
 * the entire draw order for the rest of the game. `bag` goes for the same
 * reason, more directly. Every other player's `hand` goes because it is the
 * one secret this game actually has. `socketId` goes because it is transport
 * bookkeeping no client has a use for.
 *
 * `discarded` stays: traded-in dead tiles are shown at a real table, and the
 * deduction they permit is legitimate.
 *
 * The shape is unchanged, which is why the component layer renders a
 * projection without modification — the only private field it reads is the
 * viewer's own hand (`src/game/GameScreen.tsx`).
 *
 * Call this at the moment of sending, never earlier and never cached. A
 * projection computed correctly and then broadcast unprojected is the defect
 * this phase most needs to catch, and only the send site can tell them apart.
 */
export function project(state: GameState, forPlayerId: string): GameState {
  return {
    ...state,
    seed: '',
    bag: [],
    players: state.players.map(({ socketId, ...player }) =>
      player.id === forPlayerId ? player : { ...player, hand: [] },
    ),
  };
}
