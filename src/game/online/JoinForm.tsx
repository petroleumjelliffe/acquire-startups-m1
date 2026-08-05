import { useState } from 'react';
import { getRandomEmojiName } from '../../utils/emojiNames';

export interface JoinFormProps {
  /** Fixed when the room is already known (a shared link); editable otherwise. */
  roomId?: string;
  title: string;
  submitLabel: string;
  error?: string | null;
  onSubmit(name: string, roomId: string): void;
}

export function JoinForm({ roomId, title, submitLabel, error, onSubmit }: JoinFormProps) {
  const [name, setName] = useState(getRandomEmojiName);
  const [code, setCode] = useState(roomId ?? '');

  const ready = name.trim() !== '' && code.trim() !== '';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <form
        className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit(name.trim(), code.trim().toUpperCase());
        }}
      >
        <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>

        {roomId === undefined && (
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 uppercase tracking-[0.2em]"
            />
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2"
          />
        </label>

        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!ready}
          className="m-0 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
