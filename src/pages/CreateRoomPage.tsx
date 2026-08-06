import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRandomEmojiName } from '../utils/emojiNames';
import { getConnection, type Connection } from '../net/connection';
import { rememberName, saveIdentity } from '../net/identity';

export interface CreateRoomPageProps {
  /** Injectable for tests. The app never passes it. */
  connect?: () => Connection;
}

export function CreateRoomPage({ connect = getConnection }: CreateRoomPageProps) {
  const navigate = useNavigate();
  const connection = connect();
  const [name, setName] = useState(getRandomEmojiName);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The name at the moment the request was sent, not at the moment the answer
  // arrives — the field is still editable in between.
  const sentName = useRef('');

  useEffect(() => {
    const offJoined = connection.onJoined((msg) => {
      saveIdentity(msg.roomId, { playerId: msg.playerId, token: msg.token, name: sentName.current });
      navigate(`/room/${msg.roomId}`);
    });
    // Without this, a server that is down or slow left `waiting` latched
    // forever — a permanently disabled "Creating…" button with no way out.
    // `JoinRoomPage` already clears its equivalent on a rejection; this is
    // that same fix, carried across.
    const offRejected = connection.transport.onRejected((msg) => {
      setError(msg.message);
      setWaiting(false);
    });
    return () => { offJoined(); offRejected(); };
  }, [connection, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <form
        className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '') return;
          sentName.current = trimmed;
          rememberName(trimmed);
          setError(null);
          setWaiting(true);
          connection.createRoom(trimmed);
        }}
      >
        <h1 className="mb-6 text-center text-2xl font-bold">Create a room</h1>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2"
          />
        </label>

        {error && (
          <p role="alert" className="mb-4 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={waiting || name.trim() === ''}
          className="m-0 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {waiting ? 'Creating…' : 'Create room'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/online')}
          className="m-0 mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Back
        </button>
      </form>
    </div>
  );
}
