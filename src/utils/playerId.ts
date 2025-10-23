// src/utils/playerId.ts
// Persistent player ID management using localStorage

const PLAYER_ID_KEY = 'acquire-player-id';
const PLAYER_NAME_KEY = 'acquire-player-name';

/**
 * Generate a unique player ID
 */
function generatePlayerId(): string {
  return `player-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get or create a persistent player ID
 */
export function getPlayerId(): string {
  // Check if we already have a player ID
  const existingId = localStorage.getItem(PLAYER_ID_KEY);

  if (existingId) {
    return existingId;
  }

  // Generate new ID
  const newId = generatePlayerId();
  localStorage.setItem(PLAYER_ID_KEY, newId);

  console.log('Generated new player ID:', newId);
  return newId;
}

/**
 * Store player name in localStorage
 */
export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch (error) {
    console.error('Failed to save player name:', error);
  }
}

/**
 * Get stored player name
 */
export function getPlayerName(): string | null {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY);
  } catch (error) {
    console.error('Failed to get player name:', error);
    return null;
  }
}

/**
 * Clear the stored player ID (for testing/debugging)
 */
export function clearPlayerId(): void {
  localStorage.removeItem(PLAYER_ID_KEY);
  localStorage.removeItem(PLAYER_NAME_KEY);
  console.log('Cleared player ID and name');
}

/**
 * Check if a player ID exists
 */
export function hasPlayerId(): boolean {
  return localStorage.getItem(PLAYER_ID_KEY) !== null;
}
