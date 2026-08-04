// src/pages/PassAndPlayPage.tsx
// Pass-and-play on the Phase 2a stack.
//
// `Game.tsx`, `SetupScreen` and the modal family are deliberately left in
// place: `RoomPage` still serves online play from them, so they cannot be
// deleted until Phase 3/5 replaces the online screen. This route simply
// stops using them.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalSetupScreen } from '../game/setup/LocalSetupScreen';
import { GameScreen } from '../game/GameScreen';
import { createGameSession } from '../game/session/GameSession';

export function PassAndPlayPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<{ seed: string; names: string[] } | null>(null);

  // One session per game. Recreating it on every render would throw the
  // snapshot store away, taking undo with it.
  const session = useMemo(
    () => (config ? createGameSession({ seed: config.seed, names: config.names }) : null),
    [config],
  );

  if (session) {
    return (
      <GameScreen
        session={session}
        // Dropping the config drops the session and its snapshot store with
        // it — a genuine fresh game rather than a rewound one. Replaying a
        // seed is what the setup screen's Advanced field is for.
        onNewGame={() => setConfig(null)}
        onExit={() => navigate('/')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="m-0 mb-4 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          ← Back
        </button>
        <LocalSetupScreen onStart={setConfig} />
      </div>
    </div>
  );
}
