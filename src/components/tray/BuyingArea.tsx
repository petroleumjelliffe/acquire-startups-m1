import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SelectedShare {
  id: string;
  price: number;
}

interface BuyingAreaProps {
  selectedShares: SelectedShare[];
  onRemoveShare: (index: number) => void;
  onConfirm: () => void;
  onSkip: () => void;
  totalCost: number;
  remainingCash: number;
  disabled?: boolean;
}

export const BuyingArea: React.FC<BuyingAreaProps> = ({
  selectedShares,
  onRemoveShare,
  onConfirm,
  onSkip,
  totalCost,
  remainingCash,
  disabled = false,
}) => {
  const canConfirm = selectedShares.length > 0 && remainingCash >= 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 font-medium">Buying ({selectedShares.length}/3)</div>
        {selectedShares.length > 0 && (
          <div className={`text-xs font-semibold ${remainingCash < 0 ? "text-red-600" : "text-green-600"}`}>
            Total: ${totalCost.toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex gap-2 items-center">
        {/* 3 slots */}
        {[0, 1, 2].map((slotIndex) => {
          const share = selectedShares[slotIndex];
          return share ? (
            <motion.button
              key={`slot-${slotIndex}`}
              layoutId={`buying-${slotIndex}-${share.id}`}
              onClick={() => !disabled && onRemoveShare(slotIndex)}
              disabled={disabled}
              className={`
                relative w-16 h-20 rounded-lg border-2 shadow-sm
                transition-all duration-200
                startup-${share.id}
                ${!disabled ? "cursor-pointer hover:shadow-md hover:scale-105" : "cursor-not-allowed"}
              `}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              whileHover={!disabled ? { scale: 1.05 } : {}}
              whileTap={!disabled ? { scale: 0.95 } : {}}
            >
              <div className="h-full flex flex-col items-center justify-between p-1.5">
                <div className="text-center flex-1 flex items-center">
                  <div className="font-semibold text-[10px] leading-tight">
                    {share.id}
                  </div>
                </div>
                <div className="font-bold text-xs">
                  ${share.price}
                </div>
              </div>
              {/* Tap to remove indicator */}
              {!disabled && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/30 rounded-lg transition-opacity">
                  <span className="text-white text-xs font-bold">✕</span>
                </div>
              )}
            </motion.button>
          ) : (
            <motion.div
              key={`empty-slot-${slotIndex}`}
              className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
            >
              <span className="text-gray-400 text-[10px]">
                {slotIndex + 1}
              </span>
            </motion.div>
          );
        })}

        {/* Action buttons */}
        <div className="flex flex-col gap-1 ml-2">
          <motion.button
            onClick={onConfirm}
            disabled={disabled || !canConfirm}
            className={`
              px-3 py-1.5 rounded text-xs font-semibold transition-colors
              ${canConfirm && !disabled
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }
            `}
            whileHover={canConfirm && !disabled ? { scale: 1.02 } : {}}
            whileTap={canConfirm && !disabled ? { scale: 0.98 } : {}}
          >
            Buy
          </motion.button>
          <motion.button
            onClick={onSkip}
            disabled={disabled}
            className={`
              px-3 py-1.5 rounded text-xs font-medium transition-colors
              border border-gray-300
              ${!disabled
                ? "hover:bg-gray-100 text-gray-600"
                : "text-gray-400 cursor-not-allowed"
              }
            `}
            whileHover={!disabled ? { scale: 1.02 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
          >
            Skip
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default BuyingArea;
