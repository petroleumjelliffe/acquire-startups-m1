/**
 * Whose turn it is, said so you cannot miss it.
 *
 * Pass-and-play never needs this: the curtain between turns *is* the
 * announcement, and it covers the whole screen with the next player's name on
 * it. Online there is no curtain — everyone watches the same board the whole
 * time — and the first by-hand session found the gap immediately: the only
 * signal that it was someone else's turn was one line of grey text in the
 * panel, and the report was "I can't see whose turn it is."
 *
 * It sits at the top centre, clear of both columns: the board is centred in
 * the left column and its top row must stay readable, and the panel's own
 * controls run down the right. `pointer-events-none` so it can never eat a
 * click meant for the tile underneath it.
 */
export interface TurnToastProps {
  /** The player being waited on. */
  name: string;
  emoji?: string;
}

/**
 * Deliberately no "…is placing a tile".
 *
 * A watcher's state only advances when a segment commits, so a stage label
 * shown here is frozen at whatever the last commit said — it would sit on
 * "Buy shares" through the whole of someone's next placement, claiming to be
 * live while being stale. Who is up *is* live: it changes on exactly the
 * commits this client receives.
 */
export function TurnToast({ name, emoji }: TurnToastProps) {
  return (
    <div
      data-testid="turn-toast"
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow-lg"
    >
      <span aria-hidden className="text-base leading-none">{emoji || '•'}</span>
      <span>{`${name} is up`}</span>
    </div>
  );
}
