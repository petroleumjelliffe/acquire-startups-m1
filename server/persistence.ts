// server/persistence.ts
// Save committed game states.
//
// Restore-at-boot does not live here, and deliberately: a save holds only the
// `GameState`, not the roster or its rejoin tokens, so a game restored from
// disk would be one nobody could rejoin. Rebuilding that properly — roster
// and all — is Phase 4's recovery work. Writing committed state now is still
// worth it: it is the input Phase 4 will need. Shipping a read side that
// implies a restore capability that does not exist would be worse than
// shipping none.

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
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

/**
 * Only ever called with a room's committed state. Drafts are not written —
 * which is the segment model's "uncommitted work was never real" rule stated
 * as a storage fact rather than a behaviour to implement.
 */
export async function saveGame(roomId: string, state: GameState): Promise<void> {
  const saved: SavedGame = { roomId, version: SAVE_VERSION, state };
  try {
    // `recursive: true` makes this idempotent, so there is no setup step
    // (an `initPersistence` called once at boot, say) left to forget.
    await mkdir(GAMES_DIR, { recursive: true });
    await writeFile(join(GAMES_DIR, `${roomId}.json`), JSON.stringify(saved), 'utf-8');
  } catch (e) {
    console.error(`✗ Could not save room ${roomId}:`, e);
  }
}
