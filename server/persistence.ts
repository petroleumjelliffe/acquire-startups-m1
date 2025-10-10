// server/persistence.ts
// Save and load game states to/from disk

import { writeFile, readFile, readdir, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { MultiplayerGameState, SavedGameState } from "./types";

const GAMES_DIR = join(process.cwd(), "server", "games");
const SAVE_VERSION = 1;

// Ensure games directory exists
export async function initPersistence(): Promise<void> {
  if (!existsSync(GAMES_DIR)) {
    await mkdir(GAMES_DIR, { recursive: true });
    console.log("✓ Created games directory:", GAMES_DIR);
  }
}

// Save game state to disk
export async function saveGame(
  gameId: string,
  state: MultiplayerGameState
): Promise<void> {
  try {
    const saveData: SavedGameState = {
      gameId,
      state,
      version: SAVE_VERSION,
    };

    const filePath = join(GAMES_DIR, `${gameId}.json`);
    await writeFile(filePath, JSON.stringify(saveData, null, 2), "utf-8");
    console.log(`✓ Saved game: ${gameId}`);
  } catch (error) {
    console.error(`✗ Failed to save game ${gameId}:`, error);
    throw error;
  }
}

// Load game state from disk
export async function loadGame(
  gameId: string
): Promise<MultiplayerGameState | null> {
  try {
    const filePath = join(GAMES_DIR, `${gameId}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    const data = await readFile(filePath, "utf-8");
    const saveData: SavedGameState = JSON.parse(data);

    if (saveData.version !== SAVE_VERSION) {
      console.warn(
        `⚠ Game ${gameId} has incompatible version ${saveData.version}`
      );
      return null;
    }

    console.log(`✓ Loaded game: ${gameId}`);
    return saveData.state;
  } catch (error) {
    console.error(`✗ Failed to load game ${gameId}:`, error);
    return null;
  }
}

// Load all saved games (useful for server restart)
export async function loadAllGames(): Promise<Map<string, MultiplayerGameState>> {
  const games = new Map<string, MultiplayerGameState>();

  try {
    if (!existsSync(GAMES_DIR)) {
      return games;
    }

    const files = await readdir(GAMES_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const gameId = file.replace(".json", "");
      const state = await loadGame(gameId);

      if (state) {
        games.set(gameId, state);
      }
    }

    console.log(`✓ Loaded ${games.size} games from disk`);
  } catch (error) {
    console.error("✗ Failed to load games:", error);
  }

  return games;
}

// Check if a game exists
export async function gameExists(gameId: string): Promise<boolean> {
  const filePath = join(GAMES_DIR, `${gameId}.json`);
  return existsSync(filePath);
}

// Delete a game (e.g., after completion or timeout)
export async function deleteGame(gameId: string): Promise<void> {
  try {
    const filePath = join(GAMES_DIR, `${gameId}.json`);

    if (existsSync(filePath)) {
      const { unlink } = await import("fs/promises");
      await unlink(filePath);
      console.log(`✓ Deleted game: ${gameId}`);
    }
  } catch (error) {
    console.error(`✗ Failed to delete game ${gameId}:`, error);
  }
}
