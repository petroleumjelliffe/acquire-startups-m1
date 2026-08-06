import type { Coord } from '../../../engine/gameHelpers';
import type { GameState } from '../../../engine/gameTypes';

/** The log phase a tile placement is filed under. */
const PLACED = 'Placed a tile';

/**
 * Where each player last played, badged with their emoji.
 *
 * Derived from the log rather than read off `Player.lastPlacedTile`, which
 * looks like the right field and is not: it means "the tile placed this turn,
 * still undoable" and is cleared the moment it stops being either
 * (`engine/gameLogic.ts`). A board marker has to outlive the turn that made
 * it, or the board forgets who played what the moment play moves on.
 *
 * Deriving it also makes undo correct for free: rewinding restores the log
 * with the rest of the state, so a taken-back placement takes its badge with
 * it. Nothing here has to know that undo exists.
 *
 * The turn-order draw is deliberately not a placement — its entries are filed
 * under a different phase and carry every player's tile under the single
 * playerId of whoever pressed the button, which would badge the whole opening
 * board with seat one's emoji.
 */
export function ownerBadges(state: GameState): Record<Coord, string> {
  const lastPlayed: Record<string, Coord> = {};

  for (const entry of state.log) {
    if (entry.playerId === undefined || entry.phase !== PLACED) continue;
    const tile = entry.detail.find((token) => token.kind === 'tile');
    if (tile?.kind === 'tile') lastPlayed[entry.playerId] = tile.coord;
  }

  const badges: Record<string, string> = {};
  for (const [playerId, coord] of Object.entries(lastPlayed)) {
    const emoji = state.players.find((p) => p.id === playerId)?.emoji;
    if (emoji) badges[coord] = emoji;
  }
  return badges;
}

/**
 * The tile each founded chain grew from — the one cell per chain the board
 * labels with its ticker.
 *
 * The engine has tracked this all along (`Startup.foundingTile`); the board
 * has had a prop for it all along (`hqTiles`); nothing ever connected the two,
 * so every chain rendered as an undifferentiated block of colour and there was
 * no way to see where one began.
 */
export function foundingTiles(state: GameState): Coord[] {
  return Object.values(state.startups)
    .map((startup) => startup.foundingTile)
    .filter((coord): coord is Coord => coord != null);
}
