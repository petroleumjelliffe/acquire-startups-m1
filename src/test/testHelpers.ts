import { GameState, Player, Startup } from '../state/gameTypes';
import { createInitialGame } from '../state/gameInit';
import { Coord } from '../utils/gameHelpers';

/**
 * Creates a minimal game state for testing
 */
export function createTestGameState(overrides?: Partial<GameState>): GameState {
  const base = createInitialGame('test-seed', ['Alice', 'Bob']);
  return {
    ...base,
    ...overrides,
  };
}

/**
 * Creates a test player with default values
 */
export function createTestPlayer(overrides?: Partial<Player>): Player {
  return {
    id: 'test-player-1',
    name: 'Test Player',
    cash: 6000,
    hand: [],
    portfolio: {},
    connectionState: 'connected',
    ...overrides,
  };
}

/**
 * Creates a test startup with default values
 */
export function createTestStartup(overrides?: Partial<Startup>): Startup {
  return {
    id: 'TestCo',
    tier: 1,
    isFounded: false,
    foundingTile: null,
    totalShares: 25,
    availableShares: 25,
    ...overrides,
  };
}

/**
 * Sets up a game state with founded startups on the board
 */
export function setupGameWithStartups(
  startups: Array<{ id: string; tiles: Coord[]; tier?: number }>
): GameState {
  const state = createTestGameState();

  // Found each startup and place tiles
  startups.forEach(({ id, tiles, tier = 1 }) => {
    const startup = state.startups[id];
    if (startup) {
      startup.isFounded = true;
      startup.tier = tier;
      startup.foundingTile = tiles[0];

      // Place tiles on board
      tiles.forEach((coord) => {
        state.board[coord] = {
          placed: true,
          startupId: id,
        };
      });
    }
  });

  return state;
}

/**
 * Gives shares to a player
 */
export function giveShares(
  state: GameState,
  playerId: string,
  shares: Record<string, number>
): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  Object.entries(shares).forEach(([startupId, count]) => {
    player.portfolio[startupId] = (player.portfolio[startupId] || 0) + count;
    const startup = state.startups[startupId];
    if (startup) {
      startup.availableShares -= count;
    }
  });
}

/**
 * Gets the size of a startup (number of tiles)
 */
export function getStartupSize(state: GameState, startupId: string): number {
  return Object.values(state.board).filter(
    (cell) => cell.startupId === startupId
  ).length;
}
