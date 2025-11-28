// src/pages/PassAndPlayPage.tsx
// Pass-and-play mode setup and game

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SetupScreen } from '../components/SetupScreen';
import { Game } from '../Game';

export function PassAndPlayPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<{
    seed: string;
    names: string[];
  } | null>(null);

  const handleStart = (seed: string, names: string[]) => {
    setConfig({ seed, names });
  };

  const handleBack = () => {
    if (config) {
      // If in game, confirm before going back
      if (window.confirm('Are you sure you want to quit this game?')) {
        setConfig(null);
      }
    } else {
      // If in setup, just navigate back
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {!config ? (
        <div className="max-w-md mx-auto">
          <div className="mb-4">
            <button
              onClick={handleBack}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ← Back
            </button>
          </div>
          <SetupScreen
            defaultSeed="scaffold-seed"
            defaultPlayers="Dad, Maya, Nina, Monty, Baby Cat, Ricky Boy"
            onStart={handleStart}
          />
        </div>
      ) : (
        <Game
          seed={config.seed}
          playerNames={config.names}
          isMultiplayer={false}
        />
      )}
    </div>
  );
}
