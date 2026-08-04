/**
 * The pass-and-play curtain: covers the board between turns on a shared device
 * so the next player does not see the previous player's hand, and clears on a
 * single button.
 *
 * This is the one place the lab's "show the same thing to all players"
 * principle is deliberately broken — and the principle does not transfer past
 * pass-and-play, where each player has their own screen.
 */
export interface RevealOverlayProps {
  playerName: string;
  emoji?: string;
  onReveal: () => void;
}

export function RevealOverlay({ playerName, emoji, onReveal }: RevealOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/95">
      {emoji && <span className="text-4xl leading-none">{emoji}</span>}
      <div className="text-lg font-bold text-gray-800">{`Pass to ${playerName}`}</div>
      <button
        type="button"
        onClick={onReveal}
        className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {`I'm ${playerName} — Reveal`}
      </button>
    </div>
  );
}
