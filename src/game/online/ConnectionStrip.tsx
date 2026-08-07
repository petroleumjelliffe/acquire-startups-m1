import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '../../net/connection';

/**
 * How long a connect may take before it is worth explaining.
 *
 * Short enough that nobody watches an unexplained pill for long; long enough
 * that an ordinary blip — a laptop lid, a tunnel — never triggers the longer
 * copy and makes a two-second reconnect sound like a thirty-second one.
 */
const EXPLAIN_AFTER_MS = 3000;

/**
 * Whether this device has a network at all.
 *
 * `navigator.onLine` is a one-way signal and is used as one: **false is
 * definitive** — there is no network, so nothing about the server can be
 * true yet — while **true only means an interface is up**, not that the
 * server is reachable. That asymmetry is exactly what is wanted here. The
 * pill may only blame the server when the device is at least on a network.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    // Read again on mount: the events only fire on a *change*, so a component
    // mounted while already offline would otherwise believe the initial
    // `navigator.onLine` read from before it existed.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}

/**
 * Connection state, and only inside the room.
 *
 * Its predecessor was fixed across every route, which put a bar over the top
 * of pass-and-play and the catalog — neither of which has a server to be
 * disconnected from. A centred pill rather than a full-width bar, because the
 * board underneath it is the thing the player is trying to read.
 *
 * Three things it can say, and the distinction between the last two was found
 * by hand, on a phone, with its wifi switched off:
 *
 * - **No network.** The device itself is offline. Nothing else can be said
 *   honestly, because no claim about the server has been tested.
 * - **The server may be waking.** We are on a network and the connect is
 *   taking longer than an ordinary blip. The free Render tier sleeps after
 *   fifteen minutes and takes about thirty seconds to wake (DEPLOYMENT.md),
 *   which is the case worth naming — a player who knows that waits, and a
 *   player watching "Connecting…" for half a minute assumes it is broken.
 * - **Connecting / reconnecting.** The ordinary short wait.
 *
 * Saying "waking the server" while the device has no network was the bug: it
 * asserted a cause that had not been established, about a server the device
 * had not even tried to reach.
 */
export function ConnectionStrip({ status }: { status: ConnectionStatus }) {
  const [slow, setSlow] = useState(false);
  const online = useOnline();

  // Declared above the early return, because hooks cannot run conditionally.
  useEffect(() => {
    if (status === 'open') {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), EXPLAIN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'open') return null;

  // Offline outranks the timer. A device with no network has not been waiting
  // on the server at all, however long it has been waiting.
  const message = !online
    ? 'No network — waiting for this device to reconnect'
    : slow
      ? 'Waking the server — this can take up to 30 seconds'
      : status === 'connecting' ? 'Connecting…' : 'Disconnected — reconnecting…';

  return (
    <div
      data-testid="connection-strip"
      role="status"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
    >
      {message}
    </div>
  );
}
