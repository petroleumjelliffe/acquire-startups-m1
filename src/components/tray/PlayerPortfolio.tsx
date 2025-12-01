import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameState, Player } from "../../state/gameTypes";
import { AVAILABLE_STARTUPS, getSharePrice } from "../../state/gameLogic";

interface PlayerPortfolioProps {
  state: GameState;
  player: Player;
}

interface HoldingInfo {
  id: string;
  shares: number;
  price: number;
  value: number;
  isFounded: boolean;
}

export const PlayerPortfolio: React.FC<PlayerPortfolioProps> = ({
  state,
  player,
}) => {
  // Build holdings info for all startups the player owns
  const holdings: HoldingInfo[] = AVAILABLE_STARTUPS
    .map((startup) => {
      const shares = player.portfolio[startup.id] || 0;
      const s = state.startups[startup.id];
      const price = s.isFounded ? getSharePrice(state, startup.id) : 0;
      return {
        id: startup.id,
        shares,
        price,
        value: shares * price,
        isFounded: s.isFounded,
      };
    })
    .filter((h) => h.shares > 0);

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs text-gray-500 font-medium">Your Stocks</div>
        <div className="text-xs text-gray-400 italic py-2">
          No stocks owned yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 font-medium">Your Stocks</div>
        <div className="text-xs text-gray-600">
          Value: <span className="font-semibold">${totalValue.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <AnimatePresence>
          {holdings.map((holding) => (
            <motion.div
              key={holding.id}
              layoutId={`portfolio-${holding.id}`}
              className={`
                relative w-14 h-18 rounded-lg border-2 shadow-sm
                startup-${holding.id}
                ${!holding.isFounded ? "opacity-60" : ""}
              `}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              {/* Stack effect for multiple shares */}
              {holding.shares > 1 && (
                <div
                  className={`absolute -top-0.5 -right-0.5 w-full h-full rounded-lg border-2 startup-${holding.id} opacity-40`}
                  style={{ zIndex: -1 }}
                />
              )}
              {holding.shares > 3 && (
                <div
                  className={`absolute -top-1 -right-1 w-full h-full rounded-lg border-2 startup-${holding.id} opacity-20`}
                  style={{ zIndex: -2 }}
                />
              )}

              <div className="h-full flex flex-col items-center justify-between p-1">
                {/* Company name */}
                <div className="font-semibold text-[9px] leading-tight text-center">
                  {holding.id}
                </div>

                {/* Share count badge */}
                <div className="bg-black/20 rounded-full px-1.5 py-0.5">
                  <span className="font-bold text-[10px]">
                    ×{holding.shares}
                  </span>
                </div>

                {/* Value */}
                <div className="text-[8px] opacity-75">
                  ${holding.value.toLocaleString()}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PlayerPortfolio;
