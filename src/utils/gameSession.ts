// src/utils/gameSession.ts
// Persist and retrieve current game session for reconnection

const GAME_SESSION_KEY = 'acquire-game-session';

export interface GameSession {
  gameId: string;
  playerId: string;
  playerName: string;
  joinedAt: number;
}

/**
 * Store the current game session in localStorage
 */
export function saveGameSession(session: GameSession): void {
  try {
    localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save game session:', error);
  }
}

/**
 * Retrieve the current game session from localStorage
 */
export function getGameSession(): GameSession | null {
  try {
    const stored = localStorage.getItem(GAME_SESSION_KEY);
    if (!stored) return null;

    return JSON.parse(stored) as GameSession;
  } catch (error) {
    console.error('Failed to load game session:', error);
    return null;
  }
}

/**
 * Clear the current game session
 */
export function clearGameSession(): void {
  try {
    localStorage.removeItem(GAME_SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear game session:', error);
  }
}

/**
 * Check if a game session exists
 */
export function hasGameSession(): boolean {
  return getGameSession() !== null;
}
