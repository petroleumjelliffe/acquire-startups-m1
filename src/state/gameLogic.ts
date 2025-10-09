import type { GameState, Player } from "./gameTypes";
import type { Coord } from "../utils/gameHelpers";
import {
  compareTiles,
  getAdjacentCoords,
  floodFillUnclaimed,
  getTilesForStartup,
  getStartupSize,
} from "../utils/gameHelpers";

//----------------------------------------------------
// STARTUP CONFIG
//----------------------------------------------------

export const AVAILABLE_STARTUPS = [
  { id: "Gobble", tier: 2 },
  { id: "Scrapple", tier: 2 },
  { id: "PaperfulPost", tier: 0 },
  { id: "CamCrooned", tier: 1 },
  { id: "Messla", tier: 1 },
  { id: "ZuckFace", tier: 1 },
  { id: "WrecksonMobil", tier: 2 },
];

export const sharePrices = [
  {
    sharePrice: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
    majorityHolderBonus: [
      2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    ],
  },
  {
    sharePrice: [300, 400, 500, 600, 700, 800, 900, 1000, 1100],
    majorityHolderBonus: [
      3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000,
    ],
  },
  {
    sharePrice: [400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
    majorityHolderBonus: [
      4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000,
    ],
  },
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
    if (adjUnclaimed.length > 0 && getAvailableStartups(state).length > 0) {
      const brandChoices = getAvailableStartups(state).map((s) => s.id);
      const chosen = window.prompt(
        `Choose startup to found: ${brandChoices.join(", ")}`,
        brandChoices[0]
      );
      const chosenId =
        chosen && brandChoices.includes(chosen) ? chosen : brandChoices[0];
        const tier = AVAILABLE_STARTUPS.find(s => s.id === chosenId)?.tier || 1;
      foundStartup(state, chosenId, coord);

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
 
 
) {
//assign given tiles to the givien startup id
}

export function returnBrandToAvailable(state: GameState, id: string) {
  // Only return if not already available and not active
  // if (state.startups[id]) return; // still active
  state.startups[id].isFounded = false;
  state.startups[id].foundingTile = null;

}

export function chooseFoundingBrand(
  state: GameState,
  playerName: string
): string | null {
  // TODO: replace with your modal; prompt is just a dev stub
  const choices = getAvailableStartups(state).map((s) => s.id);
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
// export function getStartupSize(state: GameState, id: string): number {
//   let count = 0;
//   for (const cell of Object.values(state.board)) {
//     if (cell.startupId === id) count++;
//   }
//   return count;
// }

/**
 * Returns true if ANY of the given startups are "safe" (>=11 tiles).
 */
// function anySafe(ids: string[], state: GameState): boolean {
//   for (const id of ids) {
//     const size = getStartupSize(state, id);
//     if (size >= 11) return true;
//   }
//   return false;
// }

/**
 * Create a new startup on the board.
 */
export function foundStartup(
  state: GameState,
  id: string,
  foundingTile: Coord,
  // tier: number
) {
  const s = state.startups[id];
  if (!s) return
  s.isFounded = true;
  s.foundingTile = foundingTile;

  // state.startups[id] = { id, foundingTile, tiles: [], tier };
  // state.availableStartups = state.availableStartups.filter((a) => a !== id);
  state.board[foundingTile].startupId = id;
  state.log.push(`${id} was founded at ${foundingTile}.`);
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

  // Return absorbed brands to available pool
  for (const id of absorbedIds) {
    const absorbed = state.startups[id];
    if (!absorbed) return;
    returnBrandToAvailable(state, id);

  
    // Reset player portfolios
    //trigger payouts for majority holders, and sell off stocks back to bank
  // set abosrobed tile to survivor
  for (const [coord, cell] of Object.entries(state.board)) {
    if (absorbedIds.includes(cell.startupId || "")) {
      cell.startupId = survivorId;
    }
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

//get share price based on tier and size
export function getSharePrice(state: GameState, startupId: string): number {
  const size = getStartupSize(state, startupId);
  const { tier } = state.startups[startupId];

  //array of cutoff values, index corresponds to shareprice index
  const thresholds = [2, 3, 4, 5, 6, 11, 21, 31, 41]; //size thresholds

  //find first index whose value is >= si
  //array indexof
  const payoutIndex = thresholds.reduce((acc, val, idx) => {
    if (size >= val) {
      return idx;
    }
    return acc;
  }, 0);
  return sharePrices[tier].sharePrice[payoutIndex];
}


export const getAvailableStartups = function(state: GameState) {
  return Object.values(state.startups).filter((s) => !s.isFounded);
}

export const getActiveStartups = function(state: GameState) {
  return Object.values(state.startups).filter((s) => s.isFounded);
}