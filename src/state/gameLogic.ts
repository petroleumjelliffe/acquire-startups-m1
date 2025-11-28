import type { GameState, Player, MergerContext } from "./gameTypes";
import { Coord,
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

export function createMergerContext(
  survivorId: string,
  absorbedIds: string[]
): MergerContext {
  return {
    survivorId,
    absorbedIds,
    resolved: false,

    // payout phase defaults
    payoutQueue: [],
    currentChoiceIndex: 0,
    sharePrice: 0,

    // liquidation phase defaults
    currentLiquidationIndex: -1,
    shareholderQueue: [],
    currentShareholderIndex: -1,
    activePlayerId: undefined,
  };
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

  // Set lastPlacedTile for each player to show the indicator during draw phase
  for (const d of drawn) {
    const player = state.players.find((p) => p.name === d.name);
    if (player) {
      player.lastPlacedTile = d.tile;
    }
  }

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

  // Track last placed tile for this player
  player.lastPlacedTile = coord;

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

    // Check if there's a tie - if so, show modal to choose survivor
    if (next && top.size === next.size) {
      const tied = sizes.filter((s) => s.size === top.size).map((s) => s.id);

      // Set stage to chooseSurvivor and store pending merger info
      state.stage = "chooseSurvivor";
      state.pendingMergerTile = coord;
      state.pendingTiedStartups = tied;
      state.pendingMergerStartups = touchingIds;
    } else {
      // No tie - proceed with automatic survivor selection
      const survivorId = top.id;

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
  }

  // Store the tile to be removed from hand after confirmation
  // Don't draw a new tile yet - wait for modal confirmation
  state.pendingTileToRemove = coord;

  //don't move to next player yet
  // state.turnIndex = (state.turnIndex + 1) % state.players.length;
  return state;
}

/**
 * Completes the tile transaction by removing the played tile from hand and drawing a new one.
 * Call this after the player confirms their action (after modal closes).
 */
export function completeTileTransaction(state: GameState) {
  if (!state.pendingTileToRemove) return;

  const player = state.players[state.turnIndex];
  const coord = state.pendingTileToRemove;

  // Remove the played tile from hand
  player.hand = player.hand.filter((t) => t !== coord);

  // Draw a new tile from the bag
  const draw = state.bag.shift();
  if (draw) player.hand.push(draw);

  // Clear the pending tile
  state.pendingTileToRemove = undefined;
}

/**
 * Cancels a pending tile placement by reverting board changes.
 * Call this when a modal is cancelled.
 */
export function cancelTilePlacement(state: GameState) {
  if (!state.pendingTileToRemove) return state;

  const coord = state.pendingTileToRemove;
  const player = state.players[state.turnIndex];

  // Unplace the tile
  const cell = state.board[coord];
  cell.placed = false;
  cell.startupId = undefined;

  // Clear last placed tile indicator
  player.lastPlacedTile = undefined;

  // Remove any startup that was founded with this tile
  if (state.pendingFoundTile === coord) {
    // Find and unfound any startup that was founded with this tile
    for (const startup of Object.values(state.startups)) {
      if (startup.foundingTile === coord) {
        startup.isFounded = false;
        startup.foundingTile = null;
        startup.tiles = [];
        // Reset all tiles that were assigned to this startup
        for (const [tileCoord, tileCell] of Object.entries(state.board)) {
          if (tileCell.startupId === startup.id) {
            tileCell.startupId = undefined;
            // If this tile was placed as part of the founding, unplace it
            if (tileCell.placed && tileCoord !== coord) {
              // Leave other placed tiles as they were
            }
          }
        }
      }
    }
    state.pendingFoundTile = undefined;
  }

  // Clear merger context if there was one
  if (state.mergerContext) {
    // Revert any mergers that happened
    // This is complex - for now we'll rely on not calling this during mergers
    state.mergerContext = undefined;
  }

  // Clear pending tile
  state.pendingTileToRemove = undefined;

  // Reset stage to play
  state.stage = "play";

  // Remove the last log entry that was about this placement
  if (state.log.length > 0) {
    state.log.pop();
  }

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

/**
 * Completes a merger with a chosen survivor after user selects in modal.
 * Called from SurvivorSelectionModal after user confirms their choice.
 */
export function completeSurvivorSelection(state: GameState, survivorId: string) {
  const coord = state.pendingMergerTile;
  const touchingIds = state.pendingMergerStartups;

  if (!coord || !touchingIds) {
    console.error("Missing pending merger data");
    return;
  }

  const player = state.players[state.turnIndex];

  // Get adjacent coords for unclaimed tiles
  const adj = getAdjacentCoords(coord);
  const adjUnclaimed: Coord[] = [];
  for (const n of adj) {
    const c = state.board[n];
    if (c?.placed && !c.startupId) {
      adjUnclaimed.push(n);
    }
  }

  // Claim adjacent unclaimed before merging
  const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
  for (const g of group) state.board[g].startupId = survivorId;

  const absorbedIds = touchingIds.filter((id) => id !== survivorId);
  mergeStartups(state, survivorId, absorbedIds);
  state.log.push(
    `${player.name} merged ${absorbedIds.join(", ")} into ${survivorId}.`
  );

  // Complete the tile transaction (remove from hand, draw new tile)
  completeTileTransaction(state);

  // Clear pending merger data
  state.pendingMergerTile = undefined;
  state.pendingTiedStartups = undefined;
  state.pendingMergerStartups = undefined;

  state.stage = "mergerPayout";
  prepareMergerPayout(state, survivorId, absorbedIds);
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
  state.mergerContext = createMergerContext(survivorId, absorbedIds);
  state.stage = "mergerPayout";

  // Save the computed bonuses for the modal
  (state as any).pendingBonuses = allBonuses;
}

/**
 * Builds shareholder queue starting from current player and wrapping around.
 * Only includes players who own shares in the given startup.
 */
function buildShareholderQueue(state: GameState, startupId: string): string[] {
  const shareholders: string[] = [];
  const numPlayers = state.players.length;

  // Start from current turn player and wrap around
  for (let i = 0; i < numPlayers; i++) {
    const playerIndex = (state.turnIndex + i) % numPlayers;
    const player = state.players[playerIndex];
    if ((player.portfolio[startupId] || 0) > 0) {
      shareholders.push(player.id);
    }
  }

  return shareholders;
}

export function finalizeMergerPayout(state: GameState) {
  const bonuses: BonusResult[] = (state as any).pendingBonuses || [];

  // Award bonuses
  for (const b of bonuses) {
    const player = state.players.find((p) => p.id === b.playerId);
    if (player) {
      player.cash += b.amount;
      state.log.push(`${player.name} received $${b.amount} ${b.type} bonus.`);
    }
  }

  (state as any).pendingBonuses = undefined;

  // Now transition to liquidation phase
  const ctx = state.mergerContext!;
  if (!ctx) {
    state.stage = "buy";
    return;
  }

  // Start processing first absorbed startup
  ctx.currentLiquidationIndex = 0;
  const firstAbsorbed = ctx.absorbedIds[0];

  // Build shareholder queue starting from current player
  const shareholders = buildShareholderQueue(state, firstAbsorbed);

  ctx.shareholderQueue = shareholders;
  ctx.currentShareholderIndex = 0;
  ctx.sharePrice = getSharePrice(state, firstAbsorbed);

  if (shareholders.length > 0) {
    ctx.activePlayerId = shareholders[0];
    state.stage = "mergerLiquidation";
  } else {
    // No shareholders, skip to next or finish
    advanceToNextAbsorbedStartup(state);
  }
}

/**
 * Helper to advance to the next absorbed startup or finish merger
 */
export function advanceToNextAbsorbedStartup(state: GameState) {
  const ctx = state.mergerContext!;
  if (!ctx) return;

  // Clean up current absorbed startup
  const currentAbsorbed = ctx.absorbedIds[ctx.currentLiquidationIndex];
  const s = state.startups[currentAbsorbed];
  s.isFounded = false;
  s.foundingTile = null;
  s.availableShares = s.totalShares;

  // Clear any remaining shares from portfolios
  for (const p of state.players) {
    p.portfolio[currentAbsorbed] = 0;
  }

  state.log.push(`${currentAbsorbed} has been liquidated.`);

  // Move to next absorbed startup
  ctx.currentLiquidationIndex += 1;

  if (ctx.currentLiquidationIndex < ctx.absorbedIds.length) {
    // Process next absorbed startup
    const nextAbsorbed = ctx.absorbedIds[ctx.currentLiquidationIndex];
    // Build shareholder queue starting from current player
    const shareholders = buildShareholderQueue(state, nextAbsorbed);

    ctx.shareholderQueue = shareholders;
    ctx.currentShareholderIndex = 0;
    ctx.sharePrice = getSharePrice(state, nextAbsorbed);

    if (shareholders.length > 0) {
      ctx.activePlayerId = shareholders[0];
      state.stage = "mergerLiquidation";
    } else {
      // No shareholders for this one either, recurse
      advanceToNextAbsorbedStartup(state);
    }
  } else {
    // All absorbed startups processed
    delete state.mergerContext;
    state.stage = "buy";
    state.log.push("Merger complete. Entering buy phase.");
  }
}

export function completePlayerMergerLiquidation(
  state: GameState,
  playerId: string,
  {
    absorbedId,
    trade,
    sell,
  }: {
    absorbedId: string;
    trade: number;
    sell: number;
  }
) {
  const ctx = state.mergerContext;
  if (!ctx) return;

  const player = state.players.find((p) => p.id === playerId)!;
  const survivor = state.startups[ctx.survivorId];
  const sharePrice = ctx.sharePrice;

  const tradeCost = trade * 2;
  const sellGain = sell * sharePrice;
  const hold = (player.portfolio[absorbedId] || 0) - tradeCost - sell;

  // Deduct absorbed shares
  player.portfolio[absorbedId] -= tradeCost + sell;
  if (player.portfolio[absorbedId] < 0) player.portfolio[absorbedId] = 0;

  // Add survivor shares if traded
  if (trade > 0) {
    player.portfolio[ctx.survivorId] = (player.portfolio[ctx.survivorId] || 0) + trade;
    survivor.availableShares -= trade;
    state.log.push(
      `${player.name} traded ${tradeCost} ${absorbedId} shares for ${trade} ${ctx.survivorId} shares.`
    );
  }

  // Add cash from sells
  if (sell > 0) {
    player.cash += sellGain;
    state.log.push(`${player.name} sold ${sell} ${absorbedId} shares for $${sellGain}.`);
  }

  if (hold > 0) {
    state.log.push(`${player.name} held ${hold} ${absorbedId} shares.`);
  }

  // Advance to next shareholder
  ctx.currentShareholderIndex += 1;

  if (ctx.currentShareholderIndex < ctx.shareholderQueue.length) {
    // Next player for same absorbed startup
    ctx.activePlayerId = ctx.shareholderQueue[ctx.currentShareholderIndex];
  } else {
    // All shareholders done for this absorbed startup, move to next
    advanceToNextAbsorbedStartup(state);
  }
}

//----------------------------------------------------
// POST-MERGER LIQUIDATION LOGIC
//----------------------------------------------------

/**
 * Initialize the liquidation phase after bonuses have been distributed.
 * Handles multiple absorbed startups sequentially.
 */
export function startLiquidations(
  state: GameState,
  survivorId: string,
  absorbedIds: string[]
) {
  state.pendingLiquidations = [...absorbedIds];
  state.currentLiquidation = null;
  state.mergerContext = createMergerContext(
    survivorId,
    absorbedIds)
    // resolved: false,
    // payoutQueue: [],
    // sharePrice: 0, // to be set per absorbed startup
    // currentLiquidationIndex: -1,
    // shareholderQueue: [],
    // currentShareholderIndex: -1,
  
  state.stage = "liquidation";
  nextLiquidation(state);
}

/**
 * Moves to the next absorbed startup in the queue.
 */
export function nextLiquidation(state: GameState) {
  if (!state.pendingLiquidations?.length) {
    finalizeAllLiquidations(state);
    return;
  }

  const absorbedId = state.pendingLiquidations.shift()!;
  state.currentLiquidation = absorbedId;

  const shareholders = getShareholders(state, absorbedId);
  if (shareholders.length === 0) {
    // No shareholders → auto cleanup
    completeLiquidation(state, absorbedId);
    return;
  }

  // Initialize shareholder queue
  state.mergerContext!.shareholderQueue = shareholders.map((p) => p.id);
  state.mergerContext!.currentShareholderIndex = 0;
  const currentPlayerId = shareholders[0].id;

  // Move to modal stage
  state.stage = "liquidationPrompt";
  state.mergerContext!.activePlayerId = currentPlayerId;
}

/**
 * Returns a list of players who hold shares in a startup.
 */
export function getShareholders(state: GameState, startupId: string): Player[] {
  return state.players.filter((p) => (p.portfolio[startupId] || 0) > 0);
}

/**
 * Applies a player's liquidation choice and advances to the next shareholder.
 */
export function handleLiquidationChoice(
  state: GameState,
  playerId: string,
  absorbedId: string,
  survivorId: string,
  choice: "sell" | "trade" | "hold"
) {
  const player = state.players.find((p) => p.id === playerId)!;
  const absorbed = state.startups[absorbedId];
  const survivor = state.startups[survivorId];
  const shares = player.portfolio[absorbedId] || 0;
  const price = getSharePrice(state, absorbedId);

  switch (choice) {
    case "sell": {
      const proceeds = shares * price;
      player.cash += proceeds;
      player.portfolio[absorbedId] = 0;
      state.log.push(
        `${player.name} sold ${shares} ${absorbedId} share(s) for $${proceeds}.`
      );
      break;
    }
    case "trade": {
      const tradeable = Math.floor(shares / 2);
      const tradeCount = Math.min(tradeable, survivor.availableShares);
      if (tradeCount > 0) {
        player.portfolio[absorbedId] -= tradeCount * 2;
        player.portfolio[survivorId] =
          (player.portfolio[survivorId] || 0) + tradeCount;
        survivor.availableShares -= tradeCount;
        state.log.push(
          `${player.name} traded ${
            tradeCount * 2
          } ${absorbedId} shares for ${tradeCount} ${survivorId} share(s).`
        );
      }
      break;
    }
    case "hold": {
      state.log.push(
        `${player.name} chose to hold ${shares} ${absorbedId} share(s).`
      );
      break;
    }
  }

  advanceLiquidationTurn(state);
}

/**
 * Move to next shareholder in the liquidation sequence.
 */
export function advanceLiquidationTurn(state: GameState) {
  const ctx = state.mergerContext!;
  if (!ctx) return;
  ctx.currentShareholderIndex += 1;

  if (ctx.currentShareholderIndex >= ctx.shareholderQueue.length) {
    // Finished all shareholders → cleanup absorbed startup
    completeLiquidation(state, state.currentLiquidation!);
  } else {
    // Prompt next player
    const nextPlayerId = ctx.shareholderQueue[ctx.currentShareholderIndex];
    ctx.activePlayerId = nextPlayerId;
    state.stage = "liquidationPrompt";
  }
}

/**
 * Final cleanup for one absorbed startup.
 */
export function completeLiquidation(state: GameState, absorbedId: string) {
  const absorbed = state.startups[absorbedId];
  if (!absorbed) return;

  absorbed.isFounded = false;
  absorbed.foundingTile = null;
  absorbed.availableShares = absorbed.totalShares;

  // Remove all tiles from board for this startup
  for (const cell of Object.values(state.board)) {
    if (cell.startupId === absorbedId) cell.startupId = undefined;
  }

  state.log.push(`${absorbedId} has been liquidated.`);

  // Proceed to next liquidation if any remain
  nextLiquidation(state);
}

/**
 * Once all liquidations are complete, clean up merger context and move to next phase.
 */
export function finalizeAllLiquidations(state: GameState) {
  state.currentLiquidation = null;
  state.pendingLiquidations = [];
  delete state.mergerContext;
  state.stage = "buy"; // or next phase depending on your flow
  state.log.push(`All liquidations complete. Returning to buy phase.`);
}
