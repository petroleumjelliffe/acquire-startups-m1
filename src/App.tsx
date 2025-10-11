import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { Game } from "./Game";
import { SetupScreen } from "./components/SetupScreen";
import { WaitingRoom } from "./components/WaitingRoom";
import type { GameState } from "./state/gameTypes";

type AppMode = 'singleplayer' | 'multiplayer';

function ModeSelection({ onSelectMode }: { onSelectMode: (mode: AppMode) => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[600px] max-w-full">
        <h1 className="text-3xl font-bold mb-2 text-center">Acquire</h1>
        <p className="text-center text-gray-600 mb-8">Choose your game mode</p>

        <div className="space-y-4">
          {/* Online Multiplayer */}
          <button
            onClick={() => onSelectMode('multiplayer')}
            className="w-full px-6 py-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">🌐</span>
              <div className="flex-1">
                <div className="font-bold text-xl mb-1">Online Multiplayer</div>
                <div className="text-blue-100 text-sm">
                  Each player joins from their own device. Share a room link to play together remotely.
                </div>
              </div>
            </div>
          </button>

          {/* Pass & Play */}
          <button
            onClick={() => onSelectMode('singleplayer')}
            className="w-full px-6 py-5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">🎮</span>
              <div className="flex-1">
                <div className="font-bold text-xl mb-1">Pass & Play</div>
                <div className="text-green-100 text-sm">
                  Everyone plays on this device. Pass it around after each turn (local hotseat).
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          Both modes support 2-6 players
        </div>
      </div>
    </div>
  );
}

function RoomRoute() {
  const { roomId } = useParams<{ roomId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {!gameState ? (
        <WaitingRoom
          onGameStart={setGameState}
          initialRoomId={roomId}
        />
      ) : (
        <Game
          seed={gameState.seed}
          playerNames={gameState.players.map(p => p.name)}
          initialState={gameState}
          isMultiplayer={true}
        />
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [config, setConfig] = useState<{
    seed: string;
    names: string[];
  } | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const navigate = useNavigate();

  // Handle game start from waiting room (multiplayer)
  const handleMultiplayerGameStart = (multiplayerGameState: GameState) => {
    setGameState(multiplayerGameState);
  };

  // Handle game start from setup screen (singleplayer)
  const handleSingleplayerStart = (seed: string, names: string[]) => {
    setConfig({ seed, names });
  };

  return (
    <Routes>
      {/* Direct room link - must come before catch-all */}
      <Route path="/room/:roomId" element={<RoomRoute />} />

      {/* Home page */}
      <Route path="/" element={
        <>
          {/* Mode selection screen */}
          {!mode && <ModeSelection onSelectMode={setMode} />}

          {/* Multiplayer flow */}
          {mode === 'multiplayer' && (
            <div className="min-h-screen bg-gray-50 p-6">
              {!gameState ? (
                <WaitingRoom onGameStart={handleMultiplayerGameStart} />
              ) : (
                <Game
                  seed={gameState.seed}
                  playerNames={gameState.players.map(p => p.name)}
                  initialState={gameState}
                  isMultiplayer={true}
                />
              )}
            </div>
          )}

          {/* Singleplayer flow */}
          {mode === 'singleplayer' && (
            <div className="min-h-screen bg-gray-50 p-6">
              {!config ? (
                <SetupScreen
                  defaultSeed="scaffold-seed"
                  defaultPlayers="Dad, Maya, Nina, Monty, Baby Cat, Ricky Boy"
                  onStart={handleSingleplayerStart}
                />
              ) : (
                <Game
                  seed={config.seed}
                  playerNames={config.names}
                  isMultiplayer={false}
                />
              )}
            </div>
          )}
        </>
      } />
    </Routes>
  );
}
