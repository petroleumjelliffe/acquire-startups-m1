// server/playerAuth.ts
// Validate player IDs and turn ownership

import type { MultiplayerGameState, GameAction } from "./types";

export class PlayerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerAuthError";
  }
}

/**
 * Validate that the action comes from the current player whose turn it is
 */
export function validatePlayerTurn(
  state: MultiplayerGameState,
  action: GameAction
): void {
  const currentPlayer = state.players[state.turnIndex];

  if (!currentPlayer) {
    throw new PlayerAuthError("Invalid game state: no current player");
  }

  if (action.playerId !== currentPlayer.id) {
    throw new PlayerAuthError(
      `Not your turn. Current player: ${currentPlayer.name} (${currentPlayer.id})`
    );
  }
}

/**
 * Validate that a player exists in the game
 */
export function validatePlayerInGame(
  state: MultiplayerGameState,
  playerId: string
): void {
  const player = state.players.find((p) => p.id === playerId);

  if (!player) {
    throw new PlayerAuthError(
      `Player ${playerId} is not in this game`
    );
  }
}

/**
 * Validate that the action is for the correct game
 */
export function validateGameId(
  state: MultiplayerGameState,
  action: GameAction
): void {
  if (action.gameId !== state.gameId) {
    throw new PlayerAuthError(
      `Game ID mismatch: expected ${state.gameId}, got ${action.gameId}`
    );
  }
}

/**
 * Full validation of a game action
 */
export function validateAction(
  state: MultiplayerGameState,
  action: GameAction
): void {
  validateGameId(state, action);
  validatePlayerInGame(state, action.playerId);
  validatePlayerTurn(state, action);
}

/**
 * Validate liquidation phase actions (any shareholder can act, not just current turn player)
 */
export function validateLiquidationAction(
  state: MultiplayerGameState,
  action: GameAction
): void {
  validateGameId(state, action);
  validatePlayerInGame(state, action.playerId);

  // Check if it's the correct player in the liquidation queue
  if (!state.mergerContext) {
    throw new PlayerAuthError("No active merger liquidation");
  }

  const ctx = state.mergerContext;
  const currentPlayerId = ctx.shareholderQueue?.[ctx.currentShareholderIndex ?? -1];

  if (action.playerId !== currentPlayerId) {
    throw new PlayerAuthError(
      `Not your turn in liquidation. Waiting for player: ${currentPlayerId}`
    );
  }
}

/**
 * Check if a player is the host (for starting games, etc.)
 */
export function isHost(state: MultiplayerGameState, playerId: string): boolean {
  // First player in the list is the host
  return state.players[0]?.id === playerId;
}
