import type { GameState, Player } from "./gameTypes";
import type { Coord } from "../utils/gameHelpers";
import {
  compareTiles,
  getAdjacentCoords,
  floodFillUnclaimed,
} from "../utils/gameHelpers";

//----------------------------------------------------
// STARTUP CONFIG
//----------------------------------------------------

const AVAILABLE_STARTUPS = [
  { id: "Goober", color: "bg-red-200" },
  { id: "FruitBox", color: "bg-green-200" },
  { id: "Byte.ly", color: "bg-blue-200" },
  { id: "FaceHub", color: "bg-purple-200" },
  { id: "Orbital", color: "bg-yellow-200" },
  { id: "MicroBros", color: "bg-orange-200" },
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

  // Place the tile
  cell.placed = true;
  player.hand = player.hand.filter((t) => t !== coord);
  const newTile = state.bag.shift();
  if (newTile) player.hand.push(newTile);

  // Detect adjacency
  const adj = getAdjacentCoords(coord);
  const adjStartups = new Set<string>();
  const adjUnclaimed: Coord[] = [];

  //loop through adjacent coords, check board state, record which startups are adjacent and which unclaimed tiles
  for (const n of adj) {
    const c = state.board[n];
    if (!c?.placed) continue;
    if (c.startupId) adjStartups.add(c.startupId);
    else adjUnclaimed.push(n);
  }

  if (adjStartups.size === 0) {
    // Found new startup or isolated tile
    if (adjUnclaimed.length === 0) {
      state.log.push(`${player.name} placed ${coord} (isolated).`);
      console.log("Isolated tile placed, no action.");
    } else {
      // Found new startup
      const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
      const startup = AVAILABLE_STARTUPS.shift();
      if (startup) {
        assignTilesToStartup(state, startup.id, group);
        state.log.push(
          `${player.name} founded ${startup.id} with ${group.length} tiles.`
        );
      } else {
        state.log.push(
          `${player.name} placed ${coord}, no startups available.`
        );
      }
    }
  } else if (adjStartups.size === 1) {
    // Expand existing startup + absorb adjacent unclaimed
    const id = [...adjStartups][0];
    const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
    assignTilesToStartup(state, id, group);
    state.log.push(
      `${player.name} expanded ${id} to ${state.startups[id].tiles.length} tiles.`
    );
    console.log("Expanding existing startup", id);
  } else if (adjStartups.size >= 2) {
    // Merger detected
    const group = floodFillUnclaimed([coord, ...adjUnclaimed], state.board);
    const surviving = [...adjStartups][0];
    assignTilesToStartup(state, surviving, group);
    const merging = [...adjStartups].slice(1);
    mergeStartups(state, surviving, merging);
    state.log.push(
      `${player.name} triggered merger: ${[surviving, ...merging].join(" + ")}`
    );
  }

  advanceTurn(state);
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
    state.startups[id] = { id, tiles: [], foundingTile: tiles[0] };
  }

  const s = state.startups[id];
  for (const t of tiles) {
    state.board[t].startupId = id;
    if (!s.tiles.includes(t)) s.tiles.push(t);
  }
}

export function mergeStartups(
  state: GameState,
  survivorId: string,
  absorbedIds: string[]
) {
  const survivor = state.startups[survivorId];
  if (!survivor) return;

  for (const absorbedId of absorbedIds) {
    const absorbed = state.startups[absorbedId];
    if (!absorbed) continue;

    for (const t of absorbed.tiles) {
      state.board[t].startupId = survivorId;
      if (!survivor.tiles.includes(t)) survivor.tiles.push(t);
    }
    delete state.startups[absorbedId];
  }
}

//----------------------------------------------------
// TURN MANAGEMENT
//----------------------------------------------------

export function advanceTurn(state: GameState) {
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
}
