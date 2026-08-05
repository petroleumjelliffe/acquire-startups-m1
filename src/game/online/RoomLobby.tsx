import type { RosterMessage } from '../../../session/protocol';

export interface RoomLobbyProps {
  roomId: string;
  players: RosterMessage['players'];
  /** Only the host may start, which is the server's rule too. */
  isHost: boolean;
  /** A refusal that arrived while sitting here — shown, not navigated away from. */
  note?: string | null;
  onStart: () => void;
  onExit: () => void;
}

export function RoomLobby({ roomId, players, isHost, note, onStart, onExit }: RoomLobbyProps) {
  const enough = players.length >= 2;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold">Room</h1>
        <p className="mb-6 text-center text-sm text-gray-600">Share this code to let people in</p>

        <div
          data-testid="room-code"
          className="mb-6 rounded-lg bg-gray-100 py-4 text-center text-3xl font-bold tracking-[0.3em]"
        >
          {roomId}
        </div>

        <ul className="mb-6 flex flex-col gap-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${p.connected ? 'bg-green-500' : 'bg-gray-300'}`}
              />
              <span className="font-semibold">{p.name}</span>
              {p.isHost && <span className="text-xs uppercase tracking-wide text-gray-500">host</span>}
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
            {enough ? 'Start game' : 'Waiting for one more player'}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-600">Waiting for the host to start.</p>
        )}

        <button
          type="button"
          onClick={onExit}
          className="m-0 mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
