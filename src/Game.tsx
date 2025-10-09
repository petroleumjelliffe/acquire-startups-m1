import React, { useState } from "react";
import type { GameState } from "./state/gameTypes";
import { createInitialGame } from "./state/gameInit";
import { handleTilePlacement } from "./state/gameLogic";
import { Board } from "./components/Board";
import { PlayerHand } from "./components/PlayerHand";
import { GameLog } from "./components/GameLog";
import { Coord } from "./utils/gameHelpers";
import { DrawModal } from "./components/DrawModal";
import { BuyModal } from "./components/BuyModal";

export function Game({
  seed,
  playerNames,
}: {
  seed: string;
  playerNames: string[];
}) {
  const [state, setState] = useState<GameState>(() =>
    createInitialGame(seed, playerNames)
  );
  const cur = state.players[state.turnIndex];
  const placeTile = (coord: Coord) => {
    if (state.stage !== "play") return;
    const next = handleTilePlacement(state, coord);
    setState({ ...next });
  };
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Current: {cur.name}</h2>
      <Board
        board={state.board}
        onPlace={placeTile}
        startups={state.startups}
        currentHand={cur.hand}
      />
      <PlayerHand name={cur.name} hand={cur.hand} onPlace={placeTile} />
      <GameLog entries={state.log} />
      {state.stage === "draw" && (
        <DrawModal state={state} setState={setState} />
      )}

      {state.stage === "buy" && <BuyModal state={state} onUpdate={setState} />}
    </div>
  );
}
