// server/persistence.ts
// Save and load committed game states.

import { writeFile, readFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { GameState } from '../engine/gameTypes.js';

const GAMES_DIR = join(process.cwd(), 'server', 'games');

/**
 * Bumped for Phase 3a: a save is now a bare committed `GameState` rather than
 * the `MultiplayerGameState` wrapper, and the wrapper's three extra fields were
 * already optional on `GameState`. A stale save refuses to load rather than
 * deserialising into a shape the room cannot drive.
 */
const SAVE_VERSION = 3;

interface SavedGame {
  roomId: string;
  version: number;
  state: GameState;
}

export async function initPersistence(): Promise<void> {
  if (!existsSync(GAMES_DIR)) {
    await mkdir(GAMES_DIR, { recursive: true });
    console.log('✓ Created games directory:', GAMES_DIR);
  }
}

/**
 * Only ever called with a room's committed state. Drafts are not written —
 * which is the segment model's "uncommitted work was never real" rule stated
 * as a storage fact rather than a behaviour to implement.
 */
export async function saveGame(roomId: string, state: GameState): Promise<void> {
  const saved: SavedGame = { roomId, version: SAVE_VERSION, state };
  try {
    await writeFile(join(GAMES_DIR, `${roomId}.json`), JSON.stringify(saved), 'utf-8');
  } catch (e) {
    console.error(`✗ Could not save room ${roomId}:`, e);
  }
}

export async function loadAllGames(): Promise<SavedGame[]> {
  if (!existsSync(GAMES_DIR)) return [];
  const files = (await readdir(GAMES_DIR)).filter((f) => f.endsWith('.json'));
  const games: SavedGame[] = [];

  for (const file of files) {
    try {
      const saved = JSON.parse(await readFile(join(GAMES_DIR, file), 'utf-8')) as SavedGame;
      if (saved.version !== SAVE_VERSION) {
        console.log(`ℹ Skipping ${file}: save version ${saved.version}, expected ${SAVE_VERSION}`);
        continue;
      }
      games.push(saved);
    } catch (e) {
      console.error(`✗ Could not load ${file}:`, e);
    }
  }

  return games;
}
