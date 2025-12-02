import React from "react";
import { motion } from "framer-motion";
import { GameState, Player } from "../../state/gameTypes";

interface PlayerRibbonProps {
  state: GameState;
  currentPlayer: Player;
  myPlayer?: Player;
  isExpanded: boolean;
  onToggle: () => void;
  isMultiplayer: boolean;
}

// Simple avatar component with initials
const PlayerAvatar: React.FC<{
  name: string;
  isCurrentTurn: boolean;
  isYou: boolean;
  isConnected?: boolean;
}> = ({ name, isCurrentTurn, isYou, isConnected = true }) => {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative">
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
          transition-all duration-200
          ${isCurrentTurn
            ? "bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-1"
            : "bg-gray-200 text-gray-600"
          }
          ${!isConnected ? "opacity-50" : ""}
        `}
      >
        {initials}
      </div>
      {isYou && (
        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white" />
      )}
      {isCurrentTurn && (
        <motion.div
          className="absolute -top-0.5 -left-0.5 w-9 h-9 rounded-full border-2 border-blue-400"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
};

export const PlayerRibbon: React.FC<PlayerRibbonProps> = ({
  state,
  currentPlayer,
  myPlayer,
  isExpanded,
  onToggle,
  isMultiplayer,
}) => {
  const displayPlayer = myPlayer || currentPlayer;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
      {/* Player order */}
      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-500 mr-1">Turn:</div>
        {state.players.map((player, idx) => (
          <div key={player.id} className="flex items-center">
            <PlayerAvatar
              name={player.name}
              isCurrentTurn={idx === state.turnIndex}
              isYou={isMultiplayer && player.id === myPlayer?.id}
              isConnected={player.isConnected !== false}
            />
            {idx < state.players.length - 1 && (
              <div className="mx-1 text-gray-300">›</div>
            )}
          </div>
        ))}
      </div>

      {/* Cash display */}
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">Cash: </span>
          <span className="font-bold text-green-600">
            ${displayPlayer.cash.toLocaleString()}
          </span>
        </div>

        {/* Expand/collapse toggle */}
        <motion.button
          onClick={onToggle}
          className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title={isExpanded ? "Collapse tray" : "Expand tray"}
        >
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <polyline points="18 15 12 9 6 15" />
          </motion.svg>
        </motion.button>
      </div>
    </div>
  );
};

export default PlayerRibbon;
