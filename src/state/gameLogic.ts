import type { GameState, Player } from "./gameTypes";
import type { Coord } from "../utils/gameHelpers";
import {
  compareTiles,
  getAdjacentCoords,
  floodFillUnclaimed,
  getTilesForStartup,
} from "../utils/gameHelpers";

//----------------------------------------------------
// STARTUP CONFIG
//----------------------------------------------------

export const AVAILABLE_STARTUPS = [
  { id: "Gobble" },
  { id: "Scrapple" },
  { id: "PaperfulPost" },
  { id: "CamCrooned" },
  { id: "Messla" },
  { id: "ZuckFace" },
  { id: "WrecksonMobil" },
];

//----------------------------------------------------
// INITIAL DRAW + DEALING
//----------------------------------------------------

export function resolveInitialDraw(state: GameState) {
  const drawn = state.players.map((p) => ({
    name: p.name,
    tile: state.bag.shift()!,
  }));

  for (const d of drawn) state.board[d.tile].placed = true;

  const sorted = [...drawn].sort((a, b) => compareTiles(a.tile, b.tile));
  const firstName = sorted[0].name;
  const firstIndex = state.players.findIndex((p) => p.name === firstName);

  // return tiles to bag end
  for (const d of drawn) state.bag.push(d.tile);

  state.log.push(
    `Initial draw: ${sorted.map((d) => `${d.name}→${d.tile}`).join(", ")}`
  );
  state.log.push(`${firstName} will go first.`);

  return { drawn: sorted, firstIndex };
}

export function dealOneRound(state: GameState) {
  for (const p of state.players) {
    if (p.hand.length < 6 && state.bag.length > 0) {
      p.hand.push(state.bag.shift()!);
    }
  }
}

export function allHandsFull(state: GameState) {
  return state.players.every((p) => p.hand.length >= 6);
}

//----------------------------------------------------
// TILE PLACEMENT LOGIC
//----------------------------------------------------

export function handleTilePlacement(state: GameState, coord: Coord): GameState {
  const player = state.players[state.turnIndex];
  const cell = state.board[coord];
  if (!player.hand.includes(coord) || cell.placed) return state;

  const adj = getAdjacentCoords(coord);
  const adjStartups = new Set<string>();
  const adjUnclaimed: Coord[] = [];

  for (const n of adj) {
    const c = state.board[n];
    if (!c?.placed) continue;
    if (c.startupId) adjStartups.add(c.startupId);
    else adjUnclaimed.push(n);
  }

  // Safe-chain rule
  if (adjStartups.size >= 2) {
    console.log(
      "Touching startups:",
      [...adjStartups].map((id) => `${id}(${getStartupSize(state, id)})`)
    );

    const touching = [...adjStartups];
    const safeChains = touching.filter((id) => getStartupSize(state, id) >= 11);
    if (safeChains.length > 1) {
      state.log.push(
        `${
          player.name
        } attempted illegal merge involving safe chain(s): ${safeChains.join(
          ", "
        )}`
      );
      return state; // 🚫 block placement
    }
  }

  // Place tile
  cell.placed = true;

  if (adjStartups.size === 0) {
    // Found new startup?
    if (adjUnclaimed.length > 0 && state.availableStartups.length > 0) {
      const brandChoices = state.availableStartups;
      const chosen = window.prompt(
        `Choose startup to found: ${brandChoices.join(", ")}`,
        brandChoices[0]
      );
      const chosenId =
        chosen && brandChoices.includes(chosen) ? chosen : brandChoices[0];
      createStartup(state, chosenId, coord);

      // Claim contiguous unclaimed group
      const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
      for (const g of group) state.board[g].startupId = chosenId;

      state.log.push(
        `${player.name} founded ${chosenId} with ${group.length} tiles.`
      );
    } else {
      state.log.push(`${player.name} placed ${coord} (isolated).`);
    }
  } else if (adjStartups.size === 1) {
    // Expand existing startup
    const [id] = [...adjStartups];
    const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
    for (const g of group) state.board[g].startupId = id;
    state.log.push(
      `${player.name} expanded ${id} to ${
        getTilesForStartup(state.board, id).length
      } tiles.`
    );
  } else {
    // Merge multiple startups
    const touchingIds = [...adjStartups];
    const sizes = touchingIds
      .map((id) => ({
        id,
        size: getTilesForStartup(state.board, id).length,
      }))
      .sort((a, b) => b.size - a.size);

    const top = sizes[0];
    const next = sizes[1];
    let survivorId = top.id;

    if (next && top.size === next.size) {
      const tied = sizes.filter((s) => s.size === top.size).map((s) => s.id);
      const choice = window.prompt(
        `Choose survivor: ${tied.join(", ")}`,
        tied[0]
      );
      survivorId = tied.includes(choice || "") ? choice! : tied[0];
    }

    // Claim adjacent unclaimed before merging
    const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
    for (const g of group) state.board[g].startupId = survivorId;

    const absorbedIds = touchingIds.filter((id) => id !== survivorId);
    mergeStartups(state, survivorId, absorbedIds);
    state.log.push(
      `${player.name} merged ${absorbedIds.join(", ")} into ${survivorId}.`
    );
  }

  // Draw next tile
  player.hand = player.hand.filter((t) => t !== coord);
  const draw = state.bag.shift();
  if (draw) player.hand.push(draw);

  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  return state;
}

//----------------------------------------------------
// STARTUP ASSIGNMENT + MERGER
//----------------------------------------------------

export function assignTilesToStartup(
  state: GameState,
  id: string,
  tiles: Coord[]
) {
  if (!state.startups[id]) {
    //foundingTile must be one of the coords in the list
    state.startups[id] = { id, tiles: [], foundingTile: tiles[0] };
    console.log("New startup founded:", id, "at", tiles[0]);
    // remove brand from available pool if present
    state.availableStartups = state.availableStartups.filter((a) => a !== id);
  }

  const s = state.startups[id];
  for (const t of tiles) {
    state.board[t].startupId = id;
    if (!s.tiles.includes(t)) s.tiles.push(t);
  }
}

export function returnBrandToAvailable(state: GameState, id: string) {
  // Only return if not already available and not active
  if (state.startups[id]) return; // still active
  if (!state.availableStartups.includes(id)) {
    state.availableStartups.push(id);
  }
}

export function chooseFoundingBrand(
  state: GameState,
  playerName: string
): string | null {
  // TODO: replace with your modal; prompt is just a dev stub
  const choices = state.availableStartups;
  if (choices.length === 0) return null;
  if (choices.length === 1) return choices[0];
  const chosen = window.prompt(
    `${playerName}: choose startup to found:\n${choices.join(", ")}`,
    choices[0]
  );
  if (!chosen) return null;
  return choices.includes(chosen) ? chosen : null;
}

export function pickMergeSurvivor(
  state: GameState,
  playersTurnName: string,
  ids: string[]
): string {
  // survivor = largest; tie → prompt
  const sizes = ids
    .map((id) => ({ id, size: state.startups[id].tiles.length }))
    .sort((a, b) => b.size - a.size);
  const top = sizes[0];
  const next = sizes[1];

  if (!next || top.size > next.size) return top.id;

  // tie among some
  const tied = sizes.filter((s) => s.size === top.size).map((s) => s.id);
  if (tied.length === 1) return tied[0];

  // TODO: replace with modal; prompt is a dev stub
  const chosen = window.prompt(
    `${playersTurnName}: tie! choose survivor:\n${tied.join(", ")}`,
    tied[0]
  );
  return tied.includes(chosen || "") ? (chosen as string) : tied[0];
}

/**
 * Count how many tiles belong to each startup ID.
 */
function getStartupSize(state: GameState, id: string): number {
  let count = 0;
  for (const cell of Object.values(state.board)) {
    if (cell.startupId === id) count++;
  }
  return count;
}

/**
 * Returns true if ANY of the given startups are "safe" (>=11 tiles).
 */
function anySafe(ids: string[], state: GameState): boolean {
  for (const id of ids) {
    const size = getStartupSize(state, id);
    if (size >= 11) return true;
  }
  return false;
}

/**
 * Create a new startup on the board.
 */
export function createStartup(
  state: GameState,
  id: string,
  foundingTile: Coord
) {
  state.startups[id] = { id, foundingTile, tiles: [] };
  state.availableStartups = state.availableStartups.filter((a) => a !== id);
  state.board[foundingTile].startupId = id;
}

/**
 * Merge absorbed startups into a surviving one.
 * Board is the source of truth — we just rewrite startupIds.
 */
export function mergeStartups(
  state: GameState,
  survivorId: string,
  absorbedIds: string[]
) {
  for (const [coord, cell] of Object.entries(state.board)) {
    if (absorbedIds.includes(cell.startupId || "")) {
      cell.startupId = survivorId;
    }
  }

  // Return absorbed brands to available pool
  for (const id of absorbedIds) {
    delete state.startups[id];
    if (!state.availableStartups.includes(id)) {
      state.availableStartups.push(id);
    }
  }
}

/**
 * Get all startup IDs adjacent to a given coordinate.
 */
function getTouchingStartups(state: GameState, coord: Coord): string[] {
  const ids = new Set<string>();
  for (const adj of getAdjacentCoords(coord)) {
    const cell = state.board[adj];
    if (cell?.startupId) ids.add(cell.startupId);
  }
  return [...ids];
}

//----------------------------------------------------
// TURN MANAGEMENT
//----------------------------------------------------

export function advanceTurn(state: GameState) {
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
}
