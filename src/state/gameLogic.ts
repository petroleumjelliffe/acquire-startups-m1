import type { GameState } from "./gameTypes";
import * as gameHelpers from "../utils/gameHelpers";

export function resolveInitialDraw(state: GameState) {
  const drawn = state.players.map((p) => ({
    name: p.name,
    tile: state.bag.shift()!,
  }));
  for (const d of drawn) state.board[d.tile].placed = true;
  const sorted = [...drawn].sort((a, b) => gameHelpers.compareTiles(a.tile, b.tile));
  const firstName = sorted[0].name;
  const firstIndex = state.players.findIndex((p) => p.name === firstName);
  for (const d of drawn) state.bag.push(d.tile);
  state.log.push(
    `Initial draw: ${sorted.map((d) => `${d.name}→${d.tile}`).join(", ")}`
  );
  state.log.push(`${firstName} will go first.`);
  return { drawn: sorted, firstIndex };
}
export function dealOneRound(state: GameState) {
  for (const p of state.players) {
    if (p.hand.length < 6) {
      const t = state.bag.shift();
      if (t) p.hand.push(t);
    }
  }
}
export function allHandsFull(state: GameState) {
  return state.players.every((p) => p.hand.length === 6);
}
export function handleTilePlacement(state: GameState, coord: gameHelpers.Coord) {
  const cur = state.players[state.turnIndex];

  //If coord already placed, ignore
  if (!cur.hand.includes(coord)) return state;
  if (state.board[coord].placed) return state;

  //todo: handle placing/trading in tiles between 2 established startups

  //place tile on board, remove from hand, draw new tile
  state.board[coord].placed = true;
  cur.hand = cur.hand.filter((t) => t !== coord);
  const draw = state.bag.shift();
  if (draw) cur.hand.push(draw);

  //get adjacent tiles and startups context
  const adjacent = gameHelpers.getAdjacentCoords(coord);
  console.log("adjacent", adjacent);

  //Check for adjacent tiles and startups
  //log output for now
  //start with case of >=2 adjacent startups
  //then ===1 start up
  //then handle unclaimed tiles
  //startsup are only created when adjcent to 1 or more uncliaimed tiles
  //then no adjacent tiles
  const adjacentStartups = gameHelpers.getAdjacentStartups(
    state.board,
    state.startups,
    coord
  );
  console.log("adjacent startups", adjacentStartups);
  if (adjacentStartups.length >= 2) {
    //merge case
    state.log.push(
      `${
        cur.name
      } placed ${coord}, triggering a merger between ${adjacentStartups.join(
        " and "
      )}`
    );
    //for now, just assign to first startup
    const primary = adjacentStartups[0];
    gameHelpers.assignTilesToStartup(state, primary, [coord]);
    state.log.push(`Assigned ${coord} to ${primary}`);
  } else if (adjacentStartups.length === 1) {
    //expand existing startup
    const primary = adjacentStartups[0];
    gameHelpers.assignTilesToStartup(state, primary, [coord]);
    state.log.push(`${cur.name} placed ${coord}, expanding ${primary}`);
  } else {
    //no adjacent startups
    //check for adjacent unclaimed tiles
    const adjacentUnclaimed = gameHelpers.getStartupsFromTiles(
      state.board,
      adjacent
    ).filter((s) => s === "unclaimed");
    if (adjacentUnclaimed.length > 0) {
      //expand unclaimed tiles
      gameHelpers.assignTilesToStartup(state, "unclaimed", [coord]);
      state.log.push(`${cur.name} placed ${coord}, expanding unclaimed tiles`);
    }
  }

  //Update log
  state.log.push(`${cur.name} placed ${coord}`);
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  return state;
}


