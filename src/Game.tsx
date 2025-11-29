import React, { useState } from "react";
import type { GameState } from "./state/gameTypes";
import { createInitialGame } from "./state/gameInit";
import { handleTilePlacement, completeSurvivorSelection } from "./state/gameLogic";
import { Board } from "./components/Board";
import { PlayerHand } from "./components/PlayerHand";
import { GameLog } from "./components/GameLog";
import { Coord } from "./utils/gameHelpers";
import { DrawModal } from "./components/DrawModal";
import { BuyModal } from "./components/BuyModal";
import { MergerPayoutModal, FoundStartupModal } from "./components"; //barrelfile
import { MergerLiquidationModal } from "./components/MergerLiquidation";
import { SurvivorSelectionModal } from "./components/SurvivorSelectionModal";
import { PlayerSummary } from "./components/PlayerSummary";
import { PlayerStatusPanel } from "./components/PlayerStatusPanel";
import { WaitingForPlayer } from "./components/WaitingForPlayer";
import { YourTurnIndicator } from "./components/YourTurnIndicator";
import { TilePlacementConfirmModal } from "./components/TilePlacementConfirmModal";
import { useSocket } from "./context/SocketContext";
import { clearGameSession, getGameSession } from "./utils/gameSession";
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

  // Check if current user is a spectator
  const session = getGameSession();
  const isSpectator = isMultiplayer && session?.isSpectator === true;

  const cur = state.players[state.turnIndex];
  const isMyTurn = isMultiplayer ? (cur.id === playerId && !isSpectator) : true;

  // In multiplayer, find your own player (not necessarily the current turn player)
  // Spectators don't have a player in the game
  const myPlayer = isMultiplayer
    ? (isSpectator ? null : state.players.find(p => p.id === playerId))
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

    // MULTIPLAYER MODE: Click to play directly (hand preview shows where you can click)
    if (isMultiplayer) {
      // Must be a tile in your hand
      if (!player.hand.includes(coord)) return;

      // Store a snapshot of the state before placement for potential cancellation
      setStateBeforePlacement(structuredClone(state));

      // Calculate the next state (commits tile placement but not hand removal/draw)
      const next = handleTilePlacement(state, coord);

      // Store pending placement and show highlight
      setPendingTile(coord);
      setPendingState(next);

      // Show confirmation for isolated tiles, or let modal handle confirmation for other actions
      if (next.stage === "buy" && !next.pendingFoundTile && !next.mergerContext) {
        // Isolated tile placement - show confirmation
        setShowConfirmation(true);
      } else {
        // Founding, expansion, or merger - show the respective modal
        applyTilePlacement(next);
      }
    }
    // PASS-AND-PLAY MODE: Must select from hand first, then click on board
    else {
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
      if (next.stage === "buy" && !next.pendingFoundTile && !next.mergerContext) {
        // Isolated tile placement - show confirmation
        setShowConfirmation(true);
      } else {
        // Founding, expansion, or merger - show the respective modal
        applyTilePlacement(next);
      }
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

  // Check if current player is host (first player) and not a spectator
  const isHost = isMultiplayer && !isSpectator && state.players[0]?.id === playerId;

  return (
    <div className="space-y-4">
      {/* Spectator Mode Banner */}
      {isSpectator && (
        <div className="sticky top-0 z-50 p-3 bg-purple-600 text-white text-center font-semibold shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <span>👁️ Spectator Mode</span>
            {(state as any).spectators && (
              <span className="text-purple-200 text-sm">
                • {(state as any).spectators.length} spectator{(state as any).spectators.length !== 1 ? 's' : ''} watching
              </span>
            )}
          </div>
        </div>
      )}

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
        highlightedTile={pendingTile || selectedTile}
        players={state.players}
        showHandPreviews={isMultiplayer}
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
      {isMultiplayer && (() => {
        // During mergerLiquidation, show waiting screen if not the current liquidator
        if (state.stage === "mergerLiquidation") {
          const currentLiquidationPlayerId = state.mergerContext?.shareholderQueue[
            state.mergerContext?.currentShareholderIndex ?? 0
          ];
          const currentLiquidator = state.players.find(p => p.id === currentLiquidationPlayerId);

          if (playerId !== currentLiquidationPlayerId) {
            return (
              <WaitingForPlayer
                playerName={currentLiquidator?.name || "player"}
                isConnected={currentLiquidator?.isConnected !== false}
              />
            );
          }
          return null;
        }

        // During other stages, show waiting screen if not your turn
        if (!isMyTurn) {
          return (
            <WaitingForPlayer
              playerName={cur.name}
              isConnected={cur.isConnected !== false}
            />
          );
        }

        return null;
      })()}

      {/* Only show modals if it's your turn in multiplayer, or always in singleplayer */}
      {/* Special case for draw stage: only first player executes in multiplayer */}
      {state.stage === "draw" && (!isMultiplayer || state.players[0]?.id === playerId) && (
        <DrawModal state={state} setState={handleStateUpdate} />
      )}

      {/* Merger Payout: Show to all players in multiplayer (only host can dismiss) */}
      {state.stage === "mergerPayout" && (
        <MergerPayoutModal
          state={state}
          onUpdate={handleStateUpdate}
          onCancel={cancelModalAndReturnToPlay}
          isReadOnly={isMultiplayer && !isHost}
          currentPlayerName={isMultiplayer ? (isHost ? undefined : state.players[0]?.name) : undefined}
        />
      )}

      {/* Merger Liquidation: Show only to the current liquidating player */}
      {state.stage === "mergerLiquidation" && (() => {
        const currentLiquidationPlayerId = state.mergerContext?.shareholderQueue[
          state.mergerContext?.currentShareholderIndex ?? 0
        ];
        const shouldShow = isMultiplayer
          ? playerId === currentLiquidationPlayerId
          : isMyTurn;

        return shouldShow && (
          <MergerLiquidationModal state={state} onUpdate={handleStateUpdate} />
        );
      })()}

      {/* Other modals: only show if it's your turn */}
      {(!isMultiplayer || isMyTurn) && (
        <>
          {state.stage === "foundStartup" && state.pendingFoundTile && (
            <FoundStartupModal
              state={state}
              foundingTile={state.pendingFoundTile}
              onUpdate={handleStateUpdate}
              onCancel={cancelModalAndReturnToPlay}
            />
          )}
          {state.stage === "chooseSurvivor" && state.pendingTiedStartups && state.pendingMergerTile && (
            <SurvivorSelectionModal
              state={state}
              tiedStartupIds={state.pendingTiedStartups}
              placedTile={state.pendingMergerTile}
              onSelect={(survivorId) => {
                const newState = structuredClone(state);
                completeSurvivorSelection(newState, survivorId);
                handleStateUpdate(newState);
              }}
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
