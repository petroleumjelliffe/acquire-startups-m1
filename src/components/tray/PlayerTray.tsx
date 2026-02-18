import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameState } from "../../state/gameTypes";
import { Coord } from "../../utils/gameHelpers";
import {
  buyShares,
  endBuyPhase,
  completeTileTransaction,
} from "../../state/gameLogic";
import { PlayerRibbon } from "./PlayerRibbon";
import { BankDeck } from "./BankDeck";
import { BuyingArea } from "./BuyingArea";
import { PlayerPortfolio } from "./PlayerPortfolio";
import { TileHand } from "./TileHand";

interface SelectedShare {
  id: string;
  price: number;
}

interface PlayerTrayProps {
  state: GameState;
  onUpdate: (newState: GameState) => void;
  isMultiplayer: boolean;
  playerId?: string;
  selectedTile: Coord | null;
  onTileSelect: (coord: Coord) => void;
  onCancel?: () => void;
}

export const PlayerTray: React.FC<PlayerTrayProps> = ({
  state,
  onUpdate,
  isMultiplayer,
  playerId,
  selectedTile,
  onTileSelect,
  onCancel,
}) => {
  // Local state for expansion and buy selections
  const [isExpanded, setIsExpanded] = useState(!isMultiplayer); // Collapsed by default in multiplayer
  const [selectedShares, setSelectedShares] = useState<SelectedShare[]>([]);
  const [isHandHidden, setIsHandHidden] = useState(!isMultiplayer); // Pass-and-play: hide hand between turns
  const [isPassingTurn, setIsPassingTurn] = useState(false);

  // Get player references
  const currentPlayer = state.players[state.turnIndex];
  const myPlayer = isMultiplayer
    ? state.players.find((p) => p.id === playerId)
    : currentPlayer;

  const isMyTurn = isMultiplayer ? currentPlayer.id === playerId : true;
  const isBuyPhase = state.stage === "buy";
  const isPlayPhase = state.stage === "play";

  // Reset selections when stage changes or turn changes
  useEffect(() => {
    setSelectedShares([]);
  }, [state.stage, state.turnIndex]);

  // In pass-and-play, hide hand when turn changes
  useEffect(() => {
    if (!isMultiplayer && isPlayPhase) {
      setIsHandHidden(true);
      setIsPassingTurn(true);
    }
  }, [state.turnIndex, isMultiplayer, isPlayPhase]);

  // Calculate costs
  const totalCost = selectedShares.reduce((sum, s) => sum + s.price, 0);
  const remainingCash = (myPlayer?.cash || 0) - totalCost;

  // Handlers
  const handleSelectShare = (startupId: string, price: number) => {
    if (selectedShares.length >= 3) return;
    setSelectedShares([...selectedShares, { id: startupId, price }]);
  };

  const handleRemoveShare = (index: number) => {
    setSelectedShares(selectedShares.filter((_, i) => i !== index));
  };

  const handleConfirmPurchase = () => {
    const newState = structuredClone(state);

    // Complete the tile transaction if needed
    completeTileTransaction(newState);

    // Group purchases by startup ID
    const purchases: Record<string, number> = {};
    for (const share of selectedShares) {
      purchases[share.id] = (purchases[share.id] || 0) + 1;
    }

    // Execute purchases
    for (const [id, count] of Object.entries(purchases)) {
      buyShares(newState, currentPlayer.id, id, count);
    }

    endBuyPhase(newState);
    onUpdate(newState);
    setSelectedShares([]);
  };

  const handleSkip = () => {
    const newState = structuredClone(state);

    // Complete the tile transaction if needed
    completeTileTransaction(newState);

    endBuyPhase(newState);
    onUpdate(newState);
    setSelectedShares([]);
  };

  const handleRevealHand = () => {
    setIsHandHidden(false);
    setIsPassingTurn(false);
  };

  // Don't render if no player
  if (!myPlayer) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <motion.div
        className="bg-white rounded-t-xl shadow-2xl border-t border-gray-200"
        initial={false}
        animate={{
          height: isExpanded ? "auto" : "auto",
        }}
      >
        {/* Ribbon - always visible */}
        <PlayerRibbon
          state={state}
          currentPlayer={currentPlayer}
          myPlayer={myPlayer}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          isMultiplayer={isMultiplayer}
        />

        {/* Pass-and-play: Pass to player overlay */}
        {!isMultiplayer && isPassingTurn && isPlayPhase && (
          <motion.div
            className="absolute inset-0 bg-white/95 rounded-t-xl flex flex-col items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-lg font-bold text-gray-800 mb-2">
              Pass to {currentPlayer.name}
            </div>
            <motion.button
              onClick={handleRevealHand}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              I'm {currentPlayer.name} - Reveal Hand
            </motion.button>
          </motion.div>
        )}

        {/* Collapsible content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-4">
                {/* Top row: Bank + Buying Area (only visible during buy phase) */}
                {isBuyPhase && isMyTurn && (
                  <div className="flex gap-6 items-start">
                    <BankDeck
                      state={state}
                      playerCash={currentPlayer.cash}
                      selectedShares={selectedShares}
                      onSelectShare={handleSelectShare}
                      disabled={!isMyTurn}
                    />

                    <div className="border-l border-gray-200 h-24" />

                    <BuyingArea
                      selectedShares={selectedShares}
                      onRemoveShare={handleRemoveShare}
                      onConfirm={handleConfirmPurchase}
                      onSkip={handleSkip}
                      totalCost={totalCost}
                      remainingCash={remainingCash}
                      disabled={!isMyTurn}
                    />
                  </div>
                )}

                {/* Divider */}
                {isBuyPhase && isMyTurn && (
                  <div className="border-t border-gray-100" />
                )}

                {/* Bottom row: Tile Hand + Portfolio */}
                <div className="flex gap-6 items-start">
                  {/* Tile Hand - visible during play phase or when not buy phase */}
                  {(!isHandHidden || isMultiplayer) && (
                    <TileHand
                      hand={myPlayer.hand}
                      selectedTile={selectedTile}
                      onSelect={onTileSelect}
                      disabled={!isMyTurn || !isPlayPhase}
                    />
                  )}

                  <div className="border-l border-gray-200 h-16 self-center" />

                  {/* Portfolio */}
                  <PlayerPortfolio state={state} player={myPlayer} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed summary - show when not expanded */}
        {!isExpanded && (
          <div className="px-4 py-2 flex items-center gap-4 text-sm text-gray-600">
            <span>{myPlayer.hand.length} tiles</span>
            <span>•</span>
            <span>
              {Object.values(myPlayer.portfolio).reduce((a, b) => a + b, 0)} stocks
            </span>
            {isBuyPhase && isMyTurn && (
              <>
                <span>•</span>
                <span className="text-blue-600 font-medium">Buy Phase</span>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PlayerTray;
