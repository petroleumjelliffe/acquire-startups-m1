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
  { id: "Messla", tier: 0 },
  { id: "ZuckFace", tier: 1 },
  { id: "WrecksonMobil", tier: 1 },
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

export interface BonusResult {
  playerId: string;
  playerName: string;
  amount: number;
  type: "majority" | "minority";
}

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
      //change state to found, in order to trigger the FoundStartupModal
      state.stage = "foundStartup";
      state.pendingFoundTile = coord;

      //move following game logic to the FoundStartupModal component

      //     const brandChoices = getAvailableStartups(state).map((s) => s.id);
      //     const chosen = window.prompt(
      //       `Choose startup to found: ${brandChoices.join(", ")}`,
      //       brandChoices[0]
      //     );
      //     const chosenId =
      //       chosen && brandChoices.includes(chosen) ? chosen : brandChoices[0];
      //       const tier = AVAILABLE_STARTUPS.find(s => s.id === chosenId)?.tier || 1;
      //     foundStartup(state, chosenId, coord);

      //     // Claim contiguous unclaimed group
      //     const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
      //     for (const g of group) state.board[g].startupId = chosenId;

      //     state.log.push(
      //       `${player.name} founded ${chosenId} with ${group.length} tiles.`
      //     );
      //     //enter buy stage
      // state.stage = "buy";
      // state.currentBuyCount = 0;
    } else {
      state.log.push(`${player.name} placed ${coord} (isolated).`);
      //enter buy stage
      state.stage = "buy";
      state.currentBuyCount = 0;
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
    //enter buy stage
    state.stage = "buy";
    state.currentBuyCount = 0;
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

    state.stage = "mergerPayout";
    prepareMergerPayout(state, survivorId, absorbedIds);
  }

  // Draw next tile
  player.hand = player.hand.filter((t) => t !== coord);
  const draw = state.bag.shift();
  if (draw) player.hand.push(draw);

  //don't move to next player yet
  // state.turnIndex = (state.turnIndex + 1) % state.players.length;
  return state;
}

//----------------------------------------------------
// STARTUP ASSIGNMENT + MERGER
//----------------------------------------------------

export function assignTilesToStartup(state: GameState, id: string) {
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
  foundingTile: Coord
  // tier: number
) {
  const s = state.startups[id];
  if (!s) return;
  s.isFounded = true;
  s.foundingTile = foundingTile;

  // Mark the founding tile and its connected placed neighbors
  const toVisit = [foundingTile];
  const visited = new Set();

  while (toVisit.length) {
    const tile = toVisit.pop()!;
    if (visited.has(tile)) continue;
    visited.add(tile);

    const cell = state.board[tile];
    if (!cell?.placed || cell.startupId) continue;

    cell.startupId = id;

    for (const adj of getAdjacentCoords(tile)) {
      const adjCell = state.board[adj];
      if (adjCell && adjCell.placed && !adjCell.startupId) {
        toVisit.push(adj);
      }
    }
  }

  //grant founding bondus
  grantFoundingShare(state, state.players[state.turnIndex].id, id);
  state.log.push(`${id} was founded at ${foundingTile}.`);

  state.stage = "buy";
  delete state.pendingFoundTile;
  return state;
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

export const getAvailableStartups = function (state: GameState) {
  return Object.values(state.startups).filter((s) => !s.isFounded);
};

export function getActiveStartups(state: GameState) {
  return Object.values(state.startups).filter((s) => s.isFounded);
}

export function getBuyableStartups(state: GameState) {
  return Object.values(state.startups)
    .filter((s) => s.isFounded && s.availableShares > 0)
    .map((s) => ({
      id: s.id,
      price: getSharePrice(state, s.id),
      availableShares: s.availableShares,
      tier: s.tier,
    }));
}

export function grantFoundingShare(
  state: GameState,
  playerId: string,
  startupId: string
) {
  const player = state.players.find((p) => p.id === playerId);
  const startup = state.startups[startupId];
  if (!player || !startup) return;

  if (startup.availableShares > 0) {
    startup.availableShares -= 1;
    player.portfolio[startupId] = (player.portfolio[startupId] || 0) + 1;
    state.log.push(
      `${player.name} received a free share of ${startupId} for founding it.`
    );
  }
}

export function buyShares(
  state: GameState,
  playerId: string,
  startupId: string,
  count: number
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  const startup = state.startups[startupId];
  if (!player || !startup || !startup.isFounded) return false;

  const remainingAllowance = 3 - (state.currentBuyCount || 0);
  const buyCount = Math.min(count, remainingAllowance, startup.availableShares);
  if (buyCount <= 0) return false;

  const price = getSharePrice(state, startupId);
  const total = price * buyCount;
  if (player.cash < total) return false;

  player.cash -= total;
  player.portfolio[startupId] = (player.portfolio[startupId] || 0) + buyCount;
  startup.availableShares -= buyCount;
  state.currentBuyCount = (state.currentBuyCount || 0) + buyCount;

  state.log.push(
    `${player.name} bought ${buyCount} ${startupId} share(s) for $${total}.`
  );
  return true;
}

export function endBuyPhase(state: GameState) {
  state.stage = "play";
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  state.currentBuyCount = 0;
  return state;
}
export function prepareMergerPayout(
  state: GameState,
  survivorId: string,
  absorbedIds: string[]
) {
  const allBonuses: BonusResult[] = [];

  for (const absorbedId of absorbedIds) {
    const price = getSharePrice(state, absorbedId);

    const holdings = state.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        shares: p.portfolio[absorbedId] || 0,
      }))
      .filter((h) => h.shares > 0)
      .sort((a, b) => b.shares - a.shares);

    if (holdings.length === 0) continue;

    const majorityShares = holdings[0].shares;
    const majorityHolders = holdings.filter((h) => h.shares === majorityShares);
    const minorityShares = Math.max(
      0,
      ...holdings.filter((h) => h.shares < majorityShares).map((h) => h.shares)
    );
    const minorityHolders = holdings.filter(
      (h) => h.shares === minorityShares && h.shares < majorityShares
    );

    const majBonus = price * 10;
    const minBonus = price * 5;

    if (majorityHolders.length > 1) {
      const split = Math.floor((majBonus + minBonus) / majorityHolders.length);
      for (const h of majorityHolders) {
        allBonuses.push({
          playerId: h.id,
          playerName: h.name,
          amount: split,
          type: "majority",
        });
      }
    } else {
      for (const h of majorityHolders) {
        allBonuses.push({
          playerId: h.id,
          playerName: h.name,
          amount: majBonus,
          type: "majority",
        });
      }
      for (const h of minorityHolders) {
        allBonuses.push({
          playerId: h.id,
          playerName: h.name,
          amount: minBonus,
          type: "minority",
        });
      }
    }
  }

  // Store merger context for UI
  state.mergerContext = { survivorId, absorbedIds, resolved: false };
  state.stage = "mergerLiquidation";

  // Save the computed bonuses for the modal
  (state as any).pendingBonuses = allBonuses;
}

export function finalizeMergerPayout(state: GameState) {
  const bonuses: BonusResult[] = (state as any).pendingBonuses || [];
  for (const b of bonuses) {
    const player = state.players.find((p) => p.id === b.playerId);
    if (player) {
      player.cash += b.amount;
      state.log.push(`${player.name} received $${b.amount} ${b.type} bonus.`);
    }
  }

  // Auto-sell all absorbed shares at current share price
  const absorbedIds = state.merger?.absorbedIds || [];
  for (const p of state.players) {
    for (const id of absorbedIds) {
      const shares = p.portfolio[id] || 0;
      if (shares > 0) {
        const price = getSharePrice(state, id);
        const proceeds = price * shares;
        p.cash += proceeds;
        p.portfolio[id] = 0;
        state.log.push(
          `${p.name} sold ${shares} shares of ${id} for $${proceeds}`
        );
      }
    }
  }

  // Reset absorbed startups
  for (const id of absorbedIds) {
    const s = state.startups[id];
    s.isFounded = false;
    s.foundingTile = null;
    s.availableShares = s.totalShares;
  }

  state.stage = "buy";
  state.merger = undefined;
  (state as any).pendingBonuses = undefined;
}


export function completePlayerMergerLiquidation(
  state: GameState,
  playerId: string,
  {
    survivorId,
    absorbedId,
    trade,
    sell,
    sharePrice,
  }: {
    survivorId: string;
    absorbedId: string;
    trade: number;
    sell: number;
    sharePrice: number;
  }
) {
  const player = state.players.find((p) => p.id === playerId)!;
  const survivor = state.startups[survivorId];
  const absorbed = state.startups[absorbedId];

  const tradeCost = trade * 2;
  const sellGain = sell * sharePrice;

  // Deduct absorbed shares
  player.portfolio[absorbedId] -= tradeCost + sell;
  if (player.portfolio[absorbedId] < 0) player.portfolio[absorbedId] = 0;

  // Add survivor shares
  player.portfolio[survivorId] =
    (player.portfolio[survivorId] || 0) + trade;
  survivor.availableShares -= trade;

  // Add cash from sells
  player.cash += sellGain;

  // If all players finished, return absorbed startup to available list
  if (state.mergerContext?.currentChoiceIndex ===
      state.mergerContext?.payoutQueue.length - 1) {
    absorbed.isFounded = false;
    absorbed.foundingTile = null;
  }
}
