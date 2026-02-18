import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coord, compareTiles } from "../../utils/gameHelpers";

interface TileHandProps {
  hand: Coord[];
  selectedTile: Coord | null;
  onSelect: (coord: Coord) => void;
  disabled?: boolean;
}

export const TileHand: React.FC<TileHandProps> = ({
  hand,
  selectedTile,
  onSelect,
  disabled = false,
}) => {
  const sortedHand = [...hand].sort(compareTiles);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-gray-500 font-medium">Your Tiles</div>
      <div className="flex gap-1.5">
        <AnimatePresence mode="popLayout">
          {sortedHand.map((coord) => {
            const isSelected = selectedTile === coord;
            return (
              <motion.button
                key={coord}
                layoutId={`tile-${coord}`}
                onClick={() => !disabled && onSelect(coord)}
                disabled={disabled}
                className={`
                  w-10 h-10 rounded-md border-2 font-bold text-sm
                  transition-all duration-200
                  ${isSelected
                    ? "bg-blue-500 text-white border-blue-600 shadow-lg -translate-y-1"
                    : "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50"
                  }
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                whileHover={!disabled ? { scale: 1.05 } : {}}
                whileTap={!disabled ? { scale: 0.95 } : {}}
              >
                {coord}
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* Empty slots for missing tiles */}
        {Array.from({ length: Math.max(0, 6 - hand.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-md border-2 border-dashed border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    </div>
  );
};

export default TileHand;
