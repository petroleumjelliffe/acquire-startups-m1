import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { Game } from "./Game";
import { SetupScreen } from "./components/SetupScreen";
import { WaitingRoom } from "./components/WaitingRoom";
import type { GameState } from "./state/gameTypes";

type AppMode = 'singleplayer' | 'multiplayer';

function ModeSelection({ onSelectMode }: { onSelectMode: (mode: AppMode) => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[500px] max-w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Acquire</h1>
        <div className="space-y-3">
          <button
            onClick={() => onSelectMode('multiplayer')}
            className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-lg"
          >
            🌐 Multiplayer (Online)
          </button>
          <button
            onClick={() => onSelectMode('singleplayer')}
            className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg"
          >
            🖥️ Singleplayer (Local)
          </button>
        </div>
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Multiplayer: Play with friends online</p>
          <p>Singleplayer: Hot-seat on one computer</p>
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
