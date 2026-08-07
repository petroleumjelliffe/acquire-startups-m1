// src/pages/PassAndPlayPage.tsx
// The lobby half of the pass-and-play route split.
//
// This page owns the decision the design gives it: nothing saved → setup;
// save present → setup plus the Continue card; save stale → setup plus one
// line saying so. The game itself lives at /pass-and-play/game, which mounts
// from the save — so starting a game here means writing the initial state and
// navigating, and "new game" and "resumed game" arrive at the board the same
// way. That initial write is also what makes a refresh during the *first*
// turn return to the deal rather than to a dead route.

import { useNavigate } from 'react-router-dom';
import { LocalSetupScreen } from '../game/setup/LocalSetupScreen';
import { createGameSession } from '../../session/GameSession';
import { load, loadFailure, save } from '../game/local/localSave';

/** `Last played: 2 days ago` — the Continue card's line, from `savedAt`. */
function lastPlayed(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60_000));
  if (minutes < 1) return 'Last played: just now';
  if (minutes < 60) return `Last played: ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last played: ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `Last played: ${days} day${days === 1 ? '' : 's'} ago`;
}

export function PassAndPlayPage() {
  const navigate = useNavigate();
  const saved = load();
  const failure = loadFailure();

  const start = (config: { seed: string; names: string[] }) => {
    // The session is built only to deal the opening state; the game route
    // rebuilds its own from the save. One mount path over there is worth one
    // throwaway construction here.
    save(createGameSession(config).getView().state);
    navigate('game');
  };

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

        {failure === 'stale' && (
          // Named, not silent: the failure mode being designed out is a save
          // that quietly vanished, indistinguishable from never having
          // existed. The bytes stay until New Game overwrites them.
          <p data-testid="stale-save" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            A saved game from an older version can&rsquo;t be continued.
          </p>
        )}

        {saved && (
          <section data-testid="continue-card" className="mb-4 rounded-xl bg-white p-4 shadow">
            <h2 className="font-bold">Game in progress</h2>
            <p className="text-sm text-gray-600">
              {saved.state.players.map((p) => `${p.emoji} ${p.name}`).join(', ')}
            </p>
            <p className="text-xs text-gray-500">{lastPlayed(saved.savedAt)}</p>
            <button
              type="button"
              onClick={() => navigate('game')}
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </section>
        )}

        <LocalSetupScreen onStart={start} />
      </div>
    </div>
  );
}
