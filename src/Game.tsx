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
import { WaitingForPlayer } from "./components/WaitingForPlayer";
import { useSocket } from "./context/SocketContext";
import { clearGameSession } from "./utils/gameSession";
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
  const cur = state.players[state.turnIndex];
  const isMyTurn = isMultiplayer ? cur.id === playerId : true;

  // In multiplayer, find your own player (not necessarily the current turn player)
  const myPlayer = isMultiplayer
    ? state.players.find(p => p.id === playerId)
    : cur;

  // Listen for game state updates from server (multiplayer only)
  useEffect(() => {
    if (!socket || !isMultiplayer) return;

    const handleGameState = (newState: GameState) => {
      console.log('📥 Received game state update from server');
      setState(newState);
    };

    const handleGameEnded = () => {
      console.log('🏁 Game has ended - clearing session');
      clearGameSession();
    };

    socket.on('gameState', handleGameState);
    socket.on('gameEnded', handleGameEnded);

    return () => {
      socket.off('gameState', handleGameState);
      socket.off('gameEnded', handleGameEnded);
    };
  }, [socket, isMultiplayer]);

  const placeTile = (coord: Coord) => {
    if (state.stage !== "play") return;
    if (isMultiplayer && !isMyTurn) return; // Prevent action if not your turn

    const next = handleTilePlacement(state, coord);

    if (isMultiplayer && socket) {
      // Send to server instead of updating locally
      socket.emit('tilePlacement', {
        gameId: state.gameId,
        playerId,
        coord,
        newState: next
      });
    } else {
      // Singleplayer: update locally
      setState({ ...next });
    }
  };

  // Generic state update handler for multiplayer
  const handleStateUpdate = (newState: GameState) => {
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

  // End game manually (host only)
  const handleEndGame = () => {
    if (!isMultiplayer || !socket) return;

    if (window.confirm('Are you sure you want to end this game? This cannot be undone.')) {
      socket.emit('endGame', {
        gameId: state.gameId,
        playerId
      }, (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          alert(response.error || 'Failed to end game');
        }
      });
    }
  };

  useEffect(() => {
    console.log("Game state:", state.stage);

    // Clear game session when game ends (multiplayer only)
    if (isMultiplayer && state.stage === "end") {
      clearGameSession();
      console.log("Game ended, session cleared");
    }
  }, [state, isMultiplayer]);

  // Check if current player is host (first player)
  const isHost = isMultiplayer && state.players[0]?.id === playerId;

  return (
    <div className="space-y-4">
      {/* Player Summary for multiplayer */}
      {isMultiplayer && <PlayerSummary state={state} currentPlayerId={playerId} />}

      {/* End Game button for host */}
      {isHost && state.stage !== "end" && (
        <div className="flex justify-end">
          <button
            onClick={handleEndGame}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            End Game
          </button>
        </div>
      )}

      {/* Game ended message */}
      {state.stage === "end" && (
        <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-yellow-800 mb-2">Game Ended</h2>
          <p className="text-yellow-700">
            {isMultiplayer ? "This game has ended. You can close this page." : "Game Over!"}
          </p>
        </div>
      )}

      <h2 className="font-semibold">Current: {cur.name}</h2>
      <Board
        board={state.board}
        onPlace={placeTile}
        startups={state.startups}
        currentHand={myPlayer?.hand || []}
      />
      {myPlayer && <PlayerHand name={myPlayer.name} hand={myPlayer.hand} onPlace={placeTile} />}
      <GameLog state={state} />

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
            <MergerPayoutModal state={state} onUpdate={handleStateUpdate} />
          )}
          {state.stage === "mergerLiquidation" && (
            <MergerLiquidationModal state={state} onUpdate={handleStateUpdate} />
          )}
          {state.stage === "foundStartup" && state.pendingFoundTile && (
            <FoundStartupModal
              state={state}
              foundingTile={state.pendingFoundTile}
              onUpdate={handleStateUpdate}
            />
          )}
          {state.stage === "buy" && <BuyModal state={state} onUpdate={handleStateUpdate} />}
        </>
      )}
    </div>
  );
}
