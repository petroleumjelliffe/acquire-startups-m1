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
import { MergerPayoutModal, FoundStartupModal } from "./components"; //barrelfile
import { MergerLiquidationModal } from "./components/MergerLiquidation";
import { PlayerSummary } from "./components/PlayerSummary";
import { PlayerStatusPanel } from "./components/PlayerStatusPanel";
import { WaitingForPlayer } from "./components/WaitingForPlayer";
import { YourTurnIndicator } from "./components/YourTurnIndicator";
import { TilePlacementConfirmModal } from "./components/TilePlacementConfirmModal";
import { useSocket } from "./context/SocketContext";
import { useEffect } from "react";

export function Game({
  seed,
  playerNames,
  initialState,
  isMultiplayer = false,
}: {
  seed: string;
  playerNames: string[];
  initialState?: GameState;
  isMultiplayer?: boolean;
}) {
  const { socket, playerId } = useSocket();
  const [state, setState] = useState<GameState>(() =>
    initialState || createInitialGame(seed, playerNames)
  );
  const [pendingTile, setPendingTile] = useState<Coord | null>(null);
  const [pendingState, setPendingState] = useState<GameState | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [stateBeforePlacement, setStateBeforePlacement] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<Coord | null>(null); // Manually selected tile from hand

  const cur = state.players[state.turnIndex];
  const isMyTurn = isMultiplayer ? cur.id === playerId : true;

  // In multiplayer, find your own player (not necessarily the current turn player)
  const myPlayer = isMultiplayer
    ? state.players.find(p => p.id === playerId)
    : cur;

  // Listen for game state updates from server (multiplayer only)
  useEffect(() => {
    if (!socket || !isMultiplayer) return;

    socket.on('gameState', (newState: GameState) => {
      console.log('📥 Received game state update from server');
      setState(newState);
    });

    return () => {
      socket.off('gameState');
    };
  }, [socket, isMultiplayer]);

  // Handler for selecting a tile from the hand tray
  const handleTileSelection = (coord: Coord) => {
    if (state.stage !== "play") return;
    if (isMultiplayer && !isMyTurn) return;

    const player = state.players[state.turnIndex];
    if (!player.hand.includes(coord)) return;

    // Toggle selection: if already selected, deselect; otherwise select
    if (selectedTile === coord) {
      setSelectedTile(null);
    } else {
      setSelectedTile(coord);
    }
  };

  const placeTile = (coord: Coord) => {
    if (state.stage !== "play") return;
    if (isMultiplayer && !isMyTurn) return; // Prevent action if not your turn

    const player = state.players[state.turnIndex];

    // Only allow placing if this tile is selected
    if (selectedTile !== coord) {
      // If clicking a tile in hand, select it instead
      if (player.hand.includes(coord)) {
        handleTileSelection(coord);
      }
      return;
    }

    // Store a snapshot of the state before placement for potential cancellation
    setStateBeforePlacement(structuredClone(state));

    // Calculate the next state (commits tile placement but not hand removal/draw)
    const next = handleTilePlacement(state, coord);

    // Store pending placement and show highlight
    setPendingTile(coord);
    setPendingState(next);

    // Clear selection since we're placing
    setSelectedTile(null);

    // Show confirmation for isolated tiles, or let modal handle confirmation for other actions
    // The modals themselves will handle the cancellation
    if (next.stage === "buy" && !next.pendingFoundTile && !next.mergerContext) {
      // Isolated tile placement - show confirmation
      setShowConfirmation(true);
    } else {
      // Founding, expansion, or merger - show the respective modal
      // The modal will handle confirmation/cancellation
      applyTilePlacement(next);
    }
  };

  const confirmTilePlacement = () => {
    if (pendingState) {
      const { completeTileTransaction } = require("./state/gameLogic");
      const confirmedState = structuredClone(pendingState);
      completeTileTransaction(confirmedState);
      applyTilePlacement(confirmedState);
      setShowConfirmation(false);
      setPendingTile(null);
      setPendingState(null);
    }
  };

  const cancelTilePlacement = () => {
    setShowConfirmation(false);
    setPendingTile(null);
    setPendingState(null);
  };

  const applyTilePlacement = (newState: GameState) => {
    if (isMultiplayer && socket) {
      // Send to server instead of updating locally
      socket.emit('stateUpdate', {
        gameId: state.gameId,
        playerId,
        newState
      });
    } else {
      // Singleplayer: update locally
      setState({ ...newState });
    }
  };

  // Generic state update handler for multiplayer
  const handleStateUpdate = (newState: GameState) => {
    // Clear pending tile when state updates
    setPendingTile(null);
    setPendingState(null);
    setShowConfirmation(false);

    if (isMultiplayer && socket) {
      // Send to server
      socket.emit('stateUpdate', {
        gameId: state.gameId,
        playerId,
        newState
      });
    } else {
      // Singleplayer: update locally
      setState(newState);
    }
  };

  // Handler to cancel modal and return to place phase
  const cancelModalAndReturnToPlay = () => {
    // Restore the state from before the tile was placed
    if (stateBeforePlacement) {
      // Clear pending state
      setPendingTile(null);
      setPendingState(null);
      setShowConfirmation(false);

      // Restore the previous state
      handleStateUpdate(stateBeforePlacement);
      setStateBeforePlacement(null);
    }
  };

  useEffect(() => {
    console.log("Game state:", state.stage);
  }, [state]);

  return (
    <div className="space-y-4">
      {/* Your Turn Indicator - sticky at top */}
      {isMultiplayer && isMyTurn && state.stage === "play" && <YourTurnIndicator />}

      {/* Top row: Player cards and Game Log */}
      <div className="flex gap-4">
        {/* Player Summary */}
        <div className="flex-1">
          <PlayerSummary state={state} currentPlayerId={isMultiplayer ? playerId : undefined} />
          {/* {isMultiplayer ? (
            <PlayerSummary state={state} currentPlayerId={playerId} />
          ) : (
            <div className="bg-white rounded-lg shadow p-3">
              <PlayerStatusPanel state={state} />
            </div>
          )} */}
        </div>

        {/* Game Log - upper right corner */}
        <div className="w-80">
          <GameLog state={state} />
        </div>
      </div>

      <h2 className="font-semibold">Current: {cur.name}</h2>
      <Board
        board={state.board}
        onPlace={placeTile}
        startups={state.startups}
        currentHand={myPlayer?.hand || []}
        highlightedTile={pendingTile || selectedTile}
        players={state.players}
      />
      {myPlayer && <PlayerHand name={myPlayer.name} hand={myPlayer.hand} onSelect={handleTileSelection} selectedTile={selectedTile} />}

      {/* Tile placement confirmation modal */}
      {showConfirmation && pendingTile && (
        <TilePlacementConfirmModal
          tile={pendingTile}
          onConfirm={confirmTilePlacement}
          onCancel={cancelTilePlacement}
        />
      )}

      {/* Waiting overlay when it's not your turn in multiplayer */}
      {isMultiplayer && !isMyTurn && (
        <WaitingForPlayer
          playerName={cur.name}
          isConnected={cur.isConnected !== false}
        />
      )}

      {/* Only show modals if it's your turn in multiplayer, or always in singleplayer */}
      {/* Special case for draw stage: only first player executes in multiplayer */}
      {state.stage === "draw" && (!isMultiplayer || state.players[0]?.id === playerId) && (
        <DrawModal state={state} setState={handleStateUpdate} />
      )}

      {/* Other modals: only show if it's your turn */}
      {(!isMultiplayer || isMyTurn) && (
        <>
          {state.stage === "mergerPayout" && (
            <MergerPayoutModal state={state} onUpdate={handleStateUpdate} onCancel={cancelModalAndReturnToPlay} />
          )}
          {state.stage === "mergerLiquidation" && (
            <MergerLiquidationModal state={state} onUpdate={handleStateUpdate} />
          )}
          {state.stage === "foundStartup" && state.pendingFoundTile && (
            <FoundStartupModal
              state={state}
              foundingTile={state.pendingFoundTile}
              onUpdate={handleStateUpdate}
              onCancel={cancelModalAndReturnToPlay}
            />
          )}
          {state.stage === "buy" && (
            <BuyModal
              state={state}
              onUpdate={handleStateUpdate}
              onCancel={cancelModalAndReturnToPlay}
            />
          )}
        </>
      )}
    </div>
  );
}
