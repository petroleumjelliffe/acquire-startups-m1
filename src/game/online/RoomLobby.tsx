import type { RosterMessage } from '../../../session/protocol';
import { PLAYER_EMOJI } from '../../../engine/startups';

export interface RoomLobbyProps {
  roomId: string;
  players: RosterMessage['players'];
  /** Whose row gets the name field. The design gives it to nobody else. */
  myPlayerId: string | null;
  /** Only the host may start, which is the server's rule too. */
  isHost: boolean;
  /** A refusal that arrived while sitting here — shown, not navigated away from. */
  note?: string | null;
  onStart: () => void;
  /** Rename your own seat. Sent on blur or Enter, not per keystroke. */
  onRename: (name: string) => void;
  /** Give up your own seat — the `Leave` button, which is now the only way. */
  onLeaveSeat: () => void;
}

export function RoomLobby({
  roomId, players, myPlayerId, isHost, note, onStart, onRename, onLeaveSeat,
}: RoomLobbyProps) {
  const enough = players.length >= 2;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold">New Room</h1>
        <p className="mb-6 text-center text-sm text-gray-600">Share this code with other players</p>

        <div
          data-testid="room-code"
          className="mb-6 rounded-lg bg-gray-100 py-4 text-center text-3xl font-bold tracking-[0.3em]"
        >
          {roomId}
        </div>

        <ul className="mb-6 flex flex-col gap-2">
          {players.map((p, seat) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              {/* The chip the design draws, derived rather than invented: the
                  engine assigns PLAYER_EMOJI by seat at startGame, so the
                  lobby shows each player the face the game is about to give
                  them. The presence dot stays — it is Phase 4 information the
                  design predates. */}
              <span aria-hidden className="flex-none text-base leading-none">
                {PLAYER_EMOJI[seat] ?? '•'}
              </span>
              <span
                aria-hidden
                className={`h-2 w-2 flex-none rounded-full ${p.connected ? 'bg-green-500' : 'bg-gray-300'}`}
              />
              {p.id === myPlayerId ? (
                // Your row and only yours: the field. Committed on blur or
                // Enter rather than per keystroke, so the room is not
                // broadcast every letter of a half-typed name.
                //
                // The mockup also draws a × here. It was dropped (owner,
                // 2026-08-07): `Leave`, directly below this list, already
                // vacates your seat, and on the host's row a × read as
                // "boot yourself".
                <input
                  aria-label="Your name"
                  defaultValue={p.name}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== '' && next !== p.name) onRename(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 font-semibold"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              )}
              {p.isHost && <span className="flex-none text-xs uppercase tracking-wide text-gray-500">host</span>}
            </li>
          ))}
        </ul>

        {note && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {note}
          </div>
        )}

        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!enough}
            className="m-0 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {enough ? 'Start game' : 'Waiting for another player'}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-600">Waiting for the host to start.</p>
        )}

        <button
          type="button"
          onClick={onLeaveSeat}
          className="m-0 mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
