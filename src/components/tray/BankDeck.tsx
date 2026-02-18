import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameState } from "../../state/gameTypes";
import { AVAILABLE_STARTUPS, getSharePrice } from "../../state/gameLogic";

interface BankDeckProps {
  state: GameState;
  playerCash: number;
  selectedShares: Array<{ id: string; price: number }>;
  onSelectShare: (startupId: string, price: number) => void;
  disabled?: boolean;
}

type StockPileState = "unfounded" | "active" | "empty" | "unaffordable";

interface StockPileInfo {
  id: string;
  tier: number;
  isFounded: boolean;
  availableShares: number;
  price: number;
  state: StockPileState;
  selectedCount: number;
}

export const BankDeck: React.FC<BankDeckProps> = ({
  state,
  playerCash,
  selectedShares,
  onSelectShare,
  disabled = false,
}) => {
  // Count how many of each startup are currently selected
  const selectedCounts = selectedShares.reduce((counts, share) => {
    counts[share.id] = (counts[share.id] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  // Calculate remaining cash after selections
  const totalSelectedCost = selectedShares.reduce((sum, s) => sum + s.price, 0);
  const remainingCash = playerCash - totalSelectedCost;

  // Build stock pile info for all startups
  const stockPiles: StockPileInfo[] = AVAILABLE_STARTUPS.map((startup) => {
    const s = state.startups[startup.id];
    const price = s.isFounded ? getSharePrice(state, startup.id) : 0;
    const selectedCount = selectedCounts[startup.id] || 0;
    const effectiveAvailable = s.availableShares - selectedCount;

    let pileState: StockPileState;
    if (!s.isFounded) {
      pileState = "unfounded";
    } else if (effectiveAvailable <= 0) {
      pileState = "empty";
    } else if (price > remainingCash) {
      pileState = "unaffordable";
    } else {
      pileState = "active";
    }

    return {
      id: startup.id,
      tier: startup.tier,
      isFounded: s.isFounded,
      availableShares: s.availableShares,
      price,
      state: pileState,
      selectedCount,
    };
  });

  const handleClick = (pile: StockPileInfo) => {
    if (disabled) return;
    if (pile.state !== "active") return;
    if (selectedShares.length >= 3) return;

    onSelectShare(pile.id, pile.price);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-gray-500 font-medium mb-1">Bank</div>
      <div className="flex gap-2">
        <AnimatePresence>
          {stockPiles.map((pile) => (
            <motion.button
              key={pile.id}
              layoutId={`bank-${pile.id}`}
              onClick={() => handleClick(pile)}
              disabled={disabled || pile.state !== "active" || selectedShares.length >= 3}
              className={`
                relative w-16 h-20 rounded-lg border-2 shadow-sm
                transition-all duration-200
                ${pile.state === "active" && !disabled && selectedShares.length < 3
                  ? "cursor-pointer hover:shadow-md hover:-translate-y-1"
                  : "cursor-not-allowed"
                }
                ${pile.state === "unfounded" || pile.state === "empty" || pile.state === "unaffordable"
                  ? "opacity-40 grayscale"
                  : ""
                }
                startup-${pile.id}
              `}
              whileHover={pile.state === "active" && !disabled ? { scale: 1.05 } : {}}
              whileTap={pile.state === "active" && !disabled ? { scale: 0.95 } : {}}
            >
              {/* Stack effect for available shares */}
              {pile.availableShares > 0 && pile.isFounded && (
                <>
                  <div className="absolute -top-0.5 -right-0.5 w-full h-full rounded-lg border-2 opacity-30 startup-${pile.id}" style={{ zIndex: -1 }} />
                  {pile.availableShares > 5 && (
                    <div className="absolute -top-1 -right-1 w-full h-full rounded-lg border-2 opacity-20 startup-${pile.id}" style={{ zIndex: -2 }} />
                  )}
                </>
              )}

              <div className="h-full flex flex-col items-center justify-between p-1.5">
                {/* Company name */}
                <div className="text-center flex-1 flex items-center">
                  <div className="font-semibold text-[10px] leading-tight">
                    {pile.id}
                  </div>
                </div>

                {/* Status info */}
                <div className="text-center w-full">
                  {pile.isFounded ? (
                    <>
                      <div className="text-[9px] opacity-75">
                        {pile.availableShares - pile.selectedCount} left
                      </div>
                      <div className="font-bold text-xs">
                        ${pile.price}
                      </div>
                    </>
                  ) : (
                    <div className="text-[9px] opacity-75">
                      Not founded
                    </div>
                  )}
                </div>
              </div>

              {/* State indicator badge */}
              {pile.state === "empty" && pile.isFounded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                  <span className="text-[8px] font-bold text-white bg-black/50 px-1 rounded">
                    SOLD OUT
                  </span>
                </div>
              )}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BankDeck;
